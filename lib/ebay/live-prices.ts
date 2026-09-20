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
]);

/** Brand + concrete title tokens — better eBay hit rate than raw Amazon titles. */
export function buildEbaySearchQuery(title: string, brand?: string): string {
  const words = String(title || "")
    .split(/[^a-z0-9]+/i)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !STOP.has(w.toLowerCase()) && !/^\d+$/.test(w));
  const core = words.slice(0, 7);
  const brandWord = String(brand || "").trim();
  if (
    brandWord &&
    brandWord.length > 1 &&
    !core.some((w) => w.toLowerCase() === brandWord.toLowerCase())
  ) {
    return `${brandWord} ${core.join(" ")}`.trim().slice(0, 80);
  }
  return core.join(" ").slice(0, 80);
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

  const q = buildEbaySearchQuery(opts.query, opts.brand);
  if (!q) return empty;

  const filter = encodeURIComponent("buyingOptions:{FIXED_PRICE},conditions:{NEW}");
  const primary = await browseSearch(
    opts.accessToken,
    `q=${encodeURIComponent(q)}&limit=40&filter=${filter}`,
    opts.amazonPrice,
  );
  if (primary.count >= 3) return primary;

  // Broader fallback without NEW filter when the tight query under-matched.
  const loose = await browseSearch(
    opts.accessToken,
    `q=${encodeURIComponent(q)}&limit=40&filter=${encodeURIComponent("buyingOptions:{FIXED_PRICE}")}`,
    opts.amazonPrice,
  );
  return loose.count > primary.count ? loose : primary;
}
