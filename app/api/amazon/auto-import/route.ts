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
import { findAmazonWinners } from "@/lib/amazon/find-winners";
import { loadWinnerMarketTokens } from "@/lib/amazon/winner-tokens";
import { ebayProfitPrice } from "@/lib/amazon/winner-rank";
import {
  productBodySchema,
  syncRelated,
  toDbColumns,
} from "@/lib/products/persistence";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  query: z.string().max(200).optional().default(""),
  category: z.string().max(120).optional().default(""),
  asins: z.array(z.string().min(10).max(12)).max(5).optional().default([]),
  ebayPrice: z.number().positive().max(100000).optional(),
  mode: z
    .enum(["amazon", "amazon_to_ebay", "supplier"])
    .optional()
    .default("amazon_to_ebay"),
});

type ImportedListing = {
  asin: string;
  amazonUrl: string;
  title: string;
  brand: string;
    price: number | null;
  upc: string;
  features: string[];
  sku: string;
  rating: number | null;
  reviewCount: number | null;
  images: Array<{
    id: string;
    url: string;
    storagePath: string;
    fileName: string;
    sortOrder: number;
    isPrimary: boolean;
    mimeType: string;
    sizeBytes: number;
  }>;
  dbImages: Array<{
    publicUrl: string;
    storagePath: string;
    fileName: string;
    sortOrder: number;
    isPrimary: boolean;
    mimeType: string;
    sizeBytes: number;
  }>;
};

async function importAsin(
  asin: string,
  ebayPrice: number | undefined,
  userId: string,
  pageOrigin: string,
  mode: "amazon" | "amazon_to_ebay" | "supplier",
): Promise<ImportedListing> {
  const product = await fetchAmazonProduct(`https://www.amazon.com/dp/${asin}`, {
    pageOrigin,
  });
  const images = await mirrorAmazonImages({
    imageUrls: product.imageUrls,
    userId,
    asin: product.asin,
  });
  if (!images.length) {
    throw new Error("Amazon photos could not be saved.");
  }
  const price =
    mode === "amazon"
      ? product.price
      : ebayProfitPrice(product.price, ebayPrice);
  const dbImages = images.map((img, index) => ({
    publicUrl: img.publicUrl,
    storagePath: img.storagePath,
    fileName: img.fileName,
    sortOrder: index,
    isPrimary: index === 0,
    mimeType: img.mimeType,
    sizeBytes: img.sizeBytes,
  }));
  return {
    asin: product.asin,
    amazonUrl: product.url,
    title: product.title,
    brand: product.brand,
    price,
    upc: product.upc,
    features: product.features,
    sku: `AMZ-${product.asin}`,
    rating: product.rating,
    reviewCount: product.reviewCount,
    images: dbImages.map((img) => ({
      id: nanoid(),
      url: img.publicUrl,
      storagePath: img.storagePath,
      fileName: img.fileName,
      sortOrder: img.sortOrder,
      isPrimary: img.isPrimary,
      mimeType: img.mimeType,
      sizeBytes: img.sizeBytes,
    })),
    dbImages,
  };
}

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
    key: `amazon-auto-import:${clientKeyFromRequest(request, auth.user.id)}`,
    limit: 4,
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

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Send JSON { query } or { asins }." },
      { status: 400 },
    );
  }

  let asins = [
    ...new Set(
      (body.asins || [])
        .map((value) => value.trim().toUpperCase())
        .filter((value) => /^[A-Z0-9]{10}$/.test(value)),
    ),
  ].slice(0, 5);
  const query = body.query.trim();
  const category = body.category.trim();

  if (!asins.length) {
    if (!query && !category) {
      return NextResponse.json(
        { error: "Type the product you want Higlou to find." },
        { status: 400 },
      );
    }
    try {
      const tokens = await loadWinnerMarketTokens(auth.supabase, auth.user.id);
      const found = await findAmazonWinners({
        query,
        category,
        limit: 5,
        pageOrigin: new URL(request.url).origin,
        amazonToken: tokens.amazonToken,
        marketplaceId: tokens.marketplaceId,
        sellingPartnerId: tokens.sellingPartnerId,
        ebayToken: tokens.ebayToken,
        mode: "amazon_to_ebay",
        onlySellable: true,
      });
      asins = found.products.map((hit) => hit.asin);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Amazon search failed";
      return NextResponse.json({ error: message }, { status: 422 });
    }
  }

  if (!asins.length) {
    return NextResponse.json(
      {
        error:
          "Amazon found no well-reviewed winners for that. Try a clearer product name.",
      },
      { status: 404 },
    );
  }

  const origin = new URL(request.url).origin;
  const imported: ImportedListing[] = [];
  const skipped: Array<{ asin: string; reason: string }> = [];

  for (const asin of asins) {
    try {
      imported.push(
        await importAsin(asin, body.ebayPrice, auth.user.id, origin, body.mode),
      );
    } catch (error) {
      skipped.push({
        asin,
        reason:
          error instanceof Error ? error.message : "Amazon import failed",
      });
    }
  }

  if (!imported.length) {
    return NextResponse.json(
      {
        error: skipped[0]?.reason || "Amazon import failed",
        skipped,
      },
      { status: 422 },
    );
  }

  const saved: Array<{ id: string; asin: string; title: string }> = [];

  for (const item of imported) {
    try {
      const data = productBodySchema.parse({
        title: item.title.slice(0, 80),
        brand: item.brand,
        sku: item.sku,
        amazonAsin: item.asin,
        upc: item.upc,
        categoryName: body.category,
        condition: "New",
        conditionId: "NEW",
        price: item.price,
        quantity: 1,
        features: item.features,
        status: "Uploaded",
        itemSpecifics: [
          { key: "C:ASIN", label: "ASIN", value: item.asin },
        ],
        images: item.dbImages,
      });
      const { data: inserted, error } = await auth.supabase
        .from("products")
        .insert({
          ...toDbColumns(data),
          user_id: auth.user.id,
        })
        .select("id")
        .single();
      if (error || !inserted) {
        skipped.push({
          asin: item.asin,
          reason: error?.message || "Could not save listing",
        });
        continue;
      }
      await syncRelated(auth.supabase, auth.user.id, inserted.id, data);
      saved.push({
        id: String(inserted.id),
        asin: item.asin,
        title: item.title,
      });
    } catch (error) {
      skipped.push({
        asin: item.asin,
        reason:
          error instanceof Error ? error.message : "Could not save listing",
      });
    }
  }

  if (!saved.length) {
    return NextResponse.json(
      {
        error: skipped[0]?.reason || "Could not save listing",
        skipped,
      },
      { status: 422 },
    );
  }

  const [primarySaved, ...savedExtras] = saved;
  const primary =
    imported.find((row) => row.asin === primarySaved.asin) ?? imported[0];

  return NextResponse.json({
    ok: true,
    id: primarySaved.id,
    asin: primary.asin,
    amazonUrl: primary.amazonUrl,
    title: primary.title,
    brand: primary.brand,
    price: primary.price,
    upc: primary.upc,
    features: primary.features,
    sku: primary.sku,
    rating: primary.rating,
    reviewCount: primary.reviewCount,
    images: primary.images,
    extras: savedExtras,
    skipped,
    mode: body.mode,
  });
}
