import { parseAmazonLink } from "@/lib/amazon/asin";
import { checkAmazonEligibility } from "@/lib/amazon/eligibility";
import { searchAmazonWinnersPage } from "@/lib/amazon/fetch-search";
import {
  getAmazonFeesEstimate,
  getAmazonLowestNewPrice,
  searchAmazonCatalogWinners,
} from "@/lib/amazon/sp-api";
import { amazonWinnerKeywords } from "@/lib/amazon/winner-rank";
import {
  amazonProductScore,
  AMAZON_PRODUCT_WINNER_MIN,
  isAmazonProductWinner,
  isKeepaBuyVelocityWinner,
} from "@/lib/opportunity/amazon-product-winner";
import { isKeepaConfigured } from "@/lib/keepa/config";
import {
  keepaAllowedFor,
  keepaMaxProductsPerScan,
  resolveKeepaMode,
  type KeepaMode,
} from "@/lib/keepa/budget";
import {
  keepaFindHotWinners,
  keepaProducts,
  keepaSearchAsins,
} from "@/lib/keepa/finder";
import type { KeepaSnapshot } from "@/lib/keepa/parse";
import { searchEbayLivePrices } from "@/lib/ebay/live-prices";
import { opportunitySearchText } from "@/lib/opportunity/categories";
import {
  diversifyOpportunityHits,
  isCrowdedBestseller,
  pickCategoryQueries,
} from "@/lib/opportunity/niches";
import { judgeOpportunity } from "@/lib/opportunity/gates";
import { isStarterRestrictedTitle } from "@/lib/opportunity/identity";
import { destMarketFor, sourceMarketFor } from "@/lib/opportunity/markets";
import {
  estimateEbayReferralFee,
  estimateNetProfit,
} from "@/lib/opportunity/profit";
import {
  buildOpportunityReasons,
  isConfirmedOpportunity,
  opportunityGrade,
  opportunityLabelFromScore,
  scoreOpportunity,
  sortByRealMoney,
} from "@/lib/opportunity/score";
import { isActionableAskSpread, askBasedSalePrice } from "@/lib/opportunity/spread";
import type {
  OpportunityMode,
  OpportunityProduct,
  OpportunitySources,
} from "@/lib/opportunity/types";
import { OPPORTUNITY_RULES } from "@/lib/opportunity/types";
import { findEbayToAmazonOpportunities } from "@/lib/opportunity/routes/ebay-to-amazon";
import { findRetailOpportunities } from "@/lib/opportunity/routes/retail-to-market";

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
    sourceMarket: sourceMarketFor(mode),
    sourceId: asin,
    destMarket: destMarketFor(mode),
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
    mpn: "",
    ebayTitle: "",
    ebayMatchedByGtin: false,
    packQty: null,
    packageLb: null,
    avgAmazon90: null,
    discount90: null,
    soldVerified: false,
    sold30d: null,
    sold90d: null,
    medianSoldPrice: null,
    p25Sold90: null,
    sellThrough90: null,
    daysToSell: null,
    identityConfidence: 0,
    identityBasis: "",
    verdict: "candidate",
    expectedSalePrice: null,
    hypotheticalKeep: null,
    landedCost: null,
    priceDropReserve: null,
    promotedFee: null,
    returnRisk: "medium",
    policyRisk: "low",
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
    mpn: snap.mpn || hit.mpn,
    avgAmazon90: snap.avgNew90,
    discount90: snap.discount90,
    packageLb: snap.packageLb ?? hit.packageLb,
    keepa: true,
  };
}

function cheapKeepaFilter(
  snap: KeepaSnapshot,
  mode: OpportunityMode,
): boolean {
  const price = snap.buyBoxPrice ?? snap.newPrice;
  if (price != null && (price < 10 || price > 150)) {
    return false;
  }
  // Soft signal only — hard discount rejects burned tokens for empty boards.
  // Finder already required salesRankDrops90; trust that demand gate.
  if (snap.packageLb != null && snap.packageLb > OPPORTUNITY_RULES.maxPackageLb + 2) {
    return false;
  }
  if (isStarterRestrictedTitle(snap.title)) return false;
  const rank = snap.avgSalesRank90 ?? snap.salesRank;
  if (rank != null && (rank < 200 || rank > 250_000)) {
    return false;
  }
  if (mode === "amazon" || mode === "supplier") {
    if (snap.sellerCount != null && snap.sellerCount > 20) {
      return false;
    }
    if (snap.amazonRetail) return false;
  }
  return true;
}

