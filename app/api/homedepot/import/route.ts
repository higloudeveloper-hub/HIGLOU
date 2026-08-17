import { NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { requireUser } from "@/lib/auth/require-user";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import {
  checkRateLimit,
  clientKeyFromRequest,
} from "@/lib/api/rate-limit";
import { fetchHomeDepotProduct } from "@/lib/homedepot/fetch-product";
import { mirrorHomeDepotImages } from "@/lib/homedepot/mirror-images";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  url: z.string().min(8).max(2000),
  html: z.string().max(6_000_000).optional(),
});

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Sign in to import from Home Depot." },
      { status: 503 },
    );
  }

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const rate = checkRateLimit({
    key: `homedepot:${clientKeyFromRequest(request, auth.user.id)}`,
    limit: 8,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many Home Depot imports. Wait a minute and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000) || 1) },
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
      { error: "Send JSON { url } with a Home Depot product link." },
      { status: 400 },
    );
  }

  try {
    const product = await fetchHomeDepotProduct(url, {
      pageHtml: html || undefined,
      pageOrigin: new URL(request.url).origin,
    });
    const images = await mirrorHomeDepotImages({
      imageUrls: product.imageUrls,
      userId: auth.user.id,
      itemId: product.itemId,
    });
    if (!images.length) {
      return NextResponse.json(
        {
          error:
            "Home Depot photos could not be saved. Drop the photos instead, or try the link again.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      itemId: product.itemId,
      homeDepotUrl: product.url,
      title: product.title,
      brand: product.brand,
      model: product.model,
      price: product.price,
      upc: product.upc,
      features: product.features,
      sku: `HD-${product.itemId}`,
      images: images.map((img, index) => ({
        id: nanoid(),
        url: img.publicUrl,
        storagePath: img.storagePath,
        fileName: img.fileName,
        sortOrder: index,
        isPrimary: index === 0,
        mimeType: img.mimeType,
        sizeBytes: img.sizeBytes,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Home Depot import failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
