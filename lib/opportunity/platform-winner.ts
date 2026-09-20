import {
  amazonProductScore,
  isAmazonProductWinner,
  sortAmazonProductWinners,
} from "@/lib/opportunity/amazon-product-winner";
import { isActionableAskSpread } from "@/lib/opportunity/spread";
import { OPPORTUNITY_RULES } from "@/lib/opportunity/types";
import type { OpportunityMode, OpportunityProduct } from "@/lib/opportunity/types";

export function isAmazonSellLane(mode: OpportunityMode): boolean {
  return (
    mode === "amazon" ||
    mode === "ebay_to_amazon" ||
    mode === "homedepot_to_amazon" ||
    mode === "walmart_to_amazon"
  );
}

/**
 * Platform-verified winner — Higlou's bar for Market.
 * - Arbitrage lanes: landed ask keep after fees with a real Amazon cost.
 * - Amazon sell lanes: Keepa demand (BSR velocity, competition, proof).
 * - Supplier: either Keepa Amazon product or arbitrage keep.
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
  mode: OpportunityMode = hit.mode || "amazon_to_ebay",
): boolean {
  if (hit.verdict === "reject") return false;
  if (isStarterBlocked(hit)) return false;

  const asin = String(hit.asin || "").toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) return false;

  const lane = hit.mode || mode;

  if (lane === "amazon" || isAmazonSellLane(lane)) {
    return isAmazonProductWinner(hit);
  }
  if (lane === "supplier") {
    return isAmazonProductWinner(hit) || isArbitrageWinner(hit);
  }
  return isArbitrageWinner(hit);
}

function isArbitrageWinner(hit: OpportunityProduct): boolean {
  const keep = platformKeep(hit);
  if (keep == null || keep < OPPORTUNITY_RULES.minWinnerProfit) return false;
  if (!isActionableAskSpread(hit)) return false;
  const ebay = hit.ebayActiveLow ?? hit.ebayActiveMedian ?? hit.ebayPrice;
  if (ebay == null || ebay <= 0) return false;

  const amazon = hit.cost ?? hit.buyBoxPrice ?? hit.amazonPrice;
  if (amazon == null || amazon <= 0) return false;

  if (hit.ebayMatchedByGtin) return true;
  if ((hit.identityConfidence ?? 0) >= 45) return true;
  if (hit.upc && hit.upc.replace(/\D/g, "").length >= 12) return true;
  return Boolean(hit.title?.trim() && hit.imageUrl?.trim() && keep >= 15);
}

function isStarterBlocked(hit: OpportunityProduct): boolean {
  return hit.policyRisk === "high" || hit.returnRisk === "high";
}

export function sortPlatformWinners(hits: OpportunityProduct[]): OpportunityProduct[] {
  const amazonish = hits.filter(
    (hit) => isAmazonSellLane(hit.mode || "amazon_to_ebay") && isAmazonProductWinner(hit),
  );
  const rest = hits.filter((hit) => !amazonish.includes(hit));

  const byKeep = [...rest].sort((a, b) => {
    const ka = platformKeep(a) ?? -Infinity;
    const kb = platformKeep(b) ?? -Infinity;
    if (kb !== ka) return kb - ka;
    return (b.score ?? 0) - (a.score ?? 0);
  });

  return [...sortAmazonProductWinners(amazonish), ...byKeep];
}

export function platformWinnerMetric(hit: OpportunityProduct): {
  kind: "keep" | "demand";
  value: number;
  label: string;
} {
  if (isAmazonSellLane(hit.mode || "amazon_to_ebay") && isAmazonProductWinner(hit)) {
    const demand = amazonProductScore(hit);
    return { kind: "demand", value: demand, label: `Demand ${demand}` };
  }
  const keep = platformKeep(hit) ?? 0;
  return { kind: "keep", value: keep, label: "You keep" };
}
