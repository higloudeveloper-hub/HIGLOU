import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import {
  checkRateLimit,
  clientKeyFromRequest,
} from "@/lib/api/rate-limit";
import { loadWinnerMarketTokens } from "@/lib/amazon/winner-tokens";
import { ebayProfitPrice } from "@/lib/amazon/winner-rank";
import {
  productBodySchema,
  syncRelated,
  toDbColumns,
} from "@/lib/products/persistence";
import { ebayReadyImportFields } from "@/lib/opportunity/ebay-ready";
import { toEbayListingTitle } from "@/lib/ebay/listing-helpers";
import {
  importAmazonCatalogProduct,
  toWizardImages,
} from "@/lib/amazon/complete-import";
import { resolveEbayCategory } from "@/config/ebay-categories";
import {
  buildListingDescriptionHtml,
  synthesizeDescriptionSummary,
} from "@/lib/ebay/description-html";
import { STORE_BRANDING_DEFAULTS } from "@/config/store-branding";

export const runtime = "nodejs";
export const maxDuration = 120;

const cardSchema = z.object({
  asin: z.string().min(10).max(12),
  title: z.string().max(500).optional().default(""),
  brand: z.string().max(120).optional().default(""),
  imageUrl: z.preprocess(
    (value) => String(value ?? ""),
    z.string().max(4000).optional().default(""),
  ),
  amazonPrice: z.preprocess((value) => {
    if (value == null || value === "") return null;
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  }, z.number().nullable().optional()),
  ebayPrice: z.preprocess((value) => {
    if (value == null || value === "") return null;
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  }, z.number().nullable().optional()),
});

const bodySchema = z.object({
  query: z.string().max(200).optional().default(""),
  category: z.string().max(120).optional().default(""),
  asins: z.array(z.string().min(10).max(12)).max(5).optional().default([]),
  cards: z.array(cardSchema).max(5).optional().default([]),
  ebayPrice: z.number().positive().max(100000).optional(),
  mode: z
    .enum(["amazon", "amazon_to_ebay", "supplier"])
    .optional()
    .default("amazon_to_ebay"),
});

type WinnerCardHint = z.infer<typeof cardSchema>;

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

function listingFromDraft(
  draft: Awaited<ReturnType<typeof importAmazonCatalogProduct>>,
  mode: "amazon" | "amazon_to_ebay" | "supplier",
  ebayPrice: number | undefined,
  hint?: WinnerCardHint,
): ImportedListing {
  const price =
    mode === "amazon"
      ? draft.price ?? hint?.amazonPrice ?? null
      : ebayProfitPrice(
          draft.price ?? hint?.amazonPrice ?? null,
          ebayPrice ?? hint?.ebayPrice ?? undefined,
        );
  const wizardImages = toWizardImages(draft.images);
  return {
    asin: draft.asin,
    amazonUrl: draft.amazonUrl,
    title: toEbayListingTitle(draft.title) || hint?.title || draft.brand || draft.asin,
    brand: draft.brand || hint?.brand || "",
    price,
    upc: draft.upc,
    features: draft.features,
    sku: draft.sku,
    rating: null,
    reviewCount: null,
    images: wizardImages,
    dbImages: draft.images,
  };
}

async function importAsin(
  asin: string,
  ebayPrice: number | undefined,
  userId: string,
  pageOrigin: string,
  mode: "amazon" | "amazon_to_ebay" | "supplier",
  hint?: WinnerCardHint,
): Promise<ImportedListing> {
  const draft = await importAmazonCatalogProduct({
    url: `https://www.amazon.com/dp/${asin}`,
    userId,
    pageOrigin,
    fallbackTitle: hint?.title,
    fallbackBrand: hint?.brand,
    fallbackImageUrl: hint?.imageUrl,
    fallbackPrice: hint?.amazonPrice ?? null,
  });
  return listingFromDraft(draft, mode, ebayPrice, hint);
}

