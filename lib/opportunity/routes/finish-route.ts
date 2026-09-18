import { searchAmazonCatalogByIdentifier } from "@/lib/amazon/sp-api";
import { barcodeSearchKeys } from "@/lib/amazon/catalog-resolve";
import { checkAmazonEligibility } from "@/lib/amazon/eligibility";
import { getAmazonFeesEstimate, getAmazonLowestNewPrice } from "@/lib/amazon/sp-api";
import { searchEbayLivePrices } from "@/lib/ebay/live-prices";
import { scoreProductIdentity } from "@/lib/opportunity/identity";
import {
  destMarketFor,
  sourceMarketFor,
} from "@/lib/opportunity/markets";
import {
  estimateEbayReferralFee,
  estimateNetProfit,
} from "@/lib/opportunity/profit";
import { buildOpportunityReasons, opportunityLabelFromScore } from "@/lib/opportunity/score";
import type {
  OpportunityMode,
  OpportunityProduct,
  OpportunityVerdict,
} from "@/lib/opportunity/types";
import { OPPORTUNITY_RULES } from "@/lib/opportunity/types";

export function emptyRouteProduct(
  mode: OpportunityMode,
  sourceId: string,
  asin = "",
): OpportunityProduct {
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
    sourceId,
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

function verdictFrom(opts: {
  gtinExact: boolean;
  identity: number;
  netProfit: number | null;
  reject: boolean;
}): OpportunityVerdict {
  if (opts.reject || opts.identity < 40) return "reject";
  if (!opts.gtinExact || opts.identity < OPPORTUNITY_RULES.minIdentity) {
    return "candidate";
  }
  if (opts.netProfit != null && opts.netProfit >= OPPORTUNITY_RULES.minWinnerProfit) {
    return "good";
  }
  if (opts.netProfit != null && opts.netProfit >= OPPORTUNITY_RULES.minNetProfit) {
    return "watch";
  }
  return "candidate";
}

/** Finish a retail/eBay-sourced opportunity with exact identity gates. */
export function finishRouteProduct(hit: OpportunityProduct): OpportunityProduct {
  const dest = hit.destMarket;
  const cost = hit.cost;
  const salePrice =
    dest === "amazon"
      ? hit.buyBoxPrice ?? hit.amazonPrice
      : hit.ebayActiveMedian ?? hit.ebayPrice;
  const marketplaceFee =
    dest === "amazon"
      ? hit.amazonFees
      : hit.ebayFees ?? estimateEbayReferralFee(salePrice);

  const identity = scoreProductIdentity({
    sourceTitle: hit.title,
    destTitle: dest === "ebay" ? hit.ebayTitle : hit.title,
    sourceBrand: hit.brand,
    sourceUpc: hit.upc,
    sourceMpn: hit.mpn,
    matchedByGtin: hit.ebayMatchedByGtin,
    destUpc: hit.ebayMatchedByGtin ? hit.upc : "",
  });

  const profit = estimateNetProfit({
    salePrice,
    cost,
    marketplaceFee,
  });

  // Active asks are not sold comps — keep hypothetic, never mark soldVerified.
  const netForScore = profit.netProfit;
  const verdict = verdictFrom({
    gtinExact: identity.gtinExact,
    identity: identity.confidence,
    netProfit: netForScore,
    reject: identity.reject,
  });

  let score = Math.round(
    Math.min(100, Math.max(0, identity.confidence * 0.55 + (netForScore ?? 0))),
  );
  if (!identity.gtinExact) score = Math.min(score, 55);
  if (verdict === "reject") score = 0;

  const grade =
    verdict === "good"
      ? "good"
      : verdict === "watch"
        ? "review"
        : verdict === "reject"
          ? "discard"
          : "review";

  const next: OpportunityProduct = {
    ...hit,
    packQty: identity.sourcePack,
    identityConfidence: identity.confidence,
    identityBasis: identity.basis,
    salePrice,
    shipping: profit.shipping,
    packing: profit.packing,
    returnsReserve: profit.returnsReserve,
    // Honest: hypothetical keep until sold comps exist
    netProfit: null,
    hypotheticalKeep: netForScore,
    roi: profit.roi,
    margin: profit.margin,
    score,
    demandScore: identity.gtinExact ? 40 : 10,
    grade,
    verdict,
    soldVerified: false,
    opportunity:
      verdict === "good" ? "now" : verdict === "watch" ? "watch" : "thin",
  };
  next.reasons = buildOpportunityReasons(next);
  next.reasons.unshift({
    ok: identity.gtinExact,
    text: identity.gtinExact
      ? `Exact identity (${identity.basis})`
      : `Identity weak (${identity.basis || "no UPC match"}) — not a confirmed winner`,
  });
  if (netForScore != null) {
    next.reasons.push({
      ok: netForScore >= OPPORTUNITY_RULES.minNetProfit,
      text: `Hypothetical keep $${netForScore.toFixed(2)} from active asks (not sold comps)`,
    });
  }
  // opportunityLabel helper unused when verdict drives opportunity
  void opportunityLabelFromScore;
  return next;
}

export async function resolveAsinFromUpc(opts: {
  upc: string;
  amazonToken: string;
  marketplaceId: string;
}): Promise<{ asin: string; title: string } | null> {
  const keys = barcodeSearchKeys(opts.upc);
  for (const key of keys) {
    try {
      const hits = await searchAmazonCatalogByIdentifier({
        accessToken: opts.amazonToken,
        marketplaceId: opts.marketplaceId,
        identifier: key.identifier,
        identifierType: key.identifierType,
      });
      const first = hits[0];
      if (first?.asin) {
        return { asin: first.asin, title: first.title || "" };
      }
    } catch {
      /* try next key */
    }
  }
  return null;
}

export async function enrichAmazonSide(
  hit: OpportunityProduct,
  opts: {
    amazonToken?: string;
    marketplaceId?: string;
    sellingPartnerId?: string;
  },
): Promise<OpportunityProduct> {
  let next = { ...hit };
  if (!opts.amazonToken || !opts.marketplaceId || !next.asin) return next;

  const live = await getAmazonLowestNewPrice({
    accessToken: opts.amazonToken,
    marketplaceId: opts.marketplaceId,
    asin: next.asin,
  }).catch(() => null);
  if (live != null) {
    next = { ...next, amazonPrice: live, buyBoxPrice: live };
  }

  const sellForFees = next.buyBoxPrice ?? next.amazonPrice;
  if (sellForFees) {
    const fee = await getAmazonFeesEstimate({
      accessToken: opts.amazonToken,
      marketplaceId: opts.marketplaceId,
      asin: next.asin,
      price: sellForFees,
      fulfillment: "FBM",
    }).catch(() => null);
    if (fee != null) next = { ...next, amazonFees: fee };
  }

  if (opts.sellingPartnerId) {
    const check = await checkAmazonEligibility({
      accessToken: opts.amazonToken,
      sellerId: opts.sellingPartnerId,
      marketplaceId: opts.marketplaceId,
      asin: next.asin,
    });
    next = {
      ...next,
      eligibility: check.status,
      eligibilityMessage: check.message,
    };
  }
  return next;
}

export async function enrichEbaySide(
  hit: OpportunityProduct,
  ebayToken: string,
): Promise<OpportunityProduct> {
  if (!hit.upc && !hit.title) return hit;
  const live = await searchEbayLivePrices({
    accessToken: ebayToken,
    query: hit.title,
    gtin: hit.upc,
  }).catch(() => null);
  if (!live) return hit;
  return {
    ...hit,
    ebayActiveMedian: live.median,
    ebayActiveLow: live.low,
    ebayActiveCount: live.count,
    ebayPrice: live.median,
    ebayCount: live.count,
    ebayFees: estimateEbayReferralFee(live.median),
    ebayTitle: live.sampleTitle || hit.ebayTitle,
    ebayMatchedByGtin: live.matchedByGtin,
  };
}
