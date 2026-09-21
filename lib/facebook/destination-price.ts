/**
 * Price shown on a Facebook promo must match the click destination
 * (Amazon buy box / eBay listing), never the arbitrage "sell" or cost spread.
 */

export type PromoDestination = "amazon" | "ebay" | "other";

const ASIN_RE = /\b([A-Z0-9]{10})\b/i;
const EBAY_ITEM_RE = /(?:ebay\.(?:com|co\.uk|ca|de|fr|it|es)|ebay\.com\.au)\/itm\/(?:[^/?#]+\/)?(\d{6,20})/i;

export function detectPromoDestination(linkUrl: string): PromoDestination {
  const raw = String(linkUrl || "").trim();
  if (!raw) return "other";
  let host = "";
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return "other";
  }
  if (
    host.includes("amazon.") ||
    host === "amzn.to" ||
    host.endsWith(".amzn.to") ||
    /\/dp\/|\/gp\/product\//i.test(raw)
  ) {
    return "amazon";
  }
  if (host.includes("ebay.") || /\/itm\//i.test(raw)) {
    return "ebay";
  }
  return "other";
}

/** ASIN from an Amazon product URL (or bare ASIN in path). */
export function extractAsinFromUrl(linkUrl: string): string | null {
  const raw = String(linkUrl || "").trim();
  if (!raw) return null;
  const dp = raw.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  if (dp?.[1]) return dp[1].toUpperCase();
  const bare = raw.match(ASIN_RE);
  if (bare?.[1] && detectPromoDestination(raw) === "amazon") {
    return bare[1].toUpperCase();
  }
  return null;
}

export function extractEbayItemIdFromUrl(linkUrl: string): string | null {
  const m = String(linkUrl || "").match(EBAY_ITEM_RE);
  return m?.[1] || null;
}

export function formatPromoPriceLabel(
  n: number | null | undefined,
): string | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * Pick the price that shoppers will see on the destination page.
 * Prefer platform-specific quotes; never fall back to arbitrage sell
 * when the link opens Amazon.
 */
export function priceForPromoDestination(opts: {
  linkUrl: string;
  amazonPrice?: number | null;
  ebayPrice?: number | null;
  /** Only safe when the link is the seller's own eBay listing */
  listingPrice?: number | null;
}): number | null {
  const dest = detectPromoDestination(opts.linkUrl);
  if (dest === "amazon") {
    const p = opts.amazonPrice;
    return p != null && Number.isFinite(p) && p > 0 ? p : null;
  }
  if (dest === "ebay") {
    const p = opts.ebayPrice ?? opts.listingPrice;
    return p != null && Number.isFinite(p) && p > 0 ? p : null;
  }
  return null;
}

export function promoPriceLabelForLink(opts: {
  linkUrl: string;
  amazonPrice?: number | null;
  ebayPrice?: number | null;
  listingPrice?: number | null;
}): string | null {
  return formatPromoPriceLabel(priceForPromoDestination(opts));
}
