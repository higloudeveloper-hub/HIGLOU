import { NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { requireUser } from "@/lib/auth/require-user";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import {
  checkRateLimit,
  clientKeyFromRequest,
} from "@/lib/api/rate-limit";
import { fetchWalmartProduct } from "@/lib/walmart/fetch-product";
import { mirrorWalmartImages } from "@/lib/walmart/mirror-images";
import { upgradeWalmartImage } from "@/lib/walmart/parse-product";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  url: z.string().min(8).max(2000),
  html: z.string().max(6_000_000).optional(),
});

export async function POST(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: "Sign in to import from Walmart." },
        { status: 503 },
      );
    }

    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const rate = checkRateLimit({
      key: `walmart:${clientKeyFromRequest(request, auth.user.id)}`,
      limit: 8,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many Walmart imports. Wait a minute and try again." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000) || 1),
          },
        },
      );
    }

    let url = "";
    let html = "";
    try {
      const body = bodySchema.parse(await request.json());
      url = body.url;
      html = body.html?.trim() || "";
    } catch {
      return NextResponse.json(
        { error: "Send JSON { url } with a Walmart product link." },
        { status: 400 },
      );
    }

    const product = await fetchWalmartProduct(url, {
      pageHtml: html || undefined,
      pageOrigin: new URL(request.url).origin,
    });

    let mirrored: Array<{
      publicUrl: string;
      storagePath: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    }> = [];
    try {
      mirrored = await mirrorWalmartImages({
        imageUrls: product.imageUrls,
        userId: auth.user.id,
        itemId: product.itemId,
      });
    } catch {
      mirrored = [];
    }

    const images = mirrored.length
      ? mirrored.map((img, index) => ({
          id: nanoid(),
          url: img.publicUrl,
          storagePath: img.storagePath,
          fileName: img.fileName,
          sortOrder: index,
          isPrimary: index === 0,
          mimeType: img.mimeType,
          sizeBytes: img.sizeBytes,
        }))
      : product.imageUrls
          .map((row) => upgradeWalmartImage(row) || row)
          .filter((row) => /^https:\/\//i.test(row))
          .map((row, index) => ({
            id: nanoid(),
            url: row,
            storagePath: "",
            fileName: `${product.itemId}-${index + 1}.jpg`,
            sortOrder: index,
            isPrimary: index === 0,
            mimeType: "image/jpeg",
            sizeBytes: 0,
          }));

    if (!images.length) {
      return NextResponse.json(
        {
          error:
            "Walmart photos could not be saved. Drop the photos instead, or try the link again.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      itemId: product.itemId,
      walmartUrl: product.url,
      title: product.title,
      brand: product.brand,
      model: product.model,
      price: product.price,
      upc: product.upc,
      features: product.features,
      sku: `WM-${product.itemId}`,
      images,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Walmart import failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
