import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { marketSpread, type MarketDrop } from "@/lib/market/catalog";
import {
  asinFromWinnerDropId,
  opportunityToMarketDrop,
} from "@/lib/market/from-opportunity";
import { isPlatformWinner } from "@/lib/opportunity/platform-winner";
import { logMonetizationEvent } from "@/lib/monetization/observability";
import {
  productBodySchema,
  syncRelated,
  toDbColumns,
} from "@/lib/products/persistence";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { OpportunityProduct } from "@/lib/opportunity/types";

export const runtime = "nodejs";

const bodySchema = z.object({
  dropId: z.string().min(2).max(64),
  /** Client snapshot when the winner lives in local ledger only. */
  product: z
    .object({
      asin: z.string().min(10).max(12).optional(),
      title: z.string().max(500).optional(),
      brand: z.string().max(120).optional(),
      imageUrl: z.string().max(2000).optional(),
      amazonPrice: z.number().nullable().optional(),
      buyBoxPrice: z.number().nullable().optional(),
      ebayPrice: z.number().nullable().optional(),
      ebayActiveLow: z.number().nullable().optional(),
      ebayActiveMedian: z.number().nullable().optional(),
      cost: z.number().nullable().optional(),
      buy: z.number().nullable().optional(),
      sell: z.number().nullable().optional(),
      comps: z.number().nullable().optional(),
      blurb: z.string().max(500).optional(),
      supplier: z.string().max(120).optional(),
      ships: z.string().max(200).optional(),
      heat: z.enum(["hot", "warm", "fresh"]).optional(),
      lane: z.enum(["arbitrage", "amazon", "retail"]).optional(),
      netProfit: z.number().nullable().optional(),
      hypotheticalKeep: z.number().nullable().optional(),
      mode: z.string().max(40).optional(),
      keepa: z.boolean().optional(),
      bsrDrops90: z.number().nullable().optional(),
      salesRank: z.number().nullable().optional(),
      avgSalesRank90: z.number().nullable().optional(),
      sellerCount: z.number().nullable().optional(),
      amazonRetail: z.boolean().optional(),
      rating: z.number().nullable().optional(),
      reviewCount: z.number().nullable().optional(),
      score: z.number().nullable().optional(),
      verdict: z.string().max(40).optional(),
      sourceMarket: z.string().max(40).optional(),
      sourceId: z.string().max(80).optional(),
      upc: z.string().max(32).optional(),
    })
    .optional(),
});

type ProductSnap = NonNullable<z.infer<typeof bodySchema>["product"]>;

/** Floor tile already passed Find Winners — draft from prices even if re-gate is thin. */
function dropFromTileSnapshot(
  dropId: string,
  asin: string,
  snap: ProductSnap,
): MarketDrop | null {
  const buy =
    (snap.buy != null && snap.buy > 0 ? snap.buy : null) ??
    (snap.cost != null && snap.cost > 0 ? snap.cost : null) ??
    (snap.buyBoxPrice != null && snap.buyBoxPrice > 0
      ? snap.buyBoxPrice
      : null) ??
    (snap.amazonPrice != null && snap.amazonPrice > 0
      ? snap.amazonPrice
      : null);
  const sell =
    (snap.sell != null && snap.sell > 0 ? snap.sell : null) ??
    (snap.ebayActiveLow != null && snap.ebayActiveLow > 0
      ? snap.ebayActiveLow
      : null) ??
    (snap.ebayPrice != null && snap.ebayPrice > 0 ? snap.ebayPrice : null) ??
    (snap.buyBoxPrice != null && snap.buyBoxPrice > 0
      ? snap.buyBoxPrice
      : null) ??
    (snap.amazonPrice != null && snap.amazonPrice > 0
      ? snap.amazonPrice
      : null);
  const title = String(snap.title || "").trim();
  if (buy == null || sell == null || !title) return null;

  const photo = String(snap.imageUrl || "").trim();
  const id = /^win-/i.test(dropId) ? dropId.toLowerCase() : `win-${asin}`;
  return {
    id,
    name: String(snap.brand || "").trim() || "Higlou Market",
    title,
    blurb:
      String(snap.blurb || "").trim() ||
      "Verified Market drop · confirm cost before publish",
    photo:
      photo ||
      "https://m.media-amazon.com/images/I/01RmK+J4pJL._AC_SL1500_.jpg",
    photos: photo ? [photo] : [],
    buy: Math.round(buy * 100) / 100,
    sell: Math.round(sell * 100) / 100,
    comps:
      snap.comps != null && snap.comps > 0
        ? Math.round(snap.comps * 100) / 100
        : Math.round(sell * 1.06 * 100) / 100,
    supplier: String(snap.supplier || "").trim() || "Higlou Market",
    ships: String(snap.ships || "").trim() || "Verified by Higlou Find Winners",
    heat: snap.heat || "fresh",
    asin,
  };
}

