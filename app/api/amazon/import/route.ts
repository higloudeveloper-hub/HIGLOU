import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import {
  checkRateLimit,
  clientKeyFromRequest,
} from "@/lib/api/rate-limit";
import {
  importAmazonCatalogProduct,
  toWizardImages,
} from "@/lib/amazon/complete-import";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  url: z.string().min(8).max(2000),
});

export async function POST(request: Request) {
  try {
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
          headers: {
            "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000) || 1),
          },
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

    const product = await importAmazonCatalogProduct({
      url,
      userId: auth.user.id,
      pageOrigin: new URL(request.url).origin,
    });

    return NextResponse.json({
      ok: true,
      asin: product.asin,
      amazonUrl: product.amazonUrl,
      title: product.title,
      brand: product.brand,
      price: product.price,
      upc: product.upc,
      features: product.features,
      sku: product.sku,
      images: toWizardImages(product.images),
      variations: product.variations,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Amazon import failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
