import { getEbayConfig } from "@/lib/ebay/config";
import {
  emptyRouteProduct,
  enrichAmazonSide,
  finishRouteProduct,
  resolveAsinFromUpc,
} from "@/lib/opportunity/routes/finish-route";
import type {
  OpportunityProduct,
  OpportunitySources,
} from "@/lib/opportunity/types";
import { diversifyOpportunityHits, pickCategoryQueries } from "@/lib/opportunity/niches";
import { sortByRealMoney } from "@/lib/opportunity/score";
import { opportunitySearchText } from "@/lib/opportunity/categories";
import { estimateEbayReferralFee } from "@/lib/opportunity/profit";

type EbayBrowseItem = {
  itemId: string;
  title: string;
  price: number | null;
  imageUrl: string;
  gtin: string;
  brand: string;
  mpn: string;
};

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    out.push(...(await Promise.all(chunk.map(fn))));
  }
  return out;
}

function extractGtin(item: Record<string, unknown>): string {
  const dig = (v: unknown) => String(v || "").replace(/\D/g, "");
  for (const key of ["gtin", "epid"]) {
    const d = dig(item[key]);
    if (d.length === 12 || d.length === 13) return d;
  }
  const localized = item.localizedAspects;
  if (Array.isArray(localized)) {
    for (const row of localized) {
      if (!row || typeof row !== "object") continue;
      const name = String((row as { name?: string }).name || "");
      const value = dig((row as { value?: string }).value);
      if (/^(upc|ean|gtin|isbn)$/i.test(name) && (value.length === 12 || value.length === 13)) {
        return value;
      }
    }
  }
  return "";
}

async function browseEbayKeyword(
  accessToken: string,
  query: string,
): Promise<EbayBrowseItem[]> {
  const cfg = getEbayConfig();
  const q = String(query || "")
    .split(/[^a-z0-9]+/i)
    .filter((w) => w.length > 2)
    .slice(0, 8)
    .join(" ");
  if (!q) return [];
  const filter = encodeURIComponent("buyingOptions:{FIXED_PRICE},conditions:{NEW}");
  const res = await fetch(
    `${cfg.apiBase}/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=20&filter=${filter}`,
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
  if (!res.ok) return [];
  const json = (await res.json()) as {
    itemSummaries?: Array<Record<string, unknown>>;
  };
  const out: EbayBrowseItem[] = [];
  for (const item of json.itemSummaries ?? []) {
    const itemId = String(item.itemId || "").replace(/\D/g, "") || String(item.itemId || "");
    const title = String(item.title || "").trim();
    const price = Number((item.price as { value?: string } | undefined)?.value);
    const imageUrl = String(
      (item.image as { imageUrl?: string } | undefined)?.imageUrl || "",
    );
    const gtin = extractGtin(item);
    const brand = String(
      (item.brand as string) ||
        ((item as { marketingPrice?: unknown }).marketingPrice ? "" : ""),
    );
    out.push({
      itemId: itemId || title.slice(0, 24),
      title,
      price: Number.isFinite(price) && price > 0 ? price : null,
      imageUrl,
      gtin,
      brand,
      mpn: "",
    });
  }
  return out;
}

export async function findEbayToAmazonOpportunities(opts: {
  query: string;
  category?: string;
  categoryId?: string;
  limit?: number;
  amazonToken?: string;
  marketplaceId?: string;
  sellingPartnerId?: string;
  ebayToken?: string;
  seed?: number;
}): Promise<{
  products: OpportunityProduct[];
  sources: OpportunitySources;
  filteredOut: number;
  queries: string[];
  analyzed: number;
}> {
  if (!opts.ebayToken) {
    throw new Error("Connect eBay to search eBay → Amazon opportunities.");
  }
  const limit = Math.min(Math.max(opts.limit ?? 8, 1), 8);
  const fromId = opts.categoryId
    ? opportunitySearchText(opts.categoryId, opts.query)
    : { query: opts.query, category: opts.category || "", keepaRoot: "" };
  const keywords =
    String(opts.query || "").trim() ||
    String(opts.category || fromId.category || "").trim();
  if (!keywords) {
    throw new Error("Pick a category or type the product you want Higlou to find.");
  }
  const queries = pickCategoryQueries({
    categoryId: opts.categoryId,
    extra: opts.query,
    generic: keywords,
    seed: opts.seed,
    count: opts.query ? 1 : 2,
  });
  const searchTerms = queries.length ? queries : [keywords];

  const sources: OpportunitySources = {
    keepa: false,
    amazonCatalog: false,
    amazonFees: false,
    ebayLive: true,
    retailSearch: false,
  };

  const browseChunks = await mapLimit(searchTerms.slice(0, 2), 2, (term) =>
    browseEbayKeyword(opts.ebayToken!, term).catch(() => []),
  );
  const items = browseChunks.flat();
  // Prefer items with GTIN for exact Amazon match
  const ordered = [
    ...items.filter((row) => row.gtin),
    ...items.filter((row) => !row.gtin),
  ];
  const seen = new Set<string>();
  const unique = ordered.filter((row) => {
    const key = row.gtin || row.itemId;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (!unique.length) {
    throw new Error("No eBay listings found for this search. Try another keyword.");
  }

  const enriched = await mapLimit(unique.slice(0, 10), 3, async (item) => {
    let hit = emptyRouteProduct("ebay_to_amazon", item.itemId);
    hit = {
      ...hit,
      title: item.title,
      brand: item.brand,
      mpn: item.mpn,
      imageUrl: item.imageUrl,
      upc: item.gtin,
      cost: item.price,
      ebayPrice: item.price,
      ebayActiveMedian: item.price,
      ebayActiveLow: item.price,
      ebayActiveCount: 1,
      ebayFees: estimateEbayReferralFee(item.price),
      ebayTitle: item.title,
      ebayMatchedByGtin: Boolean(item.gtin),
    };

    if (item.gtin && opts.amazonToken && opts.marketplaceId) {
      const resolved = await resolveAsinFromUpc({
        upc: item.gtin,
        amazonToken: opts.amazonToken,
        marketplaceId: opts.marketplaceId,
      });
      if (resolved) {
        hit = { ...hit, asin: resolved.asin };
        sources.amazonCatalog = true;
        hit = await enrichAmazonSide(hit, opts);
        if (hit.amazonFees != null) sources.amazonFees = true;
        // Exact GTIN path when catalog resolves
        hit = { ...hit, ebayMatchedByGtin: true };
      }
    }

    return finishRouteProduct(hit);
  });

  const passing = enriched.filter((hit) => {
    if (hit.verdict === "reject") return false;
    if (hit.cost == null || hit.cost <= 0) return false;
    return Boolean(hit.asin) && (hit.amazonPrice ?? hit.buyBoxPrice) != null;
  });

  const ranked = diversifyOpportunityHits(
    sortByRealMoney(passing.length ? passing : enriched.filter((h) => h.cost)),
    Math.max(limit, 8),
  );

  return {
    products: ranked,
    sources,
    filteredOut: Math.max(0, enriched.length - ranked.length),
    queries: searchTerms,
    analyzed: enriched.length,
  };
}
