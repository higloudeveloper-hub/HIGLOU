import { brandCategoryRisk } from "@/lib/opportunity/categories";
import { OPPORTUNITY_RULES } from "@/lib/opportunity/types";
import type {
  EligibilityStatus,
  OpportunityGrade,
  OpportunityMode,
  OpportunityProduct,
  OpportunityReason,
} from "@/lib/opportunity/types";

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function demandPoints(hit: {
  salesRank: number | null;
  avgSalesRank90: number | null;
  bsrDrops90: number | null;
  rating: number | null;
  reviewCount: number | null;
}): number {
  const rank = hit.avgSalesRank90 ?? hit.salesRank;
  let points = 0;
  if (rank != null && rank >= OPPORTUNITY_RULES.minBsr && rank <= 80_000) {
    points += 10;
  } else if (rank != null && rank <= OPPORTUNITY_RULES.maxBsr) {
    points += 6;
  }
  if ((hit.bsrDrops90 ?? 0) >= 8) points += 6;
  else if ((hit.bsrDrops90 ?? 0) >= 3) points += 3;
  if ((hit.rating ?? 0) >= 4 && (hit.reviewCount ?? 0) >= 10) points += 4;
  return Math.min(20, points);
}

function competitionPoints(hit: {
  sellerCount: number | null;
  amazonRetail: boolean;
}): number {
  if (hit.amazonRetail) return 2;
  const n = hit.sellerCount;
  if (n == null) return 6;
  if (n > 15) return 2;
  if (n < OPPORTUNITY_RULES.minSellers) return 5;
  if (n <= 8) return 15;
  if (n <= OPPORTUNITY_RULES.maxSellers) return 11;
  return 4;
}

function eligibilityPoints(status: EligibilityStatus): number {
  if (status === "SELLABLE") return 15;
  if (status === "UNKNOWN") return 6;
  if (status === "API_ERROR") return 4;
  if (status === "APPROVAL_REQUIRED" || status === "CONDITION_RESTRICTED") {
    return 0;
  }
  return 0;
}

function profitPoints(hit: {
  netProfit: number | null;
  roi: number | null;
  margin: number | null;
}): number {
  if (hit.netProfit == null || hit.roi == null) return 8;
  let points = 0;
  if (hit.netProfit >= 14) points += 12;
  else if (hit.netProfit >= OPPORTUNITY_RULES.minNetProfit) points += 8;
  else if (hit.netProfit > 0) points += 3;
  if (hit.roi >= 0.5) points += 8;
  else if (hit.roi >= OPPORTUNITY_RULES.minRoi) points += 5;
  else if (hit.roi > 0) points += 2;
  if ((hit.margin ?? 0) >= OPPORTUNITY_RULES.minMargin) points += 5;
  return Math.min(25, points);
}

function stabilityPoints(variation: number | null): number {
  if (variation == null) return 5;
  if (variation <= 0.12) return 10;
  if (variation <= OPPORTUNITY_RULES.maxPriceVariation) return 7;
  return 2;
}

function riskPoints(brand: string, title: string): number {
  return brandCategoryRisk(brand, title).risky ? 2 : 10;
}

function trendPoints(bsrDrops90: number | null): number {
  if ((bsrDrops90 ?? 0) >= 12) return 5;
  if ((bsrDrops90 ?? 0) >= 4) return 3;
  return 1;
}

function ebayLanePoints(
  ebayActiveCount: number | null | undefined,
  netProfit: number | null,
): number {
  const n = ebayActiveCount;
  if (n == null) return 4;
  if (n <= 6 && (netProfit == null || netProfit > 0)) return 12;
  if (n <= 15) return 7;
  if (n <= 40) return 3;
  return 1;
}

export function opportunityGrade(score: number): OpportunityGrade {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 55) return "review";
  return "discard";
}

