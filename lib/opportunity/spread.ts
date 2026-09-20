import { estimateLandedCost } from "@/lib/opportunity/landed";
import { estimateEbayReferralFee } from "@/lib/opportunity/profit";
import { OPPORTUNITY_RULES } from "@/lib/opportunity/types";

function money(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Conservative eBay ask for ranking when sold comps are unavailable.
 * Prefer the live low BIN; otherwise haircut the median.
 */
export function askBasedSalePrice(opts: {
  low?: number | null;
  median?: number | null;
}): number | null {
  if (opts.low != null && opts.low > 0) return money(opts.low);
  if (opts.median != null && opts.median > 0) return money(opts.median * 0.92);
  return null;
}

/** Minimum keep we bother showing on the board (ask-based, not sold). */
export const MIN_ACTIONABLE_ASK_KEEP = 6;

/**
 * True when Amazon→eBay math clears fees/ship using a conservative ask.
 * This is NOT sold-verified cash — it is a real spread worth opening.
 */
export function isActionableAskSpread(hit: {
  amazonPrice?: number | null;
  buyBoxPrice?: number | null;
  cost?: number | null;
  ebayActiveLow?: number | null;
  ebayActiveMedian?: number | null;
  ebayPrice?: number | null;
  ebayFees?: number | null;
  hypotheticalKeep?: number | null;
  packageLb?: number | null;
}): boolean {
  const cost = hit.cost ?? hit.buyBoxPrice ?? hit.amazonPrice ?? null;
  const sale =
    askBasedSalePrice({
      low: hit.ebayActiveLow,
      median: hit.ebayActiveMedian ?? hit.ebayPrice,
    }) ?? null;
  if (cost == null || cost <= 0 || sale == null || sale <= 0) return false;
  // Need meaningful gross before fees (avoids $0.50 "opportunities").
  if (sale < cost * 1.18) return false;
  if ((hit.packageLb ?? 0) > OPPORTUNITY_RULES.maxPackageLb) return false;

  if (hit.hypotheticalKeep != null) {
    return hit.hypotheticalKeep >= MIN_ACTIONABLE_ASK_KEEP;
  }

  const landed = estimateLandedCost({
    amazonPrice: cost,
    salePrice: sale,
    ebayFee: hit.ebayFees ?? estimateEbayReferralFee(sale),
  });
  return (landed.netProfit ?? -999) >= MIN_ACTIONABLE_ASK_KEEP;
}

export function rankKeepAmount(hit: {
  soldVerified?: boolean;
  netProfit?: number | null;
  hypotheticalKeep?: number | null;
}): number {
  if (hit.soldVerified && hit.netProfit != null) return hit.netProfit;
  if (hit.hypotheticalKeep != null) return hit.hypotheticalKeep;
  if (hit.netProfit != null) return hit.netProfit;
  return Number.NEGATIVE_INFINITY;
}
