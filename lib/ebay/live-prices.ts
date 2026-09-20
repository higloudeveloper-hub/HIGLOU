import { getEbayConfig } from "@/lib/ebay/config";

function medianOf(nums: number[]) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

function percentile(nums: number[], p: number) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * p)),
  );
  return sorted[idx] ?? null;
}

export type EbayActiveListings = {
  median: number | null;
  count: number;
  low: number | null;
  p25: number | null;
  kind: "active_listings";
  sampleTitle: string;
  matchedByGtin: boolean;
  /** First matching active listing page when Browse returns one. */
  sampleItemUrl: string;
  sampleItemId: string;
};

const STOP = new Set([
  "with",
  "for",
  "and",
  "the",
  "pack",
  "set",
  "of",
  "in",
  "to",
  "a",
  "an",
  "by",
  "from",
  "new",
  "free",
  "shipping",
  "pcs",
  "pc",
  "count",
  "amazon",
  "exclusive",
]);

/** Brand + concrete title tokens — better eBay hit rate than raw Amazon titles. */
export function buildEbaySearchQuery(
  title: string,
  brand?: string,
  modelOrMpn?: string,
): string {
  const model = String(modelOrMpn || "").trim();
  const brandWord = String(brand || "").trim();
  const parts: string[] = [];
  if (brandWord) parts.push(brandWord);
  if (model && model.toLowerCase() !== brandWord.toLowerCase()) {
    parts.push(model);
  }

  // Keep hyphen catalog codes intact (e.g. Milwaukee 48-73-1430).
  const catalogCodes = String(title || "").match(/\b\d{2,4}-\d{2,4}-\d{2,6}\b/g) || [];
  for (const code of catalogCodes) {
    if (!parts.some((p) => p === code)) parts.push(code);
  }

  const words = String(title || "")
    .split(/[^a-z0-9]+/i)
    .map((w) => w.trim())
    .filter((w) => {
      if (!w) return false;
      if (STOP.has(w.toLowerCase())) return false;
      if (/^\d+$/.test(w)) return w.length >= 3; // keep model digits
      return w.length > 1;
    });

  for (const w of words) {
    if (parts.some((p) => p.toLowerCase() === w.toLowerCase())) continue;
    parts.push(w);
    if (parts.length >= 8) break;
  }
  return parts.join(" ").trim().slice(0, 80);
}

function sanePrices(prices: number[], amazonHint?: number | null): number[] {
  const amazon = amazonHint && amazonHint > 0 ? amazonHint : null;
  if (!amazon) return prices.filter((n) => n > 1 && n < 5000);
  const lo = amazon * 0.85;
  const hi = amazon * 3.8;
  const filtered = prices.filter((n) => n >= lo && n <= hi);
  // If the filter wiped everything, keep raw — better a noisy ask than silence.
  return filtered.length ? filtered : prices.filter((n) => n > 1 && n < 5000);
}

async function browseSearch(
  accessToken: string,
  params: string,
  amazonHint?: number | null,
): Promise<EbayActiveListings> {
  const empty: EbayActiveListings = {
    median: null,
    count: 0,
    low: null,
    p25: null,
    kind: "active_listings",
    sampleTitle: "",
    matchedByGtin: false,
    sampleItemUrl: "",
    sampleItemId: "",
  };
  const cfg = getEbayConfig();
  const res = await fetch(
    `${cfg.apiBase}/buy/browse/v1/item_summary/search?${params}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    },
  );
  if (!res.ok) return empty;
  const json = (await res.json()) as {
    itemSummaries?: Array<{
      title?: string;
      price?: { value?: string };
      itemId?: string;
      itemWebUrl?: string;
      legacyItemId?: string;
    }>;
  };
  const raw: number[] = [];
  let sampleTitle = "";
  let sampleItemUrl = "";
  let sampleItemId = "";
  for (const item of json.itemSummaries ?? []) {
    const n = Number(item.price?.value);
    if (Number.isFinite(n) && n > 1) raw.push(n);
    if (!sampleTitle && item.title) sampleTitle = String(item.title);
    if (!sampleItemUrl) {
      const web = String(item.itemWebUrl || "").trim();
      const legacy = String(item.legacyItemId || "").replace(/\D/g, "");
      const rawId = String(item.itemId || "").replace(/[^\w|]/g, "");
      if (web.startsWith("http")) {
        sampleItemUrl = web;
        sampleItemId = legacy || rawId;
      } else if (legacy.length >= 9) {
        sampleItemUrl = `https://www.ebay.com/itm/${legacy}`;
        sampleItemId = legacy;
      }
    }
  }
  const prices = sanePrices(raw, amazonHint);
  const median = medianOf(prices);
  const low = prices.length ? Math.min(...prices) : null;
  const p25 = percentile(prices, 0.25);
  return {
    median,
    count: prices.length,
    low,
    p25,
    kind: "active_listings",
    sampleTitle,
    matchedByGtin: false,
    sampleItemUrl,
    sampleItemId,
  };
}

/** Live eBay asking prices. These are active listings, not completed sales. */
export async function searchEbayLivePrices(opts: {
  accessToken: string;
  query: string;
  brand?: string;
  model?: string;
  mpn?: string;
  gtin?: string;
  amazonPrice?: number | null;
}): Promise<EbayActiveListings> {
  const empty: EbayActiveListings = {
    median: null,
    count: 0,
    low: null,
    p25: null,
    kind: "active_listings",
    sampleTitle: "",
    matchedByGtin: false,
    sampleItemUrl: "",
    sampleItemId: "",
  };
  const gtin = String(opts.gtin || "").replace(/\D/g, "");
  if (gtin.length === 12 || gtin.length === 13) {
    const byGtin = await browseSearch(
      opts.accessToken,
      `gtin=${encodeURIComponent(gtin)}&limit=40`,
      opts.amazonPrice,
    );
    if (byGtin.count) return { ...byGtin, matchedByGtin: true };
  }

  const modelHint = String(opts.mpn || opts.model || "").trim();
  const queries = [
    buildEbaySearchQuery(opts.query, opts.brand, modelHint),
    buildEbaySearchQuery(opts.query, opts.brand),
  ].filter((q, i, arr) => q && arr.indexOf(q) === i);

  // Extra short brand+model when title is noisy.
  if (opts.brand && modelHint) {
    const short = `${opts.brand} ${modelHint}`.trim().slice(0, 80);
    if (short && !queries.includes(short)) queries.unshift(short);
  }

  let best = empty;
  for (const q of queries.slice(0, 3)) {
    const filter = encodeURIComponent(
      "buyingOptions:{FIXED_PRICE},conditions:{NEW}",
    );
    const primary = await browseSearch(
      opts.accessToken,
      `q=${encodeURIComponent(q)}&limit=40&filter=${filter}`,
      opts.amazonPrice,
    );
    if (primary.count > best.count) best = primary;
    if (primary.count >= 5) return primary;

    const loose = await browseSearch(
      opts.accessToken,
      `q=${encodeURIComponent(q)}&limit=40&filter=${encodeURIComponent("buyingOptions:{FIXED_PRICE}")}`,
      opts.amazonPrice,
    );
    if (loose.count > best.count) best = loose;
    if (loose.count >= 5) return loose;
  }
  return best;
}