export function opportunityLabelFromScore(
  score: number,
  eligibility: EligibilityStatus,
): "now" | "watch" | "thin" {
  if (
    eligibility === "RESTRICTED" ||
    eligibility === "APPROVAL_REQUIRED" ||
    eligibility === "CONDITION_RESTRICTED"
  ) {
    return "thin";
  }
  if (score >= 85) return "now";
  if (score >= 70) return "watch";
  return "thin";
}

export function buildOpportunityReasons(hit: {
  eligibility: EligibilityStatus;
  netProfit: number | null;
  roi: number | null;
  priceVariation90: number | null;
  sellerCount: number | null;
  amazonRetail: boolean;
  demandScore: number;
  brand: string;
  title: string;
  soldVerified?: boolean;
  mode?: OpportunityMode;
}): OpportunityReason[] {
  const risk = brandCategoryRisk(hit.brand, hit.title);
  const reasons: OpportunityReason[] = [
    {
      ok: hit.eligibility === "SELLABLE",
      text:
        hit.eligibility === "SELLABLE"
          ? "You can sell it"
          : hit.eligibility === "APPROVAL_REQUIRED"
            ? "Amazon needs approval"
            : hit.eligibility === "RESTRICTED"
              ? "Your account cannot sell this"
              : "Eligibility not confirmed",
    },
    {
      ok:
        hit.mode === "amazon_to_ebay"
          ? hit.soldVerified === true &&
            (hit.netProfit ?? 0) >= OPPORTUNITY_RULES.minNetProfit
          : (hit.netProfit ?? 0) >= OPPORTUNITY_RULES.minNetProfit,
      text:
        hit.mode === "amazon_to_ebay" && hit.soldVerified !== true
          ? "CANDIDATE — SALES NOT VERIFIED"
          : hit.netProfit == null
            ? "Need cost and live fees for profit"
            : `Estimated profit $${hit.netProfit.toFixed(2)}`,
    },
    {
      ok: (hit.roi ?? 0) >= OPPORTUNITY_RULES.minRoi,
      text:
        hit.roi == null
          ? "ROI unknown"
          : `ROI ${Math.round(hit.roi * 100)}%`,
    },
    {
      ok:
        hit.priceVariation90 == null ||
        hit.priceVariation90 <= OPPORTUNITY_RULES.maxPriceVariation,
      text:
        hit.priceVariation90 == null
          ? "Price history not loaded"
          : hit.priceVariation90 <= OPPORTUNITY_RULES.maxPriceVariation
            ? "Price stable"
            : "Price moved too much",
    },
    {
      ok:
        hit.sellerCount != null &&
        hit.sellerCount >= OPPORTUNITY_RULES.minSellers &&
        hit.sellerCount <= OPPORTUNITY_RULES.maxSellers,
      text:
        hit.sellerCount == null
          ? "Seller count unknown"
          : `${hit.sellerCount} sellers`,
    },
    {
      ok: !hit.amazonRetail,
      text: hit.amazonRetail
        ? "Amazon is selling it — you can still buy and list on eBay"
        : "Amazon is not selling it",
    },
    {
      ok: hit.demandScore >= 10,
      text: hit.demandScore >= 10 ? "Demand looks stable" : "Demand is thin",
    },
  ];
  if (risk.risky) reasons.push({ ok: false, text: risk.reason });
  return reasons;
}

export function scoreOpportunity(hit: {
  eligibility: EligibilityStatus;
  netProfit: number | null;
  roi: number | null;
  margin: number | null;
  salesRank: number | null;
  avgSalesRank90: number | null;
  bsrDrops90: number | null;
  rating: number | null;
  reviewCount: number | null;
  sellerCount: number | null;
  amazonRetail: boolean;
  priceVariation90: number | null;
  brand: string;
  title: string;
  ebayActiveCount?: number | null;
}): { score: number; demandScore: number; grade: OpportunityGrade } {
  if (
    hit.eligibility === "RESTRICTED" ||
    hit.eligibility === "CONDITION_RESTRICTED"
  ) {
    return { score: 0, demandScore: demandPoints(hit), grade: "discard" };
  }
  const demandScore = demandPoints(hit);
  const score = clamp(
    profitPoints(hit) +
      demandScore +
      eligibilityPoints(hit.eligibility) +
      competitionPoints(hit) +
      stabilityPoints(hit.priceVariation90) +
      riskPoints(hit.brand, hit.title) +
      trendPoints(hit.bsrDrops90) +
      ebayLanePoints(hit.ebayActiveCount, hit.netProfit),
  );
  return { score, demandScore, grade: opportunityGrade(score) };
}

