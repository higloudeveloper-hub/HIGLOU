import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { resolveEbayCategory } from "@/config/ebay-categories";
import { loadWinnerMarketTokens } from "@/lib/amazon/winner-tokens";
import { marketSpread, type MarketDrop } from "@/lib/market/catalog";
import {
  asinFromWinnerDropId,
  opportunityToMarketDrop,
} from "@/lib/market/from-opportunity";
import { ebayReadyImportFields } from "@/lib/opportunity/ebay-ready";
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
export const maxDuration = 60;

const PLACEHOLDER =
  "https://m.media-amazon.com/images/I/01RmK+J4pJL._AC_SL1500_.jpg";

type LooseSnap = Record<string, unknown>;

function num(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (v == null || v === "") continue;
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100;
  }
  return null;
}

function str(v: unknown, max = 500): string {
  return String(v ?? "")
    .trim()
    .slice(0, max);
}

function extractAsin(dropId: string, snap?: LooseSnap): string | null {
  const fromId = asinFromWinnerDropId(dropId);
  if (fromId) return fromId;
  const m = String(dropId || "")
    .trim()
    .toUpperCase()
    .match(/(?:^WIN-|[/\-_=])([A-Z0-9]{10})$/);
  if (m?.[1]) return m[1];
  const fromSnap = str(snap?.asin, 12).toUpperCase();
  if (/^[A-Z0-9]{10}$/.test(fromSnap)) return fromSnap;
  return null;
}

function hitFromSnapshot(asin: string, snap: LooseSnap): OpportunityProduct {
  return {
    asin,
    title: str(snap.title),
    brand: str(snap.brand, 120),
    imageUrl: str(snap.imageUrl, 2000),
    amazonPrice: num(snap.amazonPrice, snap.buyBoxPrice, snap.buy),
    buyBoxPrice: num(snap.buyBoxPrice, snap.amazonPrice, snap.buy),
    ebayPrice: num(snap.ebayPrice, snap.ebayActiveLow, snap.sell),
    ebayActiveLow: num(snap.ebayActiveLow, snap.ebayPrice, snap.sell),
    ebayActiveMedian: num(snap.ebayActiveMedian),
    cost: num(snap.cost, snap.buy, snap.amazonPrice, snap.buyBoxPrice),
    netProfit: num(snap.netProfit),
    hypotheticalKeep: num(snap.hypotheticalKeep, snap.netProfit),
    mode: (str(snap.mode, 40) as OpportunityProduct["mode"]) || "amazon_to_ebay",
    keepa: Boolean(snap.keepa ?? true),
    bsrDrops90: num(snap.bsrDrops90),
    salesRank: num(snap.salesRank),
    avgSalesRank90: num(snap.avgSalesRank90, snap.salesRank),
    sellerCount: num(snap.sellerCount),
    amazonRetail: Boolean(snap.amazonRetail),
    rating: num(snap.rating),
    reviewCount: num(snap.reviewCount),
    score: num(snap.score) ?? 0,
    verdict:
      (str(snap.verdict, 40) as OpportunityProduct["verdict"]) || "candidate",
    sourceMarket:
      (str(snap.sourceMarket, 40) as OpportunityProduct["sourceMarket"]) ||
      "amazon",
    sourceId: str(snap.sourceId, 80),
    upc: str(snap.upc, 32),
  } as OpportunityProduct;
}

