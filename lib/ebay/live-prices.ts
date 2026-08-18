import { getEbayConfig } from "@/lib/ebay/config";

function medianOf(nums: number[]) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

/** Live eBay asking prices for a product name. Needs the seller eBay token. */
export async function searchEbayLivePrices(opts: {
  accessToken: string;
  query: string;
}): Promise<{ median: number | null; count: number; low: number | null }> {
  const q = String(opts.query || "")
    .split(/[^a-z0-9]+/i)
    .filter((word) => word.length > 2)
    .slice(0, 8)
    .join(" ");
  if (!q) return { median: null, count: 0, low: null };
  const cfg = getEbayConfig();
  const filter = encodeURIComponent("buyingOptions:{FIXED_PRICE}");
  const res = await fetch(
    `${cfg.apiBase}/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=20&filter=${filter}`,
    {
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        Accept: "application/json",
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    },
  );
  if (!res.ok) return { median: null, count: 0, low: null };
  const json = (await res.json()) as {
    itemSummaries?: Array<{ price?: { value?: string } }>;
  };
  const prices: number[] = [];
  for (const item of json.itemSummaries ?? []) {
    const n = Number(item.price?.value);
    if (Number.isFinite(n) && n > 1) prices.push(n);
  }
  const median = medianOf(prices);
  const low = prices.length ? Math.min(...prices) : null;
  return { median, count: prices.length, low };
}