export function passesMainOpportunityScreen(
  hit: Pick<
    OpportunityProduct,
    | "eligibility"
    | "netProfit"
    | "roi"
    | "priceVariation90"
    | "sellerCount"
    | "amazonRetail"
    | "upc"
    | "title"
  >,
  opts?: { requireProfit?: boolean; mode?: OpportunityMode },
): boolean {
  const mode = opts?.mode || "amazon_to_ebay";
  if (
    hit.eligibility === "RESTRICTED" ||
    hit.eligibility === "CONDITION_RESTRICTED"
  ) {
    return false;
  }
  if (mode === "amazon" || mode === "supplier") {
    if (hit.eligibility !== "SELLABLE" && hit.eligibility !== "UNKNOWN") {
      return false;
    }
    if (hit.amazonRetail) return false;
    if (
      hit.sellerCount != null &&
      hit.sellerCount > OPPORTUNITY_RULES.maxSellers
    ) {
      return false;
    }
  }
  if (opts?.requireProfit) {
    if ((hit.netProfit ?? 0) < OPPORTUNITY_RULES.minNetProfit) return false;
    if ((hit.roi ?? 0) < OPPORTUNITY_RULES.minRoi) return false;
  }
  return true;
}

/** Priced Amazon + eBay candidate. Active asks are not sold comps. */
export function isConfirmedOpportunity(
  hit: {
    amazonPrice?: number | null;
    ebayPrice?: number | null;
    ebayActiveMedian?: number | null;
    netProfit?: number | null;
    cost?: number | null;
    eligibility?: EligibilityStatus;
    amazonRetail?: boolean;
    sellerCount?: number | null;
    roi?: number | null;
    priceVariation90?: number | null;
    upc?: string;
    title?: string;
    verdict?: string;
    identityConfidence?: number;
  },
  mode: OpportunityMode = "amazon_to_ebay",
): boolean {
  if (hit.verdict === "reject") return false;
  if (hit.identityConfidence != null && hit.identityConfidence < 40) return false;
  if (!passesMainOpportunityScreen(hit, { mode })) return false;
  const amazon = hit.amazonPrice ?? hit.cost ?? null;
  if (amazon == null || amazon <= 0) return false;
  if (mode !== "amazon") {
    const ebay = hit.ebayActiveMedian ?? hit.ebayPrice ?? null;
    if (ebay == null || ebay <= 0) return false;
  }
  return true;
}

export function sortByOpportunityScore<T extends { score: number; asin: string }>(
  hits: T[],
): T[] {
  return [...hits].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.asin.localeCompare(b.asin);
  });
}

/** Rank by cash you keep, then score. Never bury a real payday. */
export function sortByRealMoney<
  T extends { score: number; asin: string; netProfit?: number | null },
>(hits: T[]): T[] {
  return [...hits].sort((a, b) => {
    const pa = a.netProfit;
    const pb = b.netProfit;
    const aKnown = pa != null && Number.isFinite(pa);
    const bKnown = pb != null && Number.isFinite(pb);
    if (aKnown && bKnown && pb !== pa) return (pb as number) - (pa as number);
    if (bKnown !== aKnown) return bKnown ? 1 : -1;
    if (b.score !== a.score) return b.score - a.score;
    return a.asin.localeCompare(b.asin);
  });
}
