import { parseAmazonLink } from "@/lib/amazon/asin";
import { searchAmazonWinnersPage } from "@/lib/amazon/fetch-search";
import {
  scoreAmazonOpportunity,
  sortByOpportunity,
} from "@/lib/amazon/opportunity";
import {
  getAmazonLowestNewPrice,
  searchAmazonCatalogWinners,
} from "@/lib/amazon/sp-api";
import { searchEbayLivePrices } from "@/lib/ebay/live-prices";
import {
  amazonWinnerKeywords,
  pickReviewedWinners,
  type AmazonWinnerHit,
} from "@/lib/amazon/winner-rank";

function seedHit(asin: string): AmazonWinnerHit {
  return {
    asin,
    title: "",
    brand: "",
    imageUrl: "",
    salesRank: null,
    salesRankLabel: "",
    browseNodeId: "",
    browseNodeName: "",
    rating: null,
    reviewCount: null,
    amazonPrice: null,
    ebayPrice: null,
    ebayCount: null,
    opportunity: "thin",
  };
}

function mergeHits(
  current: AmazonWinnerHit[],
  next: AmazonWinnerHit[],
): AmazonWinnerHit[] {
  const map = new Map<string, AmazonWinnerHit>();
  for (const hit of current) map.set(hit.asin, hit);
  for (const hit of next) {
    const prev = map.get(hit.asin);
    if (!prev) {
      map.set(hit.asin, hit);
      continue;
    }
    map.set(hit.asin, {
      ...prev,
      ...hit,
      title: hit.title || prev.title,
      brand: hit.brand || prev.brand,
      imageUrl: hit.imageUrl || prev.imageUrl,
      salesRank: hit.salesRank ?? prev.salesRank,
      salesRankLabel: hit.salesRankLabel || prev.salesRankLabel,
      rating: hit.rating ?? prev.rating,
      reviewCount: hit.reviewCount ?? prev.reviewCount,
      amazonPrice: hit.amazonPrice ?? prev.amazonPrice,
      ebayPrice: hit.ebayPrice ?? prev.ebayPrice,
      ebayCount: hit.ebayCount ?? prev.ebayCount,
    });
  }
  return [...map.values()];
}

async function enrichLiveMarkets(
  hits: AmazonWinnerHit[],
  opts: {
    amazonToken?: string;
    marketplaceId?: string;
    ebayToken?: string;
  },
): Promise<AmazonWinnerHit[]> {
  const top = hits.slice(0, 8);
  const rest = hits.slice(8);
  const enriched = await Promise.all(
    top.map(async (hit) => {
      let amazonPrice = hit.amazonPrice;
      let ebayPrice = hit.ebayPrice;
      let ebayCount = hit.ebayCount;
      if (opts.amazonToken && opts.marketplaceId) {
        const livePrice = await getAmazonLowestNewPrice({
          accessToken: opts.amazonToken,
          marketplaceId: opts.marketplaceId,
          asin: hit.asin,
        }).catch(() => null);
        if (livePrice) amazonPrice = livePrice;
      }
      if (opts.ebayToken && hit.title) {
        const live = await searchEbayLivePrices({
          accessToken: opts.ebayToken,
          query: hit.title,
        }).catch(() => ({ median: null, count: 0, low: null }));
        ebayPrice = live.median;
        ebayCount = live.count;
      }
      const scored = scoreAmazonOpportunity({
        ...hit,
        amazonPrice,
        ebayPrice,
      });
      return {
        ...hit,
        amazonPrice,
        ebayPrice,
        ebayCount,
        opportunity: scored.label,
      };
    }),
  );
  return [...enriched, ...rest];
}

export async function findAmazonWinners(opts: {
  query: string;
  category?: string;
  limit?: number;
  pageOrigin?: string;
  amazonToken?: string;
  marketplaceId?: string;
  ebayToken?: string;
}): Promise<{
  products: AmazonWinnerHit[];
  sources: { amazonCatalog: boolean; ebayLive: boolean };
}> {
  const query = String(opts.query || "").trim();
  const category = String(opts.category || "").trim();
  if (!query && !category) {
    throw new Error("Type the product you want Higlou to find.");
  }

  const asin = parseAmazonLink(query)?.asin || "";
  const keywords =
    amazonWinnerKeywords(asin ? "" : query, category) || category || query;
  let hits: AmazonWinnerHit[] = [];
  let amazonCatalog = false;

  if (asin && !category && !keywords) {
    hits = [seedHit(asin)];
  }

  if (opts.amazonToken && opts.marketplaceId && (keywords || asin)) {
    try {
      const catalog = asin
        ? await searchAmazonCatalogWinners({
            accessToken: opts.amazonToken,
            marketplaceId: opts.marketplaceId,
            identifiers: asin,
            identifiersType: "ASIN",
          })
        : [];
      const searched = keywords
        ? await searchAmazonCatalogWinners({
            accessToken: opts.amazonToken,
            marketplaceId: opts.marketplaceId,
            keywords,
          })
        : [];
      hits = mergeHits(hits, mergeHits(catalog, searched));
      amazonCatalog = catalog.length > 0 || searched.length > 0;
    } catch {
      amazonCatalog = false;
    }
  }

  const needsPage =
    Boolean(keywords) &&
    (hits.length < 4 ||
      hits.filter((hit) => hit.rating != null).length < 3);
  if (needsPage) {
    const pageHits = await searchAmazonWinnersPage({
      keywords,
      pageOrigin: opts.pageOrigin,
    });
    hits = mergeHits(hits, pageHits);
  }

  if (asin) hits = mergeHits([seedHit(asin)], hits);
  if (!hits.length) {
    throw new Error(
      "Amazon found no products for that. Try a clearer name, like nailer or toner probe.",
    );
  }

  const picked = pickReviewedWinners(hits, Math.max(opts.limit ?? 5, 8));
  const live = await enrichLiveMarkets(picked, {
    amazonToken: opts.amazonToken,
    marketplaceId: opts.marketplaceId,
    ebayToken: opts.ebayToken,
  });
  const ranked = sortByOpportunity(live).slice(0, opts.limit ?? 5);
  return {
    products: ranked,
    sources: {
      amazonCatalog,
      ebayLive: ranked.some((hit) => hit.ebayPrice != null),
    },
  };
}