/** Always build a draftable drop from floor tile numbers — never 404 a visible deal. */
function dropFromLoose(
  dropId: string,
  asin: string,
  snap: LooseSnap,
): MarketDrop {
  const buy =
    num(snap.buy, snap.cost, snap.buyBoxPrice, snap.amazonPrice) ?? 1;
  const sell =
    num(
      snap.sell,
      snap.ebayActiveLow,
      snap.ebayPrice,
      snap.buyBoxPrice,
      snap.amazonPrice,
      buy,
    ) ?? buy;
  const photo = str(snap.imageUrl, 2000);
  const title = str(snap.title) || `Amazon ${asin}`;
  const heatRaw = str(snap.heat, 10);
  const heat =
    heatRaw === "hot" || heatRaw === "warm" || heatRaw === "fresh"
      ? heatRaw
      : "fresh";
  return {
    id: /^win-/i.test(dropId) ? dropId.toLowerCase() : `win-${asin}`,
    name: str(snap.brand, 120) || "Higlou Market",
    title,
    blurb:
      str(snap.blurb) ||
      "Verified Market drop · confirm cost before publish",
    photo: photo || PLACEHOLDER,
    photos: photo ? [photo] : [],
    buy,
    sell,
    comps: num(snap.comps) ?? Math.round(sell * 1.06 * 100) / 100,
    supplier: str(snap.supplier, 120) || "Higlou Market",
    ships: str(snap.ships, 200) || "Verified by Higlou Find Winners",
    heat,
    asin,
  };
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

  let raw: LooseSnap = {};
  try {
    raw = (await request.json()) as LooseSnap;
  } catch {
    return NextResponse.json({ error: "Send { dropId }" }, { status: 400 });
  }

  const dropId = str(raw.dropId, 64);
  if (dropId.length < 2) {
    return NextResponse.json({ error: "Send { dropId }" }, { status: 400 });
  }

  const snap: LooseSnap =
    raw.product && typeof raw.product === "object"
      ? (raw.product as LooseSnap)
      : {};

  const asin = extractAsin(dropId, snap);
  if (!asin) {
    return NextResponse.json(
      {
        error:
          "Missing ASIN — open Find Winners, scan again, then Add to store",
      },
      { status: 404 },
    );
  }

  let drop: MarketDrop | null = await resolveFromLedger(auth.user.id, asin);

  if (!drop && Object.keys(snap).length > 0) {
    const hit = hitFromSnapshot(asin, snap);
    if (isPlatformWinner(hit, hit.mode || "amazon_to_ebay")) {
      drop = opportunityToMarketDrop(hit);
    }
  }

  // Visible floor tile → always draftable (local ledger / thin Keepa re-gate).
  if (!drop) {
    drop = dropFromLoose(dropId, asin, snap);
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
  const features = [
    `${drop.ships}`,
    `Est. supplier cost $${drop.buy}`,
    drop.asin ? `ASIN ${drop.asin}` : "Ready draft from Higlou Market",
  ];

  // Resolve a real eBay leaf category — Market imports were skipping this.
  const tokens = await loadWinnerMarketTokens(auth.supabase, auth.user.id);
  const ready = await ebayReadyImportFields({
    title: drop.title,
    brand,
    features,
    ebayToken: tokens.ebayToken,
    userId: auth.user.id,
    supabase: auth.supabase,
    fast: !tokens.ebayToken,
  });
  const catalog = resolveEbayCategory({
    categoryId: ready.categoryId,
    categoryName: ready.categoryName,
    title: drop.title,
    brand,
    features,
    productType: drop.name,
  });
  const categoryId = catalog.categoryId || ready.categoryId || "";
  const categoryName = catalog.categoryName || ready.categoryName || "";

  let payload;
  try {
    payload = productBodySchema.parse({
      title: drop.title,
      brand,
      sku: drop.asin
        ? `WIN-${drop.asin}`
        : `MKT-${drop.id.toUpperCase().slice(0, 20)}`,
      amazonAsin: drop.asin || "",
      condition: "New",
      conditionId: "1000",
      price: drop.sell,
      quantity: 1,
      listingFormat: "FixedPrice",
      categoryId,
      categoryName,
      descriptionSummary: ready.descriptionSummary || drop.blurb,
      descriptionHtml:
        ready.descriptionHtml ||
        `<p>${drop.blurb}</p><p>Supplier: ${drop.supplier}. ${drop.ships}.</p><p><em>Est. cost $${drop.buy} · suggested list $${drop.sell}. Spread is an estimate — verify before publish.</em></p>${drop.asin ? `<p>ASIN: ${drop.asin}</p>` : ""}`,
      productType: drop.name,
      status: categoryId ? "Uploaded" : "Needs Review",
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
      features,
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
        ...(categoryId
          ? [
              {
                key: "C:EbayCategory",
                label: "eBay category",
                value: categoryName
                  ? `${categoryName} (${categoryId})`
                  : categoryId,
                isCustom: true,
              },
            ]
          : []),
      ],
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not build listing from this drop",
      },
      { status: 400 },
    );
  }

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
      categoryId: categoryId || null,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      productId: inserted.id,
      href: `/listings/${inserted.id}`,
      dropId: drop.id,
      asin: drop.asin || null,
      categoryId: categoryId || null,
      categoryName: categoryName || null,
      spread: marketSpread(drop),
      note: categoryId
        ? "Verified winner draft · eBay category assigned — confirm cost before publish"
        : "Verified winner draft — pick an eBay leaf category before publish",
    },
    { status: 201 },
  );
}
