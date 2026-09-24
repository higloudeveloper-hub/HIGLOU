import { amazonAsinImageCandidates, amazonAsinPrimaryImage } from "@/lib/amazon/asin-image";
import type { OpportunityProduct } from "@/lib/opportunity/types";

/**
 * Normalize a Keepa / ledger row into something RON can affiliate + publish.
 * Ledger payloads are often partial — never drop a valid ASIN.
 */
export function normalizeRonHit(
  raw: Partial<OpportunityProduct> & {
    asin?: string | null;
    image_url?: string | null;
    title?: string | null;
    brand?: string | null;
    net_profit?: number | null;
  },
): OpportunityProduct | null {
  const asin = String(raw.asin || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) return null;

  const imageFromHit = String(
    raw.imageUrl || raw.image_url || "",
  ).trim();
  const imageUrl =
    (/^https?:\/\//i.test(imageFromHit) && imageFromHit) ||
    amazonAsinPrimaryImage(asin);

  const title =
    String(raw.title || raw.ebayTitle || "").trim() || `Deal ${asin}`;
  const brand = String(raw.brand || "").trim();

  return {
    ...(raw as OpportunityProduct),
    asin,
    title,
    brand,
    imageUrl,
    mode: raw.mode || "amazon",
    sourceMarket: raw.sourceMarket || "amazon",
    sourceId: raw.sourceId || asin,
    destMarket: raw.destMarket || "ebay",
    // Ledger Amazon rows are Keepa-sourced — mark so affiliate minting accepts them
    keepa: raw.keepa === true || raw.mode === "amazon" || Boolean(raw.bsrDrops90),
    amazonPrice: raw.amazonPrice ?? raw.buyBoxPrice ?? null,
    buyBoxPrice: raw.buyBoxPrice ?? raw.amazonPrice ?? null,
    netProfit: raw.netProfit ?? raw.net_profit ?? null,
    score: Number(raw.score) || 0,
    opportunity: raw.opportunity || "now",
  } as OpportunityProduct;
}

/** Primary + fallback Amazon image URLs for Facebook rehost. */
export function ronImagePack(asin: string, preferred?: string | null): {
  imageUrl: string;
  imageFallbacks: string[];
} {
  const preferredClean = String(preferred || "").trim();
  const candidates = [
    ...( /^https?:\/\//i.test(preferredClean) ? [preferredClean] : []),
    ...amazonAsinImageCandidates(asin),
  ];
  const unique = [...new Set(candidates.filter((u) => /^https?:\/\//i.test(u)))];
  return {
    imageUrl: unique[0] || amazonAsinPrimaryImage(asin),
    imageFallbacks: unique.slice(0, 6),
  };
}
