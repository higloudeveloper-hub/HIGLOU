import { fetchHomeDepotProduct } from "@/lib/homedepot/fetch-product";
import { searchHomeDepotProducts } from "@/lib/homedepot/search-products";
import { fetchWalmartProduct } from "@/lib/walmart/fetch-product";
import { searchWalmartProducts } from "@/lib/walmart/search-products";
import {
  emptyRouteProduct,
  enrichAmazonSide,
  enrichEbaySide,
  finishRouteProduct,
  resolveAsinFromUpc,
} from "@/lib/opportunity/routes/finish-route";
import type {
  OpportunityMode,
  OpportunityProduct,
  OpportunitySources,
} from "@/lib/opportunity/types";
import { diversifyOpportunityHits, pickCategoryQueries } from "@/lib/opportunity/niches";
import { sortByRealMoney } from "@/lib/opportunity/score";
import { opportunitySearchText } from "@/lib/opportunity/categories";

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

export async function findRetailOpportunities(opts: {
  mode: OpportunityMode;
  query: string;
  category?: string;
  categoryId?: string;
  limit?: number;
  pageOrigin?: string;
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
  const mode = opts.mode;
  const isHd = mode.startsWith("homedepot");
  const destAmazon = mode.endsWith("_to_amazon");
  const limit = Math.min(Math.max(opts.limit ?? 8, 1), 8);
  const fromId = opts.categoryId
    ? opportunitySearchText(opts.categoryId, opts.query)
    : { query: opts.query, category: opts.category || "", keepaRoot: "" };
  const keywords =
    String(opts.query || "").trim() ||
    String(opts.category || fromId.category || "").trim() ||
    (String(opts.categoryId || "") === "all"
      ? "storage organizer tool kit"
      : "");
  if (!keywords) {
    throw new Error("Type a product or pick a category to scan Walmart / Home Depot.");
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
    ebayLive: false,
    retailSearch: false,
  };

  type Seed = {
    sourceId: string;
    title: string;
    brand: string;
    model: string;
    imageUrl: string;
    price: number | null;
    upc: string;
  };

  const seeds: Seed[] = [];
  const seen = new Set<string>();

  for (const term of searchTerms.slice(0, 2)) {
    if (isHd) {
      const hits = await searchHomeDepotProducts(term, { limit: 10 });
      sources.retailSearch = sources.retailSearch || hits.length > 0;
      for (const hit of hits) {
        if (seen.has(hit.itemId)) continue;
        seen.add(hit.itemId);
        seeds.push({
          sourceId: hit.itemId,
          title: hit.title,
          brand: hit.brand,
          model: hit.model,
          imageUrl: hit.imageUrl,
          price: hit.price,
          upc: hit.upc,
        });
      }
    } else {
      const hits = await searchWalmartProducts(term, { limit: 10 });
      sources.retailSearch = sources.retailSearch || hits.length > 0;
      for (const hit of hits) {
        if (seen.has(hit.itemId)) continue;
        seen.add(hit.itemId);
        seeds.push({
          sourceId: hit.itemId,
          title: hit.title,
          brand: "",
          model: "",
          imageUrl: hit.imageUrl,
          price: hit.price,
          upc: "",
        });
      }
    }
  }

  if (!seeds.length) {
    throw new Error(
      isHd
        ? "No Home Depot products found for this search. Try another keyword."
        : "No Walmart products found for this search. Try another keyword.",
    );
  }

  const enriched = await mapLimit(seeds.slice(0, 10), 3, async (seed) => {
    let title = seed.title;
    let brand = seed.brand;
    let model = seed.model;
    let imageUrl = seed.imageUrl;
    let price = seed.price;
    let upc = seed.upc;

    try {
      if (isHd) {
        const product = await fetchHomeDepotProduct(
          `https://www.homedepot.com/p/${seed.sourceId}`,
          { pageOrigin: opts.pageOrigin },
        );
        title = product.title || title;
        brand = product.brand || brand;
        model = product.model || model;
        price = product.price ?? price;
        upc = product.upc || upc;
        imageUrl = product.imageUrls[0] || imageUrl;
      } else {
        const product = await fetchWalmartProduct(
          `https://www.walmart.com/ip/${seed.sourceId}`,
          { pageOrigin: opts.pageOrigin },
        );
        title = product.title || title;
        brand = product.brand || brand;
        model = product.model || model;
        price = product.price ?? price;
        upc = product.upc || upc;
        imageUrl = product.imageUrls[0] || imageUrl;
      }
    } catch {
      /* keep seed */
    }

    let hit = emptyRouteProduct(mode, seed.sourceId);
    hit = {
      ...hit,
      title,
      brand,
      mpn: model,
      imageUrl,
      upc,
      cost: price,
      amazonPrice: null,
    };

    // Exactness: without UPC we cannot confirm winners — still return as weak candidate only if priced
    if (!upc) {
      return finishRouteProduct(hit);
    }

    // Always resolve Amazon ASIN when possible — needed for cross-platform truth.
    if (opts.amazonToken && opts.marketplaceId) {
      const resolved = await resolveAsinFromUpc({
        upc,
        amazonToken: opts.amazonToken,
        marketplaceId: opts.marketplaceId,
      });
      if (resolved) {
        hit = {
          ...hit,
          asin: resolved.asin,
          title: hit.title || resolved.title,
        };
        sources.amazonCatalog = true;
        hit = await enrichAmazonSide(hit, opts);
        if (hit.amazonFees != null) sources.amazonFees = true;
      }
    }

    // Always check eBay asks when possible — full money picture.
    if (opts.ebayToken) {
      hit = await enrichEbaySide(hit, opts.ebayToken);
      if (hit.ebayActiveCount) sources.ebayLive = true;
    }

    // Dest-specific sale for keep math
    if (destAmazon) {
      hit = {
        ...hit,
        salePrice: hit.buyBoxPrice ?? hit.amazonPrice,
      };
    } else {
      hit = {
        ...hit,
        salePrice: hit.ebayActiveLow ?? hit.ebayActiveMedian ?? hit.ebayPrice,
      };
    }

    return finishRouteProduct(hit);
  });

  // Board: real keep only — cost vs destination after fees.
  const passing = enriched.filter((hit) => {
    if (hit.verdict === "reject") return false;
    if (hit.cost == null || hit.cost <= 0) return false;
    const keep = hit.hypotheticalKeep;
    if (keep == null || keep < 6) return false;
    if (destAmazon) {
      return Boolean(hit.asin) && (hit.amazonPrice ?? hit.buyBoxPrice) != null;
    }
    return (hit.ebayActiveLow ?? hit.ebayActiveMedian ?? hit.ebayPrice) != null;
  });

  const ranked = diversifyOpportunityHits(
    sortByRealMoney(passing.length ? passing : []),
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
