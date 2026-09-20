import { isActionableAskSpread } from "@/lib/opportunity/spread";
import { OPPORTUNITY_RULES } from "@/lib/opportunity/types";
import type { OpportunityMode, OpportunityProduct } from "@/lib/opportunity/types";

/**
 * Platform-verified winner — Higlou's bar for Market.
 * Not Terapeak sold comps; landed ask keep after fees with a real Amazon cost.
 */
export function platformKeep(hit: OpportunityProduct): number | null {
  if (hit.soldVerified && hit.netProfit != null && Number.isFinite(hit.netProfit)) {
    return hit.netProfit;
  }
  if (hit.hypotheticalKeep != null && Number.isFinite(hit.hypotheticalKeep)) {
    return hit.hypotheticalKeep;
  }
  return null;
}

export function isPlatformWinner(
  hit: OpportunityProduct,
  mode: OpportunityMode = "amazon_to_ebay",
): boolean {
  if (hit.verdict === "reject") return false;
  if (isStarterBlocked(hit)) return false;

  const asin = String(hit.asin || "").toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) return false;

  const keep = platformKeep(hit);
  if (keep == null || keep < OPPORTUNITY_RULES.minWinnerProfit) return false;

  if (mode !== "amazon") {
    if (!isActionableAskSpread(hit)) return false;
    const ebay = hit.ebayActiveLow ?? hit.ebayActiveMedian ?? hit.ebayPrice;
    if (ebay == null || ebay <= 0) return false;
  }

  const amazon = hit.cost ?? hit.buyBoxPrice ?? hit.amazonPrice;
  if (amazon == null || amazon <= 0) return false;

  // Identity floor — GTIN match or decent title confidence
  if (hit.ebayMatchedByGtin) return true;
  if ((hit.identityConfidence ?? 0) >= 45) return true;
  if (hit.upc && hit.upc.replace(/\D/g, "").length >= 12) return true;
  // Still allow strong keep with a real product photo + title
  return Boolean(hit.title?.trim() && hit.imageUrl?.trim() && keep >= 15);
}

function isStarterBlocked(hit: OpportunityProduct): boolean {
  return hit.policyRisk === "high" || hit.returnRisk === "high";
}

export function sortPlatformWinners(hits: OpportunityProduct[]): OpportunityProduct[] {
  return [...hits].sort((a, b) => {
    const ka = platformKeep(a) ?? -Infinity;
    const kb = platformKeep(b) ?? -Infinity;
    if (kb !== ka) return kb - ka;
    return (b.score ?? 0) - (a.score ?? 0);
  });
}
