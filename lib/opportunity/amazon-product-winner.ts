import { OPPORTUNITY_RULES } from "@/lib/opportunity/types";
import type { OpportunityProduct } from "@/lib/opportunity/types";

/** Minimum Keepa demand score to stock Find Winners / Market as an Amazon product. */
export const AMAZON_PRODUCT_WINNER_MIN = 68;

/** Soft floor — Product Finder uses 15; hydrated rows can clear a bit lower. */
export const AMAZON_MIN_BSR_DROPS = 8;

type KeepaSignals = {
  salesRank?: number | null;
  avgSalesRank90?: number | null;
  bsrDrops90?: number | null;
  sellerCount?: number | null;
  amazonRetail?: boolean;
  rating?: number | null;
  reviewCount?: number | null;
  priceVariation90?: number | null;
  discount90?: number | null;
  packageLb?: number | null;
  buyBoxPrice?: number | null;
  amazonPrice?: number | null;
  newPrice?: number | null;
  keepa?: boolean;
  title?: string | null;
  imageUrl?: string | null;
  policyRisk?: string | null;
  returnRisk?: string | null;
  verdict?: string | null;
};

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

/**
 * Keepa-driven score for “great product to sell on Amazon”.
 * Velocity + rank + competition + social proof + price stability — not eBay arbitrage.
 */
export function amazonProductScore(hit: KeepaSignals): number {
  const rank = hit.avgSalesRank90 ?? hit.salesRank;
  const drops = hit.bsrDrops90 ?? 0;
  const sellers = hit.sellerCount;
  const rating = hit.rating ?? 0;
  const reviews = hit.reviewCount ?? 0;
  const variation = hit.priceVariation90;
  const lb = hit.packageLb;

  let velocity = 0;
  if (drops >= 40) velocity = 30;
  else if (drops >= 25) velocity = 26;
  else if (drops >= 15) velocity = 22;
  else if (drops >= 8) velocity = 14;
  else if (drops >= 3) velocity = 6;

  let rankPts = 0;
  if (rank != null) {
    if (rank >= 1_000 && rank <= 30_000) rankPts = 20;
    else if (rank <= 60_000) rankPts = 16;
    else if (rank <= 100_000) rankPts = 11;
    else if (rank <= OPPORTUNITY_RULES.maxBsr) rankPts = 6;
  }

  let competition = 0;
  if (hit.amazonRetail) competition = 0;
  else if (sellers == null) competition = 8;
  else if (sellers >= 2 && sellers <= 6) competition = 20;
  else if (sellers <= 8) competition = 16;
  else if (sellers <= OPPORTUNITY_RULES.maxSellers) competition = 10;
  else if (sellers <= 20) competition = 4;

  let proof = 0;
  if (rating >= 4.3 && reviews >= 80) proof = 15;
  else if (rating >= 4.0 && reviews >= 30) proof = 12;
  else if (rating >= 3.8 && reviews >= 10) proof = 7;
  else if (reviews >= 5) proof = 3;

  let stability = 0;
  if (variation == null) stability = 5;
  else if (variation <= 0.1) stability = 10;
  else if (variation <= OPPORTUNITY_RULES.maxPriceVariation) stability = 7;
  else if (variation <= 0.4) stability = 3;

  let ship = 0;
  if (lb == null) ship = 3;
  else if (lb <= 1) ship = 5;
  else if (lb <= OPPORTUNITY_RULES.maxPackageLb) ship = 4;

  // Mild boost when currently discounted vs 90d avg — restock window.
  let discountBoost = 0;
  if ((hit.discount90 ?? 0) >= 0.15) discountBoost = 3;
  else if ((hit.discount90 ?? 0) >= 0.08) discountBoost = 1;

  return clamp(velocity + rankPts + competition + proof + stability + ship + discountBoost);
}

export function isAmazonProductWinner(hit: KeepaSignals): boolean {
  if (hit.verdict === "reject") return false;
  if (hit.policyRisk === "high" || hit.returnRisk === "high") return false;
  if (hit.amazonRetail) return false;

  const price =
    hit.buyBoxPrice ?? hit.amazonPrice ?? hit.newPrice ?? null;
  if (price == null || price < OPPORTUNITY_RULES.minPrice || price > OPPORTUNITY_RULES.maxPrice) {
    return false;
  }

  const rank = hit.avgSalesRank90 ?? hit.salesRank;
  if (rank == null || rank < OPPORTUNITY_RULES.minBsr || rank > OPPORTUNITY_RULES.maxBsr) {
    return false;
  }

  const drops = hit.bsrDrops90 ?? 0;
  if (drops < AMAZON_MIN_BSR_DROPS) return false;

  if (
    hit.sellerCount != null &&
    hit.sellerCount > OPPORTUNITY_RULES.maxSellers
  ) {
    return false;
  }

  if (
    hit.packageLb != null &&
    hit.packageLb > OPPORTUNITY_RULES.maxPackageLb
  ) {
    return false;
  }

  if (!String(hit.title || "").trim() || !String(hit.imageUrl || "").trim()) {
    return false;
  }

  // Prefer Keepa-hydrated rows; allow high score if BSR drops present (Keepa signal).
  if (!hit.keepa && drops < KEEPA_SIGNAL_WITHOUT_FLAG) return false;

  return amazonProductScore(hit) >= AMAZON_PRODUCT_WINNER_MIN;
}

/** If `keepa` flag missing but drops look Keepa-sourced, still accept. */
const KEEPA_SIGNAL_WITHOUT_FLAG = 15;

export function amazonWinnerHeat(
  score: number,
): "hot" | "warm" | "fresh" {
  if (score >= 82) return "hot";
  if (score >= 74) return "warm";
  return "fresh";
}

export function amazonWinnerBlurb(hit: KeepaSignals): string {
  const drops = hit.bsrDrops90 ?? 0;
  const rank = hit.avgSalesRank90 ?? hit.salesRank;
  const sellers = hit.sellerCount;
  const parts = ["Keepa verified"];
  if (drops > 0) parts.push(`${drops} BSR drops / 90d`);
  if (rank != null) parts.push(`BSR ~${rank.toLocaleString("en-US")}`);
  if (sellers != null) parts.push(`${sellers} new sellers`);
  return parts.join(" · ");
}

export function sortAmazonProductWinners<T extends KeepaSignals & { score?: number }>(
  hits: T[],
): T[] {
  return [...hits].sort((a, b) => {
    const sa = amazonProductScore(a);
    const sb = amazonProductScore(b);
    if (sb !== sa) return sb - sa;
    return (b.score ?? 0) - (a.score ?? 0);
  });
}

export function isOpportunityProductAmazonWinner(
  hit: OpportunityProduct,
): boolean {
  return isAmazonProductWinner(hit);
}
