import { parseAmazonLink } from "@/lib/amazon/asin";
import { checkAmazonEligibility } from "@/lib/amazon/eligibility";
import { searchAmazonWinnersPage } from "@/lib/amazon/fetch-search";
import {
  getAmazonFeesEstimate,
  getAmazonLowestNewPrice,
  searchAmazonCatalogWinners,
} from "@/lib/amazon/sp-api";
import { amazonWinnerKeywords } from "@/lib/amazon/winner-rank";
import { isKeepaConfigured } from "@/lib/keepa/config";
import {
  keepaFindAsins,
  keepaProducts,
  keepaSearchAsins,
} from "@/lib/keepa/finder";
import type { KeepaSnapshot } from "@/lib/keepa/parse";
import { searchEbayLivePrices } from "@/lib/ebay/live-prices";
import { opportunitySearchText } from "@/lib/opportunity/categories";
import {
  estimateEbayReferralFee,
  estimateNetProfit,
} from "@/lib/opportunity/profit";
import {
  buildOpportunityReasons,
  opportunityLabelFromScore,
  passesMainOpportunityScreen,
  scoreOpportunity,
  sortByOpportunityScore,
} from "@/lib/opportunity/score";
import type {
  EligibilityStatus,
  OpportunityMode,
  OpportunityProduct,
  OpportunitySources,
} from "@/lib/opportunity/types";
import { OPPORTUNITY_RULES } from "@/lib/opportunity/types";

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

function emptyProduct(asin: string, mode: OpportunityMode): OpportunityProduct {
  return {
    asin,
    title: "",
    brand: "",
    imageUrl: "",
    upc: "",
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
    mode,
    eligibility: "UNKNOWN",
    eligibilityMessage: "Eligibility not checked",
    score: 0,
    grade: "discard",
    reasons: [],
    demandScore: 0,
    sellerCount: null,
    amazonRetail: false,
    buyBoxPrice: null,
    avgSalesRank90: null,
    bsrDrops90: null,
    priceVariation90: null,
    cost: null,
    salePrice: null,
    amazonFees: null,
    ebayFees: null,
    shipping: null,
    packing: null,
    returnsReserve: null,
    netProfit: null,
    roi: null,
    margin: null,
    ebayActiveMedian: null,
    ebayActiveLow: null,
    ebayActiveCount: null,
    ebayListingsAreSold: false,
    keepa: false,
  };
}

function applyKeepa(hit: OpportunityProduct, snap: KeepaSnapshot): OpportunityProduct {
  return {
    ...hit,
    title: snap.title || hit.title,
    brand: snap.brand || hit.brand,
    imageUrl: snap.imageUrl || hit.imageUrl,
    upc: snap.upc || hit.upc,
    salesRank: snap.salesRank ?? hit.salesRank,
    salesRankLabel: snap.salesRank != null ? "Keepa BSR" : hit.salesRankLabel,
    rating: snap.rating ?? hit.rating,
    reviewCount: snap.reviewCount ?? hit.reviewCount,
    amazonPrice: snap.buyBoxPrice ?? snap.newPrice ?? hit.amazonPrice,
    buyBoxPrice: snap.buyBoxPrice ?? hit.buyBoxPrice,
    sellerCount: snap.sellerCount ?? hit.sellerCount,
    amazonRetail: snap.amazonRetail || hit.amazonRetail,
    avgSalesRank90: snap.avgSalesRank90,
    bsrDrops90: snap.bsrDrops90,
    priceVariation90: snap.priceVariation90,
    keepa: true,
  };
}

function cheapKeepaFilter(snap: KeepaSnapshot): boolean {
  const price = snap.buyBoxPrice ?? snap.newPrice;
  if (price != null && (price < OPPORTUNITY_RULES.minPrice || price > OPPORTUNITY_RULES.maxPrice)) {
    return false;
  }
  const rank = snap.avgSalesRank90 ?? snap.salesRank;
  if (rank != null && (rank < OPPORTUNITY_RULES.minBsr || rank > OPPORTUNITY_RULES.maxBsr)) {
    return false;
  }
  if (snap.sellerCount != null && snap.sellerCount > OPPORTUNITY_RULES.maxSellers) {
    return false;
  }
  if (
    snap.priceVariation90 != null &&
    snap.priceVariation90 > OPPORTUNITY_RULES.maxPriceVariation
  ) {
    return false;
  }
  if (snap.amazonRetail) return false;
  return true;
}

