import { buildAmazonAssociatesUrl } from "@/lib/monetization/channels/affiliate";
import {
  amazonProductScore,
  amazonWinnerBlurb,
  amazonWinnerHeat,
  isAmazonProductWinner,
} from "@/lib/opportunity/amazon-product-winner";
import {
  isAmazonSellLane,
  isPlatformWinner,
  platformKeep,
  sortPlatformWinners,
} from "@/lib/opportunity/platform-winner";
import type { OpportunityProduct } from "@/lib/opportunity/types";
import { marketSpread, type MarketDrop } from "@/lib/market/catalog";

export type MarketDropPublic = MarketDrop & {
  source: "ledger" | "curated";
  real: boolean;
  affiliateUrl: string | null;
  netProfit: number | null;
  score: number | null;
  note: string;
  lane: "arbitrage" | "amazon";
  demandScore: number | null;
  bsrDrops90: number | null;
  salesRank: number | null;
};

function heatFromProfit(net: number | null): MarketDrop["heat"] {
  if (net != null && net >= 25) return "hot";
  if (net != null && net >= 12) return "warm";
  return "fresh";
}

function baseFields(
  hit: OpportunityProduct,
  asin: string,
  associateTag?: string | null,
) {
  const photo = String(hit.imageUrl || "").trim();
  const title = String(hit.title || "").trim() || `ASIN ${asin}`;
  const brand = String(hit.brand || "").trim();
  const tag = String(associateTag || "").trim();
  const affiliateUrl = tag
    ? buildAmazonAssociatesUrl({ asin, associateTag: tag })
    : null;
  return { photo, title, brand, affiliateUrl };
}

/** Map a platform-verified Find Winners hit into a market drop. */
export function opportunityToMarketDrop(
  hit: OpportunityProduct,
  associateTag?: string | null,
): MarketDropPublic | null {
  if (!isPlatformWinner(hit, hit.mode || "amazon_to_ebay")) return null;

  const asin = String(hit.asin || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) return null;

  const lane = hit.mode || "amazon_to_ebay";
  const amazonLane =
    isAmazonSellLane(lane) ||
    lane === "amazon" ||
    (lane === "supplier" && isAmazonProductWinner(hit) && !platformKeep(hit));

  if (amazonLane && isAmazonProductWinner(hit)) {
    const buyBox =
      (hit.buyBoxPrice != null && hit.buyBoxPrice > 0 ? hit.buyBoxPrice : null) ??
      (hit.amazonPrice != null && hit.amazonPrice > 0 ? hit.amazonPrice : null);
    if (buyBox == null) return null;
    const demand = amazonProductScore(hit);
    const { photo, title, brand, affiliateUrl } = baseFields(
      hit,
      asin,
      associateTag,
    );
    return {
      id: `win-${asin}`,
      name: brand || "Amazon winner",
      title,
      blurb: amazonWinnerBlurb(hit),
      photo:
        photo ||
        `https://m.media-amazon.com/images/I/01RmK+J4pJL._AC_SL1500_.jpg`,
      photos: photo ? [photo] : [],
      buy: Math.round(buyBox * 100) / 100,
      sell: Math.round(buyBox * 100) / 100,
      comps: Math.round(buyBox * 1.06 * 100) / 100,
      supplier: "Sell on Amazon",
      ships: "Keepa verified demand · Higlou Find Winners",
      heat: amazonWinnerHeat(demand),
      asin,
      source: "ledger",
      real: true,
      affiliateUrl,
      netProfit: null,
      score: demand,
      note: "Platform verified · Keepa BSR velocity + competition",
      lane: "amazon",
      demandScore: demand,
      bsrDrops90: hit.bsrDrops90 ?? null,
      salesRank: hit.avgSalesRank90 ?? hit.salesRank ?? null,
    };
  }

  const buy =
    (hit.cost != null && hit.cost > 0 ? hit.cost : null) ??
    (hit.amazonPrice != null && hit.amazonPrice > 0 ? hit.amazonPrice : null) ??
    (hit.buyBoxPrice != null && hit.buyBoxPrice > 0 ? hit.buyBoxPrice : null);
  const sell =
    (hit.ebayActiveLow != null && hit.ebayActiveLow > 0
      ? hit.ebayActiveLow
      : null) ??
    (hit.ebayActiveMedian != null && hit.ebayActiveMedian > 0
      ? hit.ebayActiveMedian
      : null) ??
    (hit.ebayPrice != null && hit.ebayPrice > 0 ? hit.ebayPrice : null);

  if (buy == null || sell == null || sell <= 0 || buy <= 0) return null;

  const keep = platformKeep(hit);
  if (keep == null || keep < 12) return null;

  const comps =
    hit.ebayActiveMedian != null && hit.ebayActiveMedian > sell
      ? hit.ebayActiveMedian
      : Math.round(sell * 1.08);

  const { photo, title, brand, affiliateUrl } = baseFields(
    hit,
    asin,
    associateTag,
  );

  return {
    id: `win-${asin}`,
    name: brand || "Winner",
    title,
    blurb: brand
      ? `${brand} · Higlou verified ask keep after fees`
      : "Higlou verified · Amazon cost vs eBay low ask after fees",
    photo:
      photo ||
      `https://m.media-amazon.com/images/I/01RmK+J4pJL._AC_SL1500_.jpg`,
    photos: photo ? [photo] : [],
    buy: Math.round(buy * 100) / 100,
    sell: Math.round(sell * 100) / 100,
    comps: Math.round(comps * 100) / 100,
    supplier: "Amazon → eBay",
    ships: "Verified by Higlou Find Winners",
    heat: heatFromProfit(keep),
    asin,
    source: "ledger",
    real: true,
    affiliateUrl,
    netProfit: Math.round(keep * 100) / 100,
    score: hit.score ?? null,
    note: "Platform verified · conservative eBay low ask after fees",
    lane: "arbitrage",
    demandScore: null,
    bsrDrops90: hit.bsrDrops90 ?? null,
    salesRank: hit.avgSalesRank90 ?? hit.salesRank ?? null,
  };
}

