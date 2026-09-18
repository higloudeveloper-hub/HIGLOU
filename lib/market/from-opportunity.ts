import { buildAmazonAssociatesUrl } from "@/lib/monetization/channels/affiliate";
import type { OpportunityProduct } from "@/lib/opportunity/types";
import {
  MARKET_DROPS,
  marketSpread,
  type MarketDrop,
} from "@/lib/market/catalog";

export type MarketDropPublic = MarketDrop & {
  source: "ledger" | "curated";
  real: boolean;
  affiliateUrl: string | null;
  netProfit: number | null;
  score: number | null;
  note: string;
};

function heatFromProfit(net: number | null): MarketDrop["heat"] {
  if (net != null && net >= 25) return "hot";
  if (net != null && net >= 10) return "warm";
  return "fresh";
}

/** Map a Find Winners hit into a market drop (honest estimates only). */
export function opportunityToMarketDrop(
  hit: OpportunityProduct,
  associateTag?: string | null,
): MarketDropPublic | null {
  const asin = String(hit.asin || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) return null;

  const buy =
    (hit.cost != null && hit.cost > 0 ? hit.cost : null) ??
    (hit.amazonPrice != null && hit.amazonPrice > 0 ? hit.amazonPrice : null) ??
    (hit.buyBoxPrice != null && hit.buyBoxPrice > 0 ? hit.buyBoxPrice : null);
  const sell =
    (hit.ebayActiveMedian != null && hit.ebayActiveMedian > 0
      ? hit.ebayActiveMedian
      : null) ??
    (hit.ebayPrice != null && hit.ebayPrice > 0 ? hit.ebayPrice : null) ??
    (hit.salePrice != null && hit.salePrice > 0 ? hit.salePrice : null);

  if (buy == null || sell == null || sell <= 0 || buy <= 0) return null;

  const comps =
    hit.ebayActiveLow != null && hit.ebayActiveLow > sell
      ? hit.ebayActiveLow
      : Math.round(sell * 1.12);

  const photo = String(hit.imageUrl || "").trim();
  const title = String(hit.title || "").trim() || `ASIN ${asin}`;
  const brand = String(hit.brand || "").trim();
  const tag = String(associateTag || "").trim();
  const affiliateUrl = tag
    ? buildAmazonAssociatesUrl({ asin, associateTag: tag })
    : null;

  const net =
    hit.netProfit != null && Number.isFinite(hit.netProfit)
      ? hit.netProfit
      : sell - buy;

  return {
    id: `win-${asin}`,
    name: brand || "Winner",
    title,
    blurb: brand
      ? `${brand} · from your Find Winners ledger. Est. ask vs Amazon cost.`
      : "From your Find Winners ledger. Est. ask vs Amazon cost.",
    photo:
      photo ||
      `https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=80`,
    photos: photo ? [photo] : [],
    buy: Math.round(buy * 100) / 100,
    sell: Math.round(sell * 100) / 100,
    comps: Math.round(comps * 100) / 100,
    supplier: "Amazon → eBay lane",
    ships: "Buy on Amazon · list on eBay",
    heat: heatFromProfit(net),
    asin,
    source: "ledger",
    real: true,
    affiliateUrl,
    netProfit: Math.round(net * 100) / 100,
    score: hit.score ?? null,
    note: "Est. spread from live asks / Amazon cost — not sold comps",
  };
}

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
    note: "Curated showcase — verify cost before publish",
  };
}

export function mergeMarketFeed(opts: {
  ledgerHits: OpportunityProduct[];
  associateTag?: string | null;
  limit?: number;
}): {
  drops: MarketDropPublic[];
  ledgerCount: number;
  curatedCount: number;
} {
  const limit = Math.min(Math.max(opts.limit ?? 36, 12), 48);
  const seen = new Set<string>();
  const fromLedger: MarketDropPublic[] = [];

  const ranked = [...opts.ledgerHits].sort((a, b) => {
    const pa = a.netProfit ?? -Infinity;
    const pb = b.netProfit ?? -Infinity;
    if (pb !== pa) return pb - pa;
    return (b.score ?? 0) - (a.score ?? 0);
  });

  for (const hit of ranked) {
    const drop = opportunityToMarketDrop(hit, opts.associateTag);
    if (!drop || seen.has(drop.id)) continue;
    seen.add(drop.id);
    fromLedger.push(drop);
    if (fromLedger.length >= Math.min(20, limit)) break;
  }

  /** Always stock the floor with curated drops so Market feels full. */
  const curated: MarketDropPublic[] = [];
  for (const row of MARKET_DROPS) {
    const drop = curatedToPublic(row, opts.associateTag);
    if (seen.has(drop.id)) continue;
    seen.add(drop.id);
    curated.push(drop);
    if (fromLedger.length + curated.length >= limit) break;
  }

  return {
    drops: [...fromLedger, ...curated].slice(0, limit),
    ledgerCount: fromLedger.length,
    curatedCount: curated.length,
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