function finishProduct(
  hit: OpportunityProduct,
  mode: OpportunityMode,
  supplierCost?: number | null,
): OpportunityProduct {
  const amazonPrice = hit.buyBoxPrice ?? hit.amazonPrice;
  const ebayAsk = hit.ebayActiveMedian ?? hit.ebayPrice;
  let cost = supplierCost ?? null;
  let salePrice: number | null = null;
  let marketplaceFee: number | null = null;
  if (mode === "amazon") {
    salePrice = amazonPrice;
    cost = supplierCost ?? null;
    marketplaceFee = hit.amazonFees;
  } else if (mode === "amazon_to_ebay") {
    salePrice = ebayAsk;
    cost = amazonPrice;
    marketplaceFee = hit.ebayFees ?? estimateEbayReferralFee(salePrice);
  } else {
    salePrice = ebayAsk ?? amazonPrice;
    cost = supplierCost ?? amazonPrice;
    marketplaceFee =
      ebayAsk != null
        ? hit.ebayFees ?? estimateEbayReferralFee(ebayAsk)
        : hit.amazonFees;
  }
  const profit = estimateNetProfit({
    salePrice,
    cost,
    marketplaceFee,
  });
  const scored = scoreOpportunity({
    eligibility: hit.eligibility,
    netProfit: profit.netProfit,
    roi: profit.roi,
    margin: profit.margin,
    salesRank: hit.salesRank,
    avgSalesRank90: hit.avgSalesRank90,
    bsrDrops90: hit.bsrDrops90,
    rating: hit.rating,
    reviewCount: hit.reviewCount,
    sellerCount: hit.sellerCount,
    amazonRetail: hit.amazonRetail,
    priceVariation90: hit.priceVariation90,
    brand: hit.brand,
    title: hit.title,
  });
  const next: OpportunityProduct = {
    ...hit,
    amazonPrice,
    ebayPrice: ebayAsk,
    ebayCount: hit.ebayActiveCount,
    cost,
    salePrice,
    ebayFees: hit.ebayFees ?? estimateEbayReferralFee(mode === "amazon" ? null : salePrice),
    shipping: profit.shipping,
    packing: profit.packing,
    returnsReserve: profit.returnsReserve,
    netProfit: profit.netProfit,
    roi: profit.roi,
    margin: profit.margin,
    score: scored.score,
    demandScore: scored.demandScore,
    grade: scored.grade,
    opportunity: opportunityLabelFromScore(scored.score, hit.eligibility),
  };
  next.reasons = buildOpportunityReasons(next);
  return next;
}