function finishProduct(
  hit: OpportunityProduct,
  mode: OpportunityMode,
  supplierCost?: number | null,
): OpportunityProduct {
  const amazonPrice = hit.buyBoxPrice ?? hit.amazonPrice;
  const ebayAsk = hit.ebayActiveMedian ?? hit.ebayPrice;
  if (mode === "amazon_to_ebay") {
    const judged = judgeOpportunity(
      {
        ...hit,
        amazonPrice,
        cost: amazonPrice,
        ebayPrice: ebayAsk,
        ebayCount: hit.ebayActiveCount,
        ebayFees: hit.ebayFees ?? estimateEbayReferralFee(ebayAsk),
        soldVerified: false,
      },
      mode,
    );
    const next: OpportunityProduct = {
      ...hit,
      amazonPrice,
      ebayPrice: ebayAsk,
      ebayCount: hit.ebayActiveCount,
      cost: amazonPrice,
      ebayFees: hit.ebayFees ?? estimateEbayReferralFee(ebayAsk),
      ...judged,
      opportunity:
        judged.verdict === "winner"
          ? "now"
          : judged.verdict === "good"
            ? "watch"
            : "thin",
    };
    next.reasons = buildOpportunityReasons(next);
    return next;
  }
  let cost = supplierCost ?? null;
  let salePrice: number | null = null;
  let marketplaceFee: number | null = null;
  if (mode === "amazon") {
    salePrice = amazonPrice;
    cost = supplierCost ?? null;
    marketplaceFee = hit.amazonFees;
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
    ebayActiveCount: hit.ebayActiveCount,
  });

  // Keepa product-quality lane — demand score is the source of truth for Amazon sell.
  const demand =
    mode === "amazon" || mode === "supplier"
      ? amazonProductScore(hit)
      : scored.demandScore;
  const mergedScore =
    mode === "amazon" ? Math.max(scored.score, demand) : scored.score;
  const amazonVerdict =
    mode === "amazon"
      ? demand >= AMAZON_PRODUCT_WINNER_MIN
        ? demand >= 82
          ? ("winner" as const)
          : ("good" as const)
        : demand >= 55
          ? ("watch" as const)
          : ("reject" as const)
      : undefined;

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
    score: mergedScore,
    demandScore: demand,
    grade: opportunityGrade(mergedScore),
    opportunity: opportunityLabelFromScore(mergedScore, hit.eligibility),
    ...(amazonVerdict ? { verdict: amazonVerdict } : {}),
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
  seed?: number;
  excludeAsins?: string[];
  /** off = never bill Keepa (live loop). full = finder+hydrate. enrich = hydrate only. */
  keepaMode?: KeepaMode;
  keepaPurpose?: "live" | "manual" | "enrich";
}): Promise<{
  products: OpportunityProduct[];
  sources: OpportunitySources;
  filteredOut: number;
  queries: string[];
  analyzed: number;
}> {
  const mode = opts.mode || "amazon_to_ebay";

  if (
    mode === "homedepot_to_ebay" ||
    mode === "homedepot_to_amazon" ||
    mode === "walmart_to_ebay" ||
    mode === "walmart_to_amazon"
  ) {
    return findRetailOpportunities({ ...opts, mode });
  }
  if (mode === "ebay_to_amazon") {
    return findEbayToAmazonOpportunities(opts);
  }

  const onlySellable = opts.onlySellable !== false;
  const limit = Math.min(Math.max(opts.limit ?? 8, 1), 8);
  const query = String(opts.query || "").trim();
  const category = String(opts.category || "").trim();
  const categoryId = String(opts.categoryId || "all").trim() || "all";
  const globalScan = categoryId === "all" || !categoryId;
  const fromId = globalScan
    ? { query, category: "", keepaRoot: "" }
    : opportunitySearchText(categoryId, query);
  const keepaRoot = opts.keepaRoot || fromId.keepaRoot;
  const keywords =
    amazonWinnerKeywords(query, category || fromId.category) ||
    category ||
    fromId.category ||
    query;
  const keepaMode = resolveKeepaMode(
    opts.keepaMode,
    opts.keepaPurpose || "manual",
  );
  const keepaOn =
    isKeepaConfigured() &&
    keepaMode !== "off" &&
    keepaAllowedFor(opts.keepaPurpose === "live" ? "live" : "manual");
  const exclude = new Set(
    (opts.excludeAsins || [])
      .map((id) => id.trim().toUpperCase())
      .filter((id) => /^[A-Z0-9]{10}$/.test(id)),
  );
  const queries =
    keepaOn && keepaMode === "full"
      ? [keywords].filter(Boolean)
      : pickCategoryQueries({
          categoryId: globalScan ? undefined : categoryId,
          extra: query,
          generic: keywords,
          seed: opts.seed,
          count: query ? 1 : 3,
        });
  const asin = parseAmazonLink(query)?.asin || "";
  // Global Keepa scan needs no category / query — opportunity-first.
  if (
    !keepaOn &&
    !query &&
    !category &&
    !fromId.category &&
    !asin &&
    !keepaRoot &&
    !queries.length
  ) {
    throw new Error(
      "Connect Keepa or type a product. Global winner scan needs Keepa.",
    );
  }

  const sources: OpportunitySources = {
    keepa: false,
    amazonCatalog: false,
    amazonFees: false,
    ebayLive: false,
  };

  let asins: string[] = asin && !exclude.has(asin.toUpperCase()) ? [asin] : [];
  const seeds = new Map<string, OpportunityProduct>();

  const takeHit = (hit: {
    asin: string;
    title?: string;
    brand?: string;
    imageUrl?: string;
    salesRank?: number | null;
    salesRankLabel?: string;
    rating?: number | null;
    reviewCount?: number | null;
    amazonPrice?: number | null;
  }) => {
    const id = String(hit.asin || "").toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(id) || exclude.has(id)) return;
    const prev = seeds.get(id) || emptyProduct(id, mode);
    prev.title = hit.title || prev.title;
    prev.brand = hit.brand || prev.brand;
    prev.imageUrl = hit.imageUrl || prev.imageUrl;
    if (hit.salesRank != null) prev.salesRank = hit.salesRank;
    if (hit.salesRankLabel) prev.salesRankLabel = hit.salesRankLabel;
    prev.rating = hit.rating ?? prev.rating;
    prev.reviewCount = hit.reviewCount ?? prev.reviewCount;
    prev.amazonPrice = hit.amazonPrice ?? prev.amazonPrice;
    seeds.set(id, prev);
    asins.push(id);
  };

  // Keepa opportunity-first scan — global by default, category optional.
  if (keepaOn && keepaMode === "full") {
    try {
      const hot = await keepaFindHotWinners({
        mode,
        rootCategory: keepaRoot || undefined,
        title: query.length >= 8 ? query : undefined,
        seed: opts.seed,
        preferGlobal: globalScan || !keepaRoot,
      });
      for (const id of hot.asins) takeHit({ asin: id });
      // Paid /search only if finder returned nothing and user typed a product.
      if (!hot.asins.length && query.length >= 8) {
        const searched = await keepaSearchAsins(query);
        for (const id of searched) takeHit({ asin: id });
      }
      sources.keepa = asins.length > 0;
    } catch {
      sources.keepa = false;
    }
  }

  const searchTerms = queries.length ? queries : [keywords].filter(Boolean);

  if (asins.length < 12 && opts.amazonToken && opts.marketplaceId) {
    const amazonToken = opts.amazonToken;
    const marketplaceId = opts.marketplaceId;
    try {
      if (asin) {
        const catalog = await searchAmazonCatalogWinners({
          accessToken: amazonToken,
          marketplaceId,
          identifiers: asin,
          identifiersType: "ASIN",
        }).catch(() => []);
        catalog.forEach(takeHit);
      }
      const catalogChunks = await mapLimit(searchTerms, 2, async (term) => {
        try {
          return await searchAmazonCatalogWinners({
            accessToken: amazonToken,
            marketplaceId,
            keywords: term,
          });
        } catch {
          return [];
        }
      });
      catalogChunks.flat().forEach(takeHit);
      sources.amazonCatalog = catalogChunks.some((rows) => rows.length > 0);
    } catch {
      sources.amazonCatalog = false;
    }
  }

  if (asins.length < 12 && searchTerms.length) {
    const pageChunks = await mapLimit(searchTerms.slice(0, 3), 2, async (term) =>
      searchAmazonWinnersPage({
        keywords: term,
        pageOrigin: opts.pageOrigin,
        sort: keepaOn && keepaMode === "full" ? "review-rank" : "featured",
      }).catch(() => []),
    );
    pageChunks.flat().forEach(takeHit);
  }

  asins = [...new Set(asins.map((id) => id.toUpperCase()))].filter((id) =>
    /^[A-Z0-9]{10}$/.test(id) && !exclude.has(id),
  );
  if (!keepaOn || keepaMode !== "full") {
    const lean = asins.filter((id) => {
      const hit = seeds.get(id);
      if (!hit || hit.reviewCount == null) return true;
      return !isCrowdedBestseller(hit.reviewCount);
    });
    if (lean.length >= Math.max(limit, 6) && lean.length < asins.length) {
      const crowded = asins.filter((id) => !lean.includes(id));
      asins = [...lean, ...crowded].slice(0, 20);
    }
  }
  if (!asins.length) {
    throw new Error(
      keepaOn && keepaMode === "full"
        ? "No products passed the first Keepa filters. Try another category."
        : "No products found for this slice. Try Find different products or type a product name.",
    );
  }

  const eligibilityPool = asins.slice(0, 16);
  const skipAmazonGate = mode === "amazon_to_ebay";
  const eligible = await mapLimit(eligibilityPool, 4, async (id) => {
    const hit = seeds.get(id) || emptyProduct(id, mode);
    if (skipAmazonGate) {
      hit.eligibility = "UNKNOWN";
      hit.eligibilityMessage =
        "Buying on Amazon. Your seller approval is not required to resell on eBay.";
      return hit;
    }
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
    if (skipAmazonGate) return true;
    if (!onlySellable) return hit.eligibility !== "RESTRICTED";
    if (!opts.sellingPartnerId) return true;
    return hit.eligibility === "SELLABLE";
  });
  if (!allowed.length) {
    throw new Error(
      mode === "amazon" || mode === "supplier"
        ? "Nothing in this set is sellable on your Amazon account. Restricted brands were removed."
        : "No products passed the first filters. Try another category.",
    );
  }

  const hydrateN = Math.min(
    keepaMaxProductsPerScan(),
    Math.max(limit + 2, limit),
    allowed.length,
  );
  const keepaSnaps =
    keepaOn && (keepaMode === "full" || keepaMode === "enrich")
      ? await keepaProducts(allowed.slice(0, hydrateN).map((hit) => hit.asin)).catch(
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
      // Only drop Keepa-hydrated rows that fail hard gates; leave Amazon-only rows.
      return snap ? cheapKeepaFilter(snap, mode) : true;
    });

  const pool = afterKeepa.length ? afterKeepa : allowed;
  const hydrateCap = Math.min(
    Math.max(keepaMaxProductsPerScan(), limit + 2),
    12,
    pool.length,
  );
  const priced = await mapLimit(pool.slice(0, hydrateCap), 3, async (hit) => {
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
      (mode === "amazon" || mode === "supplier")
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
      const amazonPrice = next.buyBoxPrice ?? next.amazonPrice;
      const live = await searchEbayLivePrices({
        accessToken: opts.ebayToken,
        query: next.title,
        brand: next.brand,
        gtin: next.upc,
        amazonPrice,
      }).catch(() => ({
        median: null,
        count: 0,
        low: null,
        p25: null,
        kind: "active_listings" as const,
        sampleTitle: "",
        matchedByGtin: false,
      }));
      const askSale = askBasedSalePrice({
        low: live.low ?? live.p25,
        median: live.median,
      });
      next = {
        ...next,
        ebayActiveMedian: live.median,
        ebayActiveLow: live.low ?? live.p25,
        ebayActiveCount: live.count,
        ebayPrice: live.median,
        ebayCount: live.count,
        ebayFees: estimateEbayReferralFee(askSale ?? live.median),
        ebayTitle: live.sampleTitle,
        ebayMatchedByGtin: live.matchedByGtin,
      };
      if (live.count) sources.ebayLive = true;
    }
    return finishProduct(next, mode, opts.supplierCost);
  });

  const confirmed = priced.filter((hit) => isConfirmedOpportunity(hit, mode));
  // Keepa demand can stand alone without an eBay ask (confirmed requires eBay for
  // amazon_to_ebay). Pull those from the priced pool so the board is never empty
  // when Product Finder already found real velocity.
  const keepaDemand = priced.filter(
    (hit) =>
      isAmazonProductWinner(hit) ||
      (mode === "amazon_to_ebay" && isKeepaBuyVelocityWinner(hit)),
  );

  // Never fall back to money-losing asks — empty board beats fake "opportunities".
  // Amazon lane: Keepa product winners only (BSR velocity + competition + proof).
  // Arbitrage: ask keep first; if eBay is quiet, still surface Keepa-hot Amazon products.
  let passing =
    mode === "amazon"
      ? confirmed.filter((hit) => isAmazonProductWinner(hit))
      : confirmed.filter((hit) => isActionableAskSpread(hit));
  if (mode === "amazon_to_ebay") {
    const seen = new Set(passing.map((hit) => hit.asin));
    for (const hit of keepaDemand) {
      if (!seen.has(hit.asin)) {
        passing.push(hit);
        seen.add(hit.asin);
      }
    }
  } else if (mode === "amazon" && !passing.length) {
    passing = keepaDemand.filter((hit) => isAmazonProductWinner(hit));
  }

  const demandOnly =
    mode === "amazon" ||
    (mode === "amazon_to_ebay" &&
      passing.every(
        (hit) =>
          (isAmazonProductWinner(hit) || isKeepaBuyVelocityWinner(hit)) &&
          !isActionableAskSpread(hit),
      ));
  const ranked = diversifyOpportunityHits(
    demandOnly
      ? [...passing].sort(
          (a, b) =>
            amazonProductScore(b) - amazonProductScore(a) || b.score - a.score,
        )
      : sortByRealMoney(passing),
    Math.max(limit, 8),
  );
  return {
    products: ranked,
    sources,
    filteredOut: Math.max(0, priced.length - ranked.length),
    queries: searchTerms,
    analyzed: priced.length,
  };
}
