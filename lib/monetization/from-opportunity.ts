import type { OpportunityProduct } from "@/lib/opportunity/types";
import type { MonetizationInput } from "@/lib/monetization/types";
import { getMonetizationRecommendation } from "@/lib/monetization/decision-engine";
import type { MonetizationDecision } from "@/lib/monetization/types";

/**
 * Map a Find Winners / opportunity hit into Money Engine input.
 * Reuses already-computed profit, fees, eligibility — no re-scan.
 */
export function opportunityToMonetizationInput(
  hit: OpportunityProduct,
): MonetizationInput {
  const cost =
    hit.cost != null && hit.cost > 0
      ? hit.cost
      : hit.amazonPrice != null && hit.amazonPrice > 0
        ? hit.amazonPrice
        : null;

  const ebaySale =
    hit.expectedSalePrice ??
    hit.ebayActiveMedian ??
    hit.ebayPrice ??
    hit.salePrice ??
    null;

  return {
    title: hit.title || "",
    brand: hit.brand || "",
    asin: hit.asin || null,
    upc: hit.upc || null,
    ebayPrice: ebaySale,
    amazonPrice: hit.amazonPrice,
    cost,
    amazonFees: hit.amazonFees,
    ebayFees: hit.ebayFees,
    shipping: hit.shipping,
    packing: hit.packing,
    amazonEligibility: hit.eligibility,
    amazonEligibilityMessage: hit.eligibilityMessage || null,
    demandScore: hit.demandScore,
    sellerCount: hit.sellerCount,
    opportunityScore: hit.score,
    opportunityVerdict: hit.verdict,
    soldVerified: hit.soldVerified,
  };
}

/** Instant recommendation from a winners card (no extra Amazon/Keepa calls). */
export function recommendFromOpportunity(
  hit: OpportunityProduct,
  opts?: {
    affiliateTagConfigured?: boolean;
    affiliateEngineEnabled?: boolean;
    moneyScoreEnabled?: boolean;
  },
): MonetizationDecision {
  return getMonetizationRecommendation({
    ...opportunityToMonetizationInput(hit),
    affiliateTagConfigured: opts?.affiliateTagConfigured ?? false,
    affiliateEngineEnabled: opts?.affiliateEngineEnabled ?? false,
    moneyScoreEnabled: opts?.moneyScoreEnabled ?? true,
  });
}

const SEED_PREFIX = "higlou.money.seed.";

/** Stash winners economics for the listing Money Card after import. */
export function stashOpportunityMoneySeed(hit: OpportunityProduct) {
  if (typeof window === "undefined") return;
  const asin = String(hit.asin || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) return;
  try {
    sessionStorage.setItem(
      `${SEED_PREFIX}${asin}`,
      JSON.stringify(opportunityToMonetizationInput(hit)),
    );
  } catch {
    /* quota / private mode */
  }
}

export function takeOpportunityMoneySeed(
  asin: string | null | undefined,
): MonetizationInput | null {
  if (typeof window === "undefined") return null;
  const key = String(asin || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(key)) return null;
  try {
    const raw = sessionStorage.getItem(`${SEED_PREFIX}${key}`);
    if (!raw) return null;
    sessionStorage.removeItem(`${SEED_PREFIX}${key}`);
    return JSON.parse(raw) as MonetizationInput;
  } catch {
    return null;
  }
}
