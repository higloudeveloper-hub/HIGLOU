import { brandCategoryRisk } from "@/lib/opportunity/categories";
import {
  isFragileTitle,
  isStarterRestrictedTitle,
  scoreProductIdentity,
} from "@/lib/opportunity/identity";
import {
  conservativeSalePrice,
  daysToSellEstimate,
  estimateLandedCost,
  sellThrough90,
} from "@/lib/opportunity/landed";
import { OPPORTUNITY_RULES } from "@/lib/opportunity/types";
import type {
  OpportunityGrade,
  OpportunityMode,
  OpportunityProduct,
  OpportunityVerdict,
} from "@/lib/opportunity/types";

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function demandPts(hit: OpportunityProduct): number {
  const rank = hit.avgSalesRank90 ?? hit.salesRank;
  let pts = 0;
  if (rank != null && rank >= 1_000 && rank <= 80_000) pts += 16;
  else if (rank != null && rank <= 150_000) pts += 10;
  if ((hit.sold30d ?? 0) >= 5) pts += 9;
  else if ((hit.sold90d ?? 0) >= 12) pts += 7;
  return Math.min(25, pts);
}

function profitPts(keep: number | null, roi: number | null, margin: number | null): number {
  if (keep == null || roi == null) return 4;
  let pts = 0;
  if (keep >= 20) pts += 10;
  else if (keep >= OPPORTUNITY_RULES.minWinnerProfit) pts += 8;
  else if (keep >= 4) pts += 3;
  if (roi >= 0.5) pts += 6;
  else if (roi >= OPPORTUNITY_RULES.minRoi) pts += 4;
  if ((margin ?? 0) >= OPPORTUNITY_RULES.minMargin) pts += 4;
  return Math.min(20, pts);
}

function sellThroughPts(rate: number | null): number {
  if (rate == null) return 3;
  if (rate >= 0.5) return 15;
  if (rate >= OPPORTUNITY_RULES.minSellThrough) return 11;
  if (rate >= 0.15) return 6;
  return 2;
}

function identityPts(confidence: number): number {
  if (confidence >= 97) return 10;
  if (confidence >= 80) return 7;
  if (confidence >= 60) return 4;
  return 1;
}

function stabilityPts(variation: number | null, discount90: number | null): number {
  let pts = 0;
  if (variation == null) pts += 4;
  else if (variation <= 0.12) pts += 8;
  else if (variation <= OPPORTUNITY_RULES.maxPriceVariation) pts += 5;
  else pts += 1;
  if ((discount90 ?? 0) >= OPPORTUNITY_RULES.minDiscount90) pts += 2;
  return Math.min(10, pts);
}

function competitionPts(active: number | null, amazonSellers: number | null): number {
  const n = active ?? amazonSellers;
  if (n == null) return 5;
  if (n <= 6) return 10;
  if (n <= 15) return 7;
  if (n <= 40) return 3;
  return 1;
}

function shippingPts(lb: number | null): number {
  if (lb == null) return 3;
  if (lb <= 1) return 5;
  if (lb <= OPPORTUNITY_RULES.maxPackageLb) return 4;
  return 1;
}

function riskPts(hit: OpportunityProduct): number {
  if (hit.policyRisk === "high") return 0;
  if (hit.returnRisk === "high" || hit.policyRisk === "medium") return 2;
  return 5;
}

export function judgeOpportunity(
  hit: OpportunityProduct,
  mode: OpportunityMode,
): Pick<
  OpportunityProduct,
  | "identityConfidence"
  | "identityBasis"
  | "packQty"
  | "sellThrough90"
  | "daysToSell"
  | "expectedSalePrice"
  | "hypotheticalKeep"
  | "landedCost"
  | "priceDropReserve"
  | "promotedFee"
  | "netProfit"
  | "roi"
  | "margin"
  | "shipping"
  | "packing"
  | "returnsReserve"
  | "salePrice"
  | "score"
  | "demandScore"
  | "grade"
  | "verdict"
  | "soldVerified"
  | "returnRisk"
  | "policyRisk"
