import { amazonAsinImageCandidates } from "@/lib/amazon/asin-image";
import { isWeakFacebookPictureUrl } from "@/lib/facebook/promo-media";
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
  const candidates = [
    imageFromHit,
    ...amazonAsinImageCandidates(asin),
  ].filter(
    (u, i, arr) => Boolean(u) && /^https?:\/\//i.test(u) && arr.indexOf(u) === i,
  );
  const strong = candidates.find((u) => !isWeakFacebookPictureUrl(u));
  const imageUrl = strong || candidates[0] || "";
  // RON must not publish gray stubs — skip hits with only weak images
  if (!imageUrl || isWeakFacebookPictureUrl(imageUrl)) return null;

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
    keepa: raw.keepa === true || raw.mode === "amazon" || Boolean(raw.bsrDrops90),
    amazonPrice: raw.amazonPrice ?? raw.buyBoxPrice ?? null,
    buyBoxPrice: raw.buyBoxPrice ?? raw.amazonPrice ?? null,
    netProfit: raw.netProfit ?? raw.net_profit ?? null,
    score: Number(raw.score) || 0,
    opportunity: raw.opportunity || "now",
  } as OpportunityProduct;
}

/** Primary + fallback Amazon image URLs for Facebook rehost. */
export function ronImagePack(
  asin: string,
  preferred?: string | null,
): {
  imageUrl: string;
  imageFallbacks: string[];
} {
  const preferredClean = String(preferred || "").trim();
  const candidates = [
    ...( /^https?:\/\//i.test(preferredClean) ? [preferredClean] : []),
    ...amazonAsinImageCandidates(asin),
  ];
  const unique = [
    ...new Set(candidates.filter((u) => /^https?:\/\//i.test(u))),
  ];
  const strong = unique.filter((u) => !isWeakFacebookPictureUrl(u));
  const ordered = strong.length
    ? [...strong, ...unique.filter((u) => isWeakFacebookPictureUrl(u))]
    : unique;
  return {
    imageUrl: ordered[0] || "",
    imageFallbacks: ordered.slice(0, 6),
  };
}