function hitFromSnapshot(
  asin: string,
  snap: ProductSnap,
): OpportunityProduct {
  return {
    asin,
    title: snap.title || "",
    brand: snap.brand || "",
    imageUrl: snap.imageUrl || "",
    amazonPrice: snap.amazonPrice ?? snap.buyBoxPrice ?? null,
    buyBoxPrice: snap.buyBoxPrice ?? snap.amazonPrice ?? null,
    ebayPrice: snap.ebayPrice ?? null,
    ebayActiveLow: snap.ebayActiveLow ?? null,
    ebayActiveMedian: snap.ebayActiveMedian ?? null,
    cost: snap.cost ?? snap.amazonPrice ?? snap.buyBoxPrice ?? null,
    netProfit: snap.netProfit ?? null,
    hypotheticalKeep: snap.hypotheticalKeep ?? snap.netProfit ?? null,
    mode: (snap.mode as OpportunityProduct["mode"]) || "amazon_to_ebay",
    keepa: Boolean(snap.keepa),
    bsrDrops90: snap.bsrDrops90 ?? null,
    salesRank: snap.salesRank ?? null,
    avgSalesRank90: snap.avgSalesRank90 ?? null,
    sellerCount: snap.sellerCount ?? null,
    amazonRetail: Boolean(snap.amazonRetail),
    rating: snap.rating ?? null,
    reviewCount: snap.reviewCount ?? null,
    score: snap.score ?? 0,
    verdict: (snap.verdict as OpportunityProduct["verdict"]) || "candidate",
    sourceMarket:
      (snap.sourceMarket as OpportunityProduct["sourceMarket"]) || "amazon",
    sourceId: snap.sourceId || "",
    upc: snap.upc || "",
  } as OpportunityProduct;
}

async function resolveFromLedger(
  userId: string,
  asin: string,
): Promise<MarketDrop | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("opportunity_ledger")
      .select(
        "payload, net_profit, amazon_price, ebay_price, title, brand, image_url, mode",
      )
      .eq("user_id", userId)
      .eq("asin", asin)
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const payload = {
      ...(data.payload as OpportunityProduct),
      asin,
      mode:
        (data.payload as OpportunityProduct)?.mode ||
        (data.mode as OpportunityProduct["mode"]) ||
        "amazon_to_ebay",
      title: (data.payload as OpportunityProduct)?.title || data.title || "",
      brand: (data.payload as OpportunityProduct)?.brand || data.brand || "",
      imageUrl:
        (data.payload as OpportunityProduct)?.imageUrl || data.image_url || "",
      amazonPrice:
        (data.payload as OpportunityProduct)?.amazonPrice ??
        (data.amazon_price != null ? Number(data.amazon_price) : null),
      buyBoxPrice:
        (data.payload as OpportunityProduct)?.buyBoxPrice ??
        (data.amazon_price != null ? Number(data.amazon_price) : null),
      ebayPrice:
        (data.payload as OpportunityProduct)?.ebayPrice ??
        (data.ebay_price != null ? Number(data.ebay_price) : null),
      netProfit:
        (data.payload as OpportunityProduct)?.netProfit ??
        (data.net_profit != null ? Number(data.net_profit) : null),
      keepa: Boolean((data.payload as OpportunityProduct)?.keepa),
    } as OpportunityProduct;
    if (!isPlatformWinner(payload, payload.mode || "amazon_to_ebay")) {
      return null;
    }
    return opportunityToMarketDrop(payload);
  } catch {
    return null;
  }
}

