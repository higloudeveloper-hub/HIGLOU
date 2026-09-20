import {
  amazonProductScore,
  isAmazonProductWinner,
  isKeepaBuyVelocityWinner,
  sortAmazonProductWinners,
} from "@/lib/opportunity/amazon-product-winner";
import { isRetailToMarketplaceMode } from "@/lib/opportunity/markets";
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
 * Platform-verified winner — Higlou's bar for Market + Find Winners.
 * Real money only: ask keep, Keepa Amazon demand, or retail→marketplace keep.
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
  const sourceId = String(hit.sourceId || "").trim();
  const lane = hit.mode || mode;

  if (isRetailToMarketplaceMode(lane) || lane === "ebay_to_amazon") {
    if (!sourceId && !/^[A-Z0-9]{10}$/.test(asin)) return false;
    return isRetailRouteWinner(hit);
  }

  if (!/^[A-Z0-9]{10}$/.test(asin)) return false;
  if (isArbitrageWinner(hit)) return true;
  if (isAmazonSellLane(lane) || lane === "amazon" || lane === "supplier") {
    return isAmazonProductWinner(hit);
  }
  // Amazon→eBay: Keepa velocity when asks are quiet — never a money-losing ask.
  if (isAmazonProductWinner(hit)) return true;
  if (!isKeepaBuyVelocityWinner(hit)) return false;
  const keep = platformKeep(hit);
  if (keep == null) return true;
  return keep >= OPPORTUNITY_RULES.minWinnerProfit;
}

function isRetailRouteWinner(hit: OpportunityProduct): boolean {
  const keep = platformKeep(hit);
  if (keep == null || keep < OPPORTUNITY_RULES.minWinnerProfit) return false;
  if (hit.cost == null || hit.cost <= 0) return false;
  if ((hit.identityConfidence ?? 0) < 60 && !hit.ebayMatchedByGtin && !hit.asin) {
    return false;
  }
  const dest = hit.destMarket;
  if (dest === "amazon") {
    return (hit.amazonPrice ?? hit.buyBoxPrice) != null;
  }
  return (hit.ebayActiveLow ?? hit.ebayActiveMedian ?? hit.ebayPrice) != null;
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
  const keepHits = hits.filter(
    (hit) => isArbitrageWinner(hit) || isRetailRouteWinner(hit),
  );
  const demandHits = hits.filter(
    (hit) =>
      (isAmazonProductWinner(hit) || isKeepaBuyVelocityWinner(hit)) &&
      !isArbitrageWinner(hit) &&
      !isRetailRouteWinner(hit),
  );

  const byKeep = [...keepHits].sort((a, b) => {
    const ka = platformKeep(a) ?? -Infinity;
    const kb = platformKeep(b) ?? -Infinity;
    if (kb !== ka) return kb - ka;
    return (b.score ?? 0) - (a.score ?? 0);
  });

  return [...byKeep, ...sortAmazonProductWinners(demandHits)];
}

export function platformWinnerMetric(hit: OpportunityProduct): {
  kind: "keep" | "demand";
  value: number;
  label: string;
} {
  if (isArbitrageWinner(hit) || isRetailRouteWinner(hit)) {
    const keep = platformKeep(hit) ?? 0;
    return { kind: "keep", value: keep, label: "You keep" };
  }
  const demand = amazonProductScore(hit);
  return { kind: "demand", value: demand, label: `Demand ${demand}` };
}

export { isArbitrageWinner, isRetailRouteWinner };