export async function findOpportunities(opts: {
  query: string;
  category?: string;
  categoryId?: string;
  keepaRoot?: string;
  limit?: number;
  pageOrigin?: string;
  mode?: OpportunityMode;
  onlySellable?: boolean;
  supplierCost?: number | null;
  amazonToken?: string;
  marketplaceId?: string;
  sellingPartnerId?: string;
  ebayToken?: string;
}): Promise<{
  products: OpportunityProduct[];
  sources: OpportunitySources;
  filteredOut: number;
}> {
  const mode = opts.mode || "amazon_to_ebay";
  const onlySellable = opts.onlySellable !== false;
  const limit = Math.min(Math.max(opts.limit ?? 5, 1), 5);
  const query = String(opts.query || "").trim();
  const category = String(opts.category || "").trim();
  const fromId = opts.categoryId
    ? opportunitySearchText(opts.categoryId, query)
    : { query, category, keepaRoot: opts.keepaRoot || "" };
  const keepaRoot = opts.keepaRoot || fromId.keepaRoot;
  const keywords =
    amazonWinnerKeywords(query, category || fromId.category) ||
    category ||
    fromId.category ||
    query;
  const asin = parseAmazonLink(query)?.asin || "";
  if (!query && !category && !fromId.category && !asin && !keepaRoot) {
    throw new Error("Pick a category or type the product you want Higlou to find.");
  }

  const sources: OpportunitySources = {
    keepa: false,
    amazonCatalog: false,
    amazonFees: false,
    ebayLive: false,
  };

  let asins: string[] = asin ? [asin] : [];
  const seeds = new Map<string, OpportunityProduct>();

  if (isKeepaConfigured()) {
    try {
      const found = keepaRoot || keywords
        ? await keepaFindAsins({
            rootCategory: keepaRoot || undefined,
            title: keywords || undefined,
            perPage: 20,
          })
        : [];
      const searched =
        keywords && found.length < 8 ? await keepaSearchAsins(keywords) : [];
      asins = [...new Set([...asins, ...found, ...searched])];
      sources.keepa = asins.length > 0;
    } catch {
      sources.keepa = false;
    }
  }

  if (asins.length < 8 && opts.amazonToken && opts.marketplaceId && (keywords || asin)) {
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
      for (const hit of [...catalog, ...searched]) {
        const row = emptyProduct(hit.asin, mode);
        row.title = hit.title;
        row.brand = hit.brand;
        row.imageUrl = hit.imageUrl;
        row.salesRank = hit.salesRank;
        row.salesRankLabel = hit.salesRankLabel;
        row.rating = hit.rating;
        row.reviewCount = hit.reviewCount;
        row.amazonPrice = hit.amazonPrice;
        seeds.set(hit.asin, row);
      }
      asins = [
        ...asins,
        ...catalog.map((hit) => hit.asin),
        ...searched.map((hit) => hit.asin),
      ];
      sources.amazonCatalog = catalog.length + searched.length > 0;
    } catch {
      sources.amazonCatalog = false;
    }
  }

  if (asins.length < 8 && keywords) {
    const pageHits = await searchAmazonWinnersPage({
      keywords,
      pageOrigin: opts.pageOrigin,
    }).catch(() => []);
    for (const hit of pageHits) {
      const prev = seeds.get(hit.asin) || emptyProduct(hit.asin, mode);
      prev.title = hit.title || prev.title;
      prev.imageUrl = hit.imageUrl || prev.imageUrl;
      prev.rating = hit.rating ?? prev.rating;
      prev.reviewCount = hit.reviewCount ?? prev.reviewCount;
      prev.amazonPrice = hit.amazonPrice ?? prev.amazonPrice;
      seeds.set(hit.asin, prev);
    }
    asins = [...asins, ...pageHits.map((hit) => hit.asin)];
  }

  asins = [...new Set(asins.map((id) => id.toUpperCase()))].filter((id) =>
    /^[A-Z0-9]{10}$/.test(id),
  );
  if (!asins.length) {
    throw new Error(
      "No products passed the first Keepa filters. Try another category.",
    );
  }

  const eligibilityPool = asins.slice(0, 16);
  const eligible = await mapLimit(eligibilityPool, 4, async (id) => {
    const hit = seeds.get(id) || emptyProduct(id, mode);
    if (opts.amazonToken && opts.sellingPartnerId && opts.marketplaceId) {
      const check = await checkAmazonEligibility({
        accessToken: opts.amazonToken,
        sellerId: opts.sellingPartnerId,
        marketplaceId: opts.marketplaceId,
        asin: id,
      });
      hit.eligibility = check.status;
      hit.eligibilityMessage = check.message;
    } else {
      hit.eligibility = "UNKNOWN";
      hit.eligibilityMessage = "Connect Amazon to check if you can sell it.";
    }
    return hit;
  });

  const allowed = eligible.filter((hit) => {
    if (!onlySellable) return hit.eligibility !== "RESTRICTED";
    if (!opts.sellingPartnerId) return true;
    return hit.eligibility === "SELLABLE";
  });
  if (!allowed.length) {
    throw new Error(
      "Nothing in this set is sellable on your Amazon account. Restricted brands were removed.",
    );
  }

  const keepaSnaps = isKeepaConfigured()
    ? await keepaProducts(allowed.slice(0, 12).map((hit) => hit.asin)).catch(
        () => [] as KeepaSnapshot[],
      )
    : [];
  if (keepaSnaps.length) sources.keepa = true;
  const keepaMap = new Map(keepaSnaps.map((row) => [row.asin, row]));
  const afterKeepa = allowed
    .map((hit) => {
      const snap = keepaMap.get(hit.asin);
      return snap ? applyKeepa(hit, snap) : hit;
    })
    .filter((hit) => {
      const snap = keepaMap.get(hit.asin);
      return snap ? cheapKeepaFilter(snap) : true;
    });

  const pool = afterKeepa.length ? afterKeepa : allowed;
  const priced = await mapLimit(pool.slice(0, 10), 3, async (hit) => {
    let next = hit;
    if (opts.amazonToken && opts.marketplaceId) {
      const live = await getAmazonLowestNewPrice({
        accessToken: opts.amazonToken,
        marketplaceId: opts.marketplaceId,
        asin: hit.asin,
      }).catch(() => null);
      if (live) {
        next = { ...next, amazonPrice: live, buyBoxPrice: live };
      }
    }
    const sellForFees =
      mode === "amazon"
        ? next.buyBoxPrice ?? next.amazonPrice
        : next.buyBoxPrice ?? next.amazonPrice;
    if (
      opts.amazonToken &&
      opts.marketplaceId &&
      sellForFees &&
      mode === "amazon"
    ) {
      const fee = await getAmazonFeesEstimate({
        accessToken: opts.amazonToken,
        marketplaceId: opts.marketplaceId,
        asin: hit.asin,
        price: sellForFees,
        fulfillment: "FBM",
      }).catch(() => null);
      if (fee != null) {
        next = { ...next, amazonFees: fee };
        sources.amazonFees = true;
      }
    }
    if (opts.ebayToken && (next.title || next.upc) && mode !== "amazon") {
      const live = await searchEbayLivePrices({
        accessToken: opts.ebayToken,
        query: next.title,
        gtin: next.upc,
      }).catch(() => ({
        median: null,
        count: 0,
        low: null,
        kind: "active_listings" as const,
      }));
      next = {
        ...next,
        ebayActiveMedian: live.median,
        ebayActiveLow: live.low,
        ebayActiveCount: live.count,
        ebayPrice: live.median,
        ebayCount: live.count,
        ebayFees: estimateEbayReferralFee(live.median),
      };
      if (live.count) sources.ebayLive = true;
    }
    return finishProduct(next, mode, opts.supplierCost);
  });

  const requireProfit = priced.some((hit) => hit.netProfit != null);
  const passing = priced.filter((hit) =>
    passesMainOpportunityScreen(hit, { requireProfit }),
  );
  const ranked = sortByOpportunityScore(passing.length ? passing : priced).slice(
    0,
    limit,
  );
  return {
    products: ranked,
    sources,
    filteredOut: Math.max(0, asins.length - ranked.length),
  };
}