async function analyzeWinnerListing(
  item: ImportedListing,
  ctx: { userId: string; supabase: import("@supabase/supabase-js").SupabaseClient },
) {
  const catalog = resolveEbayCategory({
    title: item.title,
    brand: item.brand,
    features: item.features,
    productType: item.title,
  });
  const base = {
    title: item.title,
    brand: item.brand,
    model: "",
    mpn: "",
    upc: item.upc,
    categoryId: catalog.categoryId,
    categoryName: catalog.categoryName,
    condition: "New",
    conditionId: "1000",
    price: item.price,
    size: "",
    productType: "",
    colors: [] as string[],
    materials: [] as string[],
    features: item.features,
    descriptionSummary: synthesizeDescriptionSummary({
      title: item.title,
      brand: item.brand,
      features: item.features,
      condition: "New",
    }),
    descriptionHtml: "",
    itemSpecifics: [
      { key: "C:ASIN", label: "ASIN", value: item.asin },
      ...(item.brand
        ? [{ key: "C:Brand", label: "Brand", value: item.brand }]
        : []),
    ],
  };
  base.descriptionHtml = buildListingDescriptionHtml(
    {
      title: base.title,
      brand: base.brand,
      features: base.features,
      descriptionSummary: base.descriptionSummary,
      condition: "New",
    },
    STORE_BRANDING_DEFAULTS,
  );

  const imageUrls = item.dbImages
    .map((img) => img.publicUrl)
    .filter((url) => /^https:\/\//i.test(url))
    .slice(0, 4);
  if (!imageUrls.length || !process.env.OPENAI_API_KEY) return base;

  try {
    const { analyzeProductHybrid } = await import("@/lib/ai/analyze-product");
    const result = await analyzeProductHybrid({
      imageUrls,
      productHints: {
        brand: item.brand,
        upc: item.upc,
        categoryId: catalog.categoryId,
        categoryName: catalog.categoryName,
        condition: "New",
        notes: item.features.slice(0, 8).join(" · "),
      },
      analysisTier: "economy",
      userId: ctx.userId,
      supabase: ctx.supabase,
    });
    const analysis = result.analysis;
    const title =
      toEbayListingTitle(analysis.title || "") || item.title;
    const features = analysis.features.length
      ? analysis.features
      : item.features;
    const category = resolveEbayCategory({
      categoryId: analysis.categoryId || catalog.categoryId,
      categoryName: analysis.categoryName || catalog.categoryName,
      productType: analysis.type || title,
      title,
      brand: analysis.brand || item.brand,
      materials: analysis.materials,
      features,
    });
    const summary =
      analysis.descriptionSummary ||
      synthesizeDescriptionSummary({
        title,
        brand: analysis.brand || item.brand,
        features,
        condition: analysis.condition || "New",
      });
    const specifics = analysis.itemSpecifics.length
      ? analysis.itemSpecifics.map((field) => ({
          key: field.key.startsWith("C:") ? field.key : `C:${field.key}`,
          label: field.label || field.key.replace(/^C:/, ""),
          value: field.value,
        }))
      : base.itemSpecifics;
    if (
      !specifics.some((field) =>
        /^(asin|amazon\s*asin)$/i.test(String(field.label || "").replace(/^C:/, "")),
      )
    ) {
      specifics.unshift({ key: "C:ASIN", label: "ASIN", value: item.asin });
    }
    return {
      title,
      brand: analysis.brand || item.brand,
      model: analysis.model || "",
      mpn: analysis.mpn || "",
      upc: analysis.upc || item.upc,
      categoryId: category.categoryId,
      categoryName: category.categoryName,
      condition: analysis.condition || "New",
      conditionId: analysis.conditionId || "1000",
      price: item.price ?? analysis.price,
      size: analysis.size || "",
      productType: analysis.type || "",
      colors: analysis.colors,
      materials: analysis.materials,
      features,
      descriptionSummary: summary,
      descriptionHtml: buildListingDescriptionHtml(
        {
          title,
          brand: analysis.brand || item.brand,
          features,
          descriptionSummary: summary,
          condition: analysis.condition || "New",
        },
        STORE_BRANDING_DEFAULTS,
      ),
      itemSpecifics: specifics,
    };
  } catch {
    return base;
  }
}

export async function POST(request: Request) {
  try {
    return await postWinnerImport(request);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Import failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function postWinnerImport(request: Request) {
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
    limit: 10,
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
      const { findAmazonWinners } = await import("@/lib/amazon/find-winners");
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
  const hints = new Map(
    (body.cards || []).map((card) => [card.asin.trim().toUpperCase(), card]),
  );

  for (const asin of asins) {
    try {
      imported.push(
        await importAsin(
          asin,
          body.ebayPrice,
          auth.user.id,
          origin,
          body.mode,
          hints.get(asin),
        ),
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

  const tokens = await loadWinnerMarketTokens(auth.supabase, auth.user.id);
  const saved: Array<{ id: string; asin: string; title: string }> = [];

  for (const item of imported) {
    try {
      const analyzed = await analyzeWinnerListing(item, {
        userId: auth.user.id,
        supabase: auth.supabase,
      });
      const ready = await ebayReadyImportFields({
        title: analyzed.title,
        brand: analyzed.brand,
        features: analyzed.features,
        ebayToken: tokens.ebayToken,
        userId: auth.user.id,
        supabase: auth.supabase,
        fast: false,
      });
      const categoryId = analyzed.categoryId || ready.categoryId;
      const categoryName =
        analyzed.categoryName || ready.categoryName || body.category;
      const data = productBodySchema.parse({
        title: toEbayListingTitle(analyzed.title) || item.brand || item.asin,
        brand: analyzed.brand,
        model: analyzed.model,
        sku: item.sku,
        amazonAsin: item.asin,
        upc: analyzed.upc || item.upc,
        mpn: analyzed.mpn,
        categoryId,
        categoryName,
        condition: analyzed.condition || "New",
        conditionId:
          analyzed.conditionId && /^\d+$/.test(analyzed.conditionId)
            ? analyzed.conditionId
            : "1000",
        price: item.price ?? analyzed.price,
        quantity: 1,
        size: analyzed.size,
        productType: analyzed.productType,
        colors: analyzed.colors,
        materials: analyzed.materials,
        features: analyzed.features,
        status: categoryId && item.dbImages.length ? "Ready" : "Needs Review",
        descriptionSummary:
          analyzed.descriptionSummary || ready.descriptionSummary,
        descriptionHtml: analyzed.descriptionHtml || ready.descriptionHtml,
        itemLocation: ready.itemLocation,
        postalCode: ready.postalCode,
        country: ready.country,
        handlingTime: ready.handlingTime,
        packageWeightLbs: ready.packageWeightLbs,
        packageWeightOz: ready.packageWeightOz,
        packageLengthIn: ready.packageLengthIn,
        packageWidthIn: ready.packageWidthIn,
        packageDepthIn: ready.packageDepthIn,
        packageSource: ready.packageSource,
        itemSpecifics: analyzed.itemSpecifics,
        images: item.dbImages.filter((img) => {
          try {
            const parsed = new URL(img.publicUrl);
            return parsed.protocol === "http:" || parsed.protocol === "https:";
          } catch {
            return false;
          }
        }),
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
          error instanceof Error
            ? error.message
            : "Could not save that listing.",
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
