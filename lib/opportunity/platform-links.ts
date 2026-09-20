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

/** Browse active asks for this product when we do not have a single item id. */
export function ebaySearchUrl(
  title?: string | null,
  brand?: string | null,
): string | null {
  const q = buildEbaySearchQuery(String(title || ""), brand || undefined);
  if (!q) return null;
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

/** Prefer product page; fall back to eBay search so sellers can always open comps. */
export function buildPlatformUrls(
  hit: Partial<
    Pick<
      OpportunityProduct,
      | "asin"
      | "title"
      | "brand"
      | "upc"
      | "sourceMarket"
      | "sourceId"
      | "platformUrls"
    >
  > & {
    walmartItemId?: string | null;
    ebayItemId?: string | null;
    homedepotItemId?: string | null;
  },
  quotes?: PlatformPriceQuote[] | null,
): PlatformUrls {
  const fromQuotes = new Map<PlatformKey, string>();
  for (const q of quotes || []) {
    const u = cleanUrl(q.url);
    if (u) fromQuotes.set(q.platform, u);
  }

  const sourceId = String(hit.sourceId || "").trim();
  let walmart =
    fromQuotes.get("walmart") ||
    walmartProductUrl(hit.walmartItemId) ||
    (hit.sourceMarket === "walmart" ? walmartProductUrl(sourceId) : null) ||
    hit.platformUrls?.walmart ||
    null;
  let homedepot =
    fromQuotes.get("homedepot") ||
    homeDepotProductUrl(hit.homedepotItemId) ||
    (hit.sourceMarket === "homedepot"
      ? homeDepotProductUrl(sourceId)
      : null) ||
    hit.platformUrls?.homedepot ||
    null;

  const amazon =
    fromQuotes.get("amazon") ||
    amazonProductUrl(hit.asin) ||
    hit.platformUrls?.amazon ||
    null;

  const ebay =
    fromQuotes.get("ebay") ||
    ebayItemUrl(hit.ebayItemId) ||
    hit.platformUrls?.ebay ||
    ebaySearchUrl(hit.title, hit.brand) ||
    null;

  // UPC search pages when we only have a barcode (retail discovery).
  const upc = String(hit.upc || "").replace(/\D/g, "");
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