/** @deprecated Curated fakes are no longer stocked on Market. */
export function curatedToPublic(
  drop: MarketDrop,
  associateTag?: string | null,
): MarketDropPublic {
  const tag = String(associateTag || "").trim();
  const affiliateUrl =
    drop.asin && tag
      ? buildAmazonAssociatesUrl({ asin: drop.asin, associateTag: tag })
      : null;
  return {
    ...drop,
    source: "curated",
    real: false,
    affiliateUrl,
    netProfit: marketSpread(drop),
    score: null,
    note: "Curated showcase — disabled on live Market",
    lane: "arbitrage",
    demandScore: null,
    bsrDrops90: null,
    salesRank: null,
  };
}

/**
 * Market floor = platform winners from Find Winners only.
 * No invented catalog padding.
 */
export function mergeMarketFeed(opts: {
  ledgerHits: OpportunityProduct[];
  associateTag?: string | null;
  limit?: number;
}): {
  drops: MarketDropPublic[];
  ledgerCount: number;
  curatedCount: number;
} {
  const limit = Math.min(Math.max(opts.limit ?? 36, 1), 48);
  const seen = new Set<string>();
  const fromLedger: MarketDropPublic[] = [];

  for (const hit of sortPlatformWinners(opts.ledgerHits)) {
    const drop = opportunityToMarketDrop(hit, opts.associateTag);
    if (!drop || seen.has(drop.id)) continue;
    seen.add(drop.id);
    fromLedger.push(drop);
    if (fromLedger.length >= limit) break;
  }

  return {
    drops: fromLedger,
    ledgerCount: fromLedger.length,
    curatedCount: 0,
  };
}

export function isWinnerDropId(id: string) {
  return /^win-[A-Z0-9]{10}$/i.test(id);
}

export function asinFromWinnerDropId(id: string): string | null {
  const m = String(id || "")
    .trim()
    .toUpperCase()
    .match(/^WIN-([A-Z0-9]{10})$/);
  return m?.[1] || null;
}