> {
  const identity = scoreProductIdentity({
    amazonTitle: hit.title,
    ebayTitle: hit.ebayTitle,
    amazonBrand: hit.brand,
    amazonUpc: hit.upc,
    amazonMpn: hit.mpn,
    ebayMatchedByGtin: hit.ebayMatchedByGtin,
  });
  const brandRisk = brandCategoryRisk(hit.brand, hit.title);
  const policyRisk = brandRisk.risky ? "high" : hit.policyRisk || "low";
  const returnRisk: OpportunityProduct["returnRisk"] =
    isFragileTitle(hit.title) || (hit.packageLb ?? 0) > OPPORTUNITY_RULES.maxPackageLb
      ? "high"
      : hit.returnRisk || "medium";
  const soldVerified = Boolean(hit.soldVerified);
  const expectedSale = conservativeSalePrice({
    soldVerified,
    medianSold30: hit.medianSoldPrice,
    p25Sold90: hit.p25Sold90,
  });
  const hypoSale = hit.ebayActiveMedian ?? hit.ebayPrice;
  const str = sellThrough90(hit.sold90d, hit.ebayActiveCount);
  const days = daysToSellEstimate(hit.sold30d, hit.ebayActiveCount);

  const verifiedLanded = estimateLandedCost({
    amazonPrice: hit.amazonPrice,
    salePrice: expectedSale,
    ebayFee: hit.ebayFees,
    outboundShipping: hit.shipping,
  });
  const hypoLanded = estimateLandedCost({
    amazonPrice: hit.amazonPrice,
    salePrice: hypoSale,
    ebayFee: hit.ebayFees,
    outboundShipping: hit.shipping,
  });

  let score = clamp(
    demandPts(hit) +
      profitPts(
        soldVerified ? verifiedLanded.netProfit : hypoLanded.netProfit,
        soldVerified ? verifiedLanded.roi : hypoLanded.roi,
        soldVerified ? verifiedLanded.margin : hypoLanded.margin,
      ) +
      sellThroughPts(str) +
      identityPts(identity.confidence) +
      stabilityPts(hit.priceVariation90, hit.discount90) +
      competitionPts(hit.ebayActiveCount, hit.sellerCount) +
      shippingPts(hit.packageLb) +
      riskPts(hit),
  );

  if (identity.reject || identity.confidence < 40) score = Math.min(score, 40);
  else if (!hit.upc && !hit.mpn) score = Math.min(score, 59);
  if (mode !== "amazon" && !soldVerified) score = Math.min(score, 49);
  if (mode !== "amazon" && (hit.sold30d ?? 0) < 1 && (hit.sold90d ?? 0) < 1) {
    score = Math.min(score, 49);
  }
  if (isFragileTitle(hit.title) || (hit.packageLb ?? 0) > OPPORTUNITY_RULES.maxPackageLb) {
    score -= 15;
  }
  if ((hit.priceVariation90 ?? 0) > OPPORTUNITY_RULES.maxPriceVariation) score -= 15;
  if (hit.sellerCount === 1 && !hit.amazonRetail) score -= 10;
  if (isStarterRestrictedTitle(hit.title) || policyRisk === "high") {
    score = Math.min(score, 40);
  }
  score = clamp(score);

  const winner =
    soldVerified &&
    identity.confidence >= OPPORTUNITY_RULES.minIdentity &&
    !identity.reject &&
    (verifiedLanded.netProfit ?? 0) >= OPPORTUNITY_RULES.minWinnerProfit &&
    (verifiedLanded.roi ?? 0) >= OPPORTUNITY_RULES.minRoi &&
    (verifiedLanded.margin ?? 0) >= OPPORTUNITY_RULES.minMargin &&
    (str ?? 0) >= OPPORTUNITY_RULES.minSellThrough &&
    (days == null || days <= OPPORTUNITY_RULES.maxDaysToSell) &&
    ((hit.sold30d ?? 0) >= OPPORTUNITY_RULES.minSold30 ||
      (hit.sold90d ?? 0) >= OPPORTUNITY_RULES.minSold90) &&
    (hit.ebayActiveCount == null ||
      hit.ebayActiveCount <= OPPORTUNITY_RULES.maxActiveCompetitors) &&
    hit.policyRisk !== "high" &&
    hit.returnRisk !== "high" &&
    policyRisk !== "high" &&
    returnRisk !== "high";

  let verdict: OpportunityVerdict = "candidate";
  if (identity.reject || policyRisk === "high" || isStarterRestrictedTitle(hit.title)) {
    verdict = "reject";
  } else if (winner && score >= 85) verdict = "winner";
  else if (soldVerified && score >= 70) verdict = "good";
  else if (soldVerified && score >= 50) verdict = "watch";
  else if (!soldVerified && mode !== "amazon") verdict = "candidate";
  else if (score < 50) verdict = "reject";
  else verdict = "candidate";

  const grade: OpportunityGrade =
    verdict === "winner"
      ? "excellent"
      : verdict === "good"
        ? "good"
        : verdict === "watch"
          ? "review"
          : "discard";

  const useLanded = soldVerified ? verifiedLanded : hypoLanded;

  return {
    identityConfidence: identity.confidence,
    identityBasis: identity.basis,
    packQty: identity.amazonPack,
    sellThrough90: str,
    daysToSell: days,
    expectedSalePrice: expectedSale,
    hypotheticalKeep: hypoLanded.netProfit,
    landedCost: soldVerified ? verifiedLanded.totalCost : hypoLanded.totalCost,
    priceDropReserve: useLanded.priceDropReserve,
    promotedFee: useLanded.promotedFee,
    netProfit: soldVerified ? verifiedLanded.netProfit : null,
    roi: soldVerified ? verifiedLanded.roi : hypoLanded.roi,
    margin: soldVerified ? verifiedLanded.margin : hypoLanded.margin,
    shipping: useLanded.outboundShipping,
    packing: useLanded.packing,
    returnsReserve: useLanded.returnsReserve,
    salePrice: expectedSale ?? hypoSale,
    score,
    demandScore: demandPts(hit),
    grade,
    verdict,
    soldVerified,
    returnRisk,
    policyRisk,
  };
}

export function isBoardCandidate(
  hit: OpportunityProduct,
  mode: OpportunityMode,
): boolean {
  if (hit.verdict === "reject") return false;
  if (hit.identityConfidence != null && hit.identityConfidence < 40) return false;
  const amazon = hit.amazonPrice ?? hit.cost ?? null;
  if (amazon == null || amazon <= 0) return false;
  if (mode === "amazon") return true;
  const ebay = hit.ebayActiveMedian ?? hit.ebayPrice ?? hit.medianSoldPrice;
  return ebay != null && ebay > 0;
}

export function isVerifiedWinner(hit: OpportunityProduct): boolean {
  return hit.verdict === "winner" && hit.soldVerified === true;
}
