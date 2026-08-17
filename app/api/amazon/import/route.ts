import { NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { requireUser } from "@/lib/auth/require-user";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import {
  checkRateLimit,
  clientKeyFromRequest,
} from "@/lib/api/rate-limit";
import { fetchAmazonProduct } from "@/lib/amazon/fetch-product";
import { mirrorAmazonImages } from "@/lib/amazon/mirror-images";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  url: z.string().min(8).max(2000),
});

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Sign in to import from Amazon." },
      { status: 503 },
    );
  }

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const rate = checkRateLimit({
    key: `amazon:${clientKeyFromRequest(request, auth.user.id)}`,
    limit: 8,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many Amazon imports. Wait a minute and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000) || 1) },
      },
    );
  }

  let url = "";
  try {
    url = bodySchema.parse(await request.json()).url;
  } catch {
    return NextResponse.json(
      { error: "Send JSON { url } with an Amazon product link." },
      { status: 400 },
    );
  }

  try {
    const product = await fetchAmazonProduct(url, {
      pageOrigin: new URL(request.url).origin,
    });
    const images = await mirrorAmazonImages({
      imageUrls: product.imageUrls,
      userId: auth.user.id,
      asin: product.asin,
    });
    if (!images.length) {
      return NextResponse.json(
        {
          error:
            "Amazon photos could not be saved. Drop the photos instead, or try the link again.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      asin: product.asin,
      amazonUrl: product.url,
      title: product.title,
      brand: product.brand,
      price: product.price,
      upc: product.upc,
      features: product.features,
      sku: `AMZ-${product.asin}`,
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
      error instanceof Error ? error.message : "Amazon import failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