/** One-click: clone a market / winners drop into the user's listing library. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Send { dropId }" }, { status: 400 });
  }

  const asin =
    asinFromWinnerDropId(body.dropId) ||
    String(body.product?.asin || "")
      .trim()
      .toUpperCase() ||
    null;

  let drop: MarketDrop | null = null;
  if (asin && /^[A-Z0-9]{10}$/.test(asin)) {
    drop = await resolveFromLedger(auth.user.id, asin);
    if (!drop && body.product) {
      const hit = hitFromSnapshot(asin, body.product);
      if (isPlatformWinner(hit, hit.mode || "amazon_to_ebay")) {
        drop = opportunityToMarketDrop(hit);
      }
      // Tile already on the floor — draft from buy/sell even if Keepa re-gate is thin.
      if (!drop) {
        drop = dropFromTileSnapshot(body.dropId, asin, body.product);
      }
    }
  }

  if (!drop) {
    return NextResponse.json(
      {
        error:
          "Winner not found — open Find Winners, scan again, then Add to store",
      },
      { status: 404 },
    );
  }

  const images = [drop.photo, ...drop.photos]
    .filter(Boolean)
    .filter((url, i, arr) => arr.indexOf(url) === i)
    .slice(0, 8)
    .map((publicUrl, index) => ({
      publicUrl,
      storagePath: `market/${drop.id}/${index}`,
      fileName: `${drop.id}-${index}.jpg`,
      sortOrder: index,
      isPrimary: index === 0,
      mimeType: "image/jpeg",
      sizeBytes: 0,
    }));

  const brand = drop.asin ? drop.name : "Higlou Market";
  const payload = productBodySchema.parse({
    title: drop.title,
    brand,
    sku: drop.asin
      ? `WIN-${drop.asin}`
      : `MKT-${drop.id.toUpperCase().slice(0, 20)}`,
    amazonAsin: drop.asin || "",
    condition: "New",
    conditionId: "NEW",
    price: drop.sell,
    quantity: 1,
    listingFormat: "FixedPrice",
    descriptionSummary: drop.blurb,
    descriptionHtml: `<p>${drop.blurb}</p><p>Supplier: ${drop.supplier}. ${drop.ships}.</p><p><em>Est. cost $${drop.buy} · suggested list $${drop.sell}. Spread is an estimate — verify before publish.</em></p>${drop.asin ? `<p>ASIN: ${drop.asin}</p>` : ""}`,
    productType: drop.name,
    status: "Uploaded",
    itemLocation: "United States",
    handlingTime: 2,
    country: "US",
    features: [
      `${drop.ships}`,
      `Est. supplier cost $${drop.buy}`,
      drop.asin ? `ASIN ${drop.asin}` : "Ready draft from Higlou Market",
    ],
    images,
    itemSpecifics: [
      { key: "Brand", label: "Brand", value: brand },
      { key: "Type", label: "Type", value: drop.name },
      {
        key: "C:MarketDrop",
        label: "Market drop",
        value: drop.id,
        isCustom: true,
      },
      ...(drop.asin
        ? [
            {
              key: "C:ASIN",
              label: "ASIN",
              value: drop.asin,
              isCustom: true,
            },
          ]
        : []),
    ],
  });

  const columns = toDbColumns(payload);
  const { data: inserted, error } = await auth.supabase
    .from("products")
    .insert({
      ...columns,
      user_id: auth.user.id,
    })
    .select("*")
    .single();

  if (error || !inserted) {
    return NextResponse.json(
      { error: error?.message || "Could not add drop to your store" },
      { status: 500 },
    );
  }

  try {
    await syncRelated(auth.supabase, auth.user.id, inserted.id, payload);
  } catch (relatedError) {
    console.error("market claim image sync failed", relatedError);
  }

  logMonetizationEvent({
    level: "info",
    event: "market_drop_claimed",
    detail: {
      userId: auth.user.id,
      dropId: drop.id,
      asin: drop.asin || null,
      productId: inserted.id,
      spread: marketSpread(drop),
    },
  });

  return NextResponse.json(
    {
      ok: true,
      productId: inserted.id,
      href: `/listings/${inserted.id}`,
      dropId: drop.id,
      asin: drop.asin || null,
      spread: marketSpread(drop),
      note: "Verified winner draft — confirm cost and comps before publish",
    },
    { status: 201 },
  );
}
