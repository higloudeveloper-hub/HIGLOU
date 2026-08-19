import { getEbayConfig } from "@/lib/ebay/config";

function medianOf(nums: number[]) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

export type EbayActiveListings = {
  median: number | null;
  count: number;
  low: number | null;
  kind: "active_listings";
  sampleTitle: string;
  matchedByGtin: boolean;
};

async function browseSearch(
  accessToken: string,
  params: string,
): Promise<EbayActiveListings> {
  const empty: EbayActiveListings = {
    median: null,
    count: 0,
    low: null,
    kind: "active_listings",
    sampleTitle: "",
    matchedByGtin: false,
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
    itemSummaries?: Array<{ title?: string; price?: { value?: string } }>;
  };
  const prices: number[] = [];
  let sampleTitle = "";
  for (const item of json.itemSummaries ?? []) {
    const n = Number(item.price?.value);
    if (Number.isFinite(n) && n > 1) prices.push(n);
    if (!sampleTitle && item.title) sampleTitle = String(item.title);
  }
  const median = medianOf(prices);
  const low = prices.length ? Math.min(...prices) : null;
  return { median, count: prices.length, low, kind: "active_listings", sampleTitle, matchedByGtin: false };
}

/** Live eBay asking prices. These are active listings, not completed sales. */
export async function searchEbayLivePrices(opts: {
  accessToken: string;
  query: string;
  gtin?: string;
}): Promise<EbayActiveListings> {
  const gtin = String(opts.gtin || "").replace(/\D/g, "");
  if (gtin.length === 12 || gtin.length === 13) {
    const byGtin = await browseSearch(
      opts.accessToken,
      `gtin=${encodeURIComponent(gtin)}&limit=20`,
    );
    if (byGtin.count) return { ...byGtin, matchedByGtin: true };
  }
  const q = String(opts.query || "")
    .split(/[^a-z0-9]+/i)
    .filter((word) => word.length > 2)
    .slice(0, 8)
    .join(" ");
  if (!q) {
    return {
      median: null,
      count: 0,
      low: null,
      kind: "active_listings",
      sampleTitle: "",
      matchedByGtin: false,
    };
  }
  const filter = encodeURIComponent("buyingOptions:{FIXED_PRICE}");
  return browseSearch(
    opts.accessToken,
    `q=${encodeURIComponent(q)}&limit=20&filter=${filter}`,
  );
}
