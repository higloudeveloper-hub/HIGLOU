import { buildEbaySearchQuery } from "@/lib/ebay/live-prices";
import type { OpportunityProduct } from "@/lib/opportunity/types";
import type { PlatformPriceQuote } from "@/lib/opportunity/cross-platform";

export type PlatformKey = "amazon" | "ebay" | "walmart" | "homedepot";

export type PlatformUrls = {
  amazon: string | null;
  ebay: string | null;
  walmart: string | null;
  homedepot: string | null;
};

export const EMPTY_PLATFORM_URLS: PlatformUrls = {
  amazon: null,
  ebay: null,
  walmart: null,
  homedepot: null,
};

export function amazonProductUrl(asin?: string | null): string | null {
  const a = String(asin || "")
    .trim()
    .toUpperCase();
  return /^[A-Z0-9]{10}$/.test(a) ? `https://www.amazon.com/dp/${a}` : null;
}

export function ebayItemUrl(itemId?: string | null): string | null {
  const id = String(itemId || "").replace(/\D/g, "");
  return id.length >= 9 ? `https://www.ebay.com/itm/${id}` : null;
}

/**
 * Exact-first eBay search: UPC → brand+MPN → brand+model.
 * Never a vague marketing title alone (that opens "similar" junk).
 */
export function ebaySearchUrl(
  title?: string | null,
  brand?: string | null,
  extras?: { mpn?: string | null; upc?: string | null; model?: string | null },
): string | null {
  const upc = String(extras?.upc || "").replace(/\D/g, "");
  if (upc.length >= 12) {
    return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(upc)}&rt=nc&LH_BIN=1`;
  }
  const mpn = String(extras?.mpn || extras?.model || "").trim();
  const brandWord = String(brand || "").trim();
  if (brandWord && mpn) {
    const q = `${brandWord} ${mpn}`.trim();
    return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&rt=nc&LH_BIN=1`;
  }
  const q = buildEbaySearchQuery(String(title || ""), brand || undefined, mpn || undefined);
  if (!q || q.split(/\s+/).length < 2) return null;
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&rt=nc&LH_BIN=1`;
}

export function walmartProductUrl(itemId?: string | null): string | null {
  const id = String(itemId || "").replace(/\D/g, "");
  return id ? `https://www.walmart.com/ip/${id}` : null;
}

export function homeDepotProductUrl(itemId?: string | null): string | null {
  const id = String(itemId || "").replace(/\D/g, "");
  return id ? `https://www.homedepot.com/p/${id}` : null;
}

function cleanUrl(url?: string | null): string | null {
  const u = String(url || "").trim();
  if (!u) return null;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/** True when the URL is a product page (not a broad search). */
export function isExactProductUrl(
  platform: PlatformKey,
  url?: string | null,
): boolean {
  const u = String(url || "");
  if (!u) return false;
  switch (platform) {
    case "amazon":
      return /amazon\.com\/(?:dp|gp\/product)\//i.test(u);
    case "ebay":
      return /ebay\.com\/itm\//i.test(u);
    case "walmart":
      return /walmart\.com\/ip\//i.test(u);
    case "homedepot":
      return /homedepot\.com\/p\//i.test(u);
    default:
      return false;
  }
}

function quoteIsTrusted(q: PlatformPriceQuote): boolean {
  if (q.matchedBy === "upc" || q.matchedBy === "asin" || q.matchedBy === "source") {
    return Boolean(cleanUrl(q.url));
  }
  // Title matches only count when they resolved to a concrete product page.
  return isExactProductUrl(q.platform, q.url);
}

type LinkHit = Partial<
  Pick<
    OpportunityProduct,
    | "asin"
    | "title"
    | "brand"
    | "upc"
    | "mpn"
    | "sourceMarket"
    | "sourceId"
    | "platformUrls"
  >
> & {
  walmartItemId?: string | null;
  ebayItemId?: string | null;
  homedepotItemId?: string | null;
  model?: string | null;
};

/**
 * Prefer confirmed product pages (ASIN / item id / UPC match).
 * Search fallbacks use UPC or brand+MPN — never a vague title that opens lookalikes.
 */
export function buildPlatformUrls(
  hit: LinkHit,
  quotes?: PlatformPriceQuote[] | null,
): PlatformUrls {
  const fromQuotes = new Map<PlatformKey, string>();
  for (const q of quotes || []) {
    if (!quoteIsTrusted(q)) continue;
    const u = cleanUrl(q.url);
    if (u) fromQuotes.set(q.platform, u);
  }

  const sourceId = String(hit.sourceId || "").trim();
  const upc = String(hit.upc || "").replace(/\D/g, "");
  const mpn = String(hit.mpn || hit.model || "").trim();
  const brand = String(hit.brand || "").trim();

  let walmart =
    fromQuotes.get("walmart") ||
    walmartProductUrl(hit.walmartItemId) ||
    (hit.sourceMarket === "walmart" ? walmartProductUrl(sourceId) : null) ||
    (isExactProductUrl("walmart", hit.platformUrls?.walmart)
      ? hit.platformUrls?.walmart || null
      : null) ||
    null;

  let homedepot =
    fromQuotes.get("homedepot") ||
    homeDepotProductUrl(hit.homedepotItemId) ||
    (hit.sourceMarket === "homedepot"
      ? homeDepotProductUrl(sourceId)
      : null) ||
    (isExactProductUrl("homedepot", hit.platformUrls?.homedepot)
      ? hit.platformUrls?.homedepot || null
      : null) ||
    null;

  const amazon =
    fromQuotes.get("amazon") ||
    amazonProductUrl(hit.asin) ||
    (isExactProductUrl("amazon", hit.platformUrls?.amazon)
      ? hit.platformUrls?.amazon || null
      : null) ||
    null;

  let ebay =
    fromQuotes.get("ebay") ||
    ebayItemUrl(hit.ebayItemId) ||
    (isExactProductUrl("ebay", hit.platformUrls?.ebay)
      ? hit.platformUrls?.ebay || null
      : null) ||
    null;

  // Exact-ish discovery only — UPC / brand+MPN search pages.
  if (!ebay) {
    ebay = ebaySearchUrl(hit.title, brand, { mpn, upc, model: hit.model });
  }
  if (!walmart && upc.length >= 12) {
    walmart = `https://www.walmart.com/search?q=${encodeURIComponent(upc)}`;
  }
  if (!homedepot && upc.length >= 12) {
    homedepot = `https://www.homedepot.com/s/${encodeURIComponent(upc)}`;
  }

  return { amazon, ebay, walmart, homedepot };
}

export function withPlatformUrls<T extends OpportunityProduct>(
  hit: T,
  quotes?: PlatformPriceQuote[] | null,
): T {
  return {
    ...hit,
    platformUrls: buildPlatformUrls(hit, quotes),
  };
}

export const PLATFORM_LINK_LABELS: Record<PlatformKey, string> = {
  amazon: "Ver en Amazon",
  ebay: "Ver en eBay",
  walmart: "Ver en Walmart",
  homedepot: "Ver en Home Depot",
};
