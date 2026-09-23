import { OPPORTUNITY_RULES } from "@/lib/opportunity/types";
import type { OpportunityProduct } from "@/lib/opportunity/types";

/** Minimum Keepa demand score to stock Find Winners / Market as an Amazon product. */
export const AMAZON_PRODUCT_WINNER_MIN = 55;

/** Soft floor — Product Finder uses ≥10; hydrated rows can clear a bit lower. */
export const AMAZON_MIN_BSR_DROPS = 5;

/** If `keepa` flag missing but drops look Keepa-sourced, still accept. */
const KEEPA_SIGNAL_WITHOUT_FLAG = 12;

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
  monthlySold?: number | null;
  amazonOos90?: number | null;
  buyBoxAmazonShare90?: number | null;
  couponPercent?: number | null;
};

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

/**
 * Keepa-driven score for “great product to sell on Amazon”.
 * Velocity + rank + competition + social proof + price stability — not eBay arbitrage.
 * Tuned from how sellers actually use Product Finder: salesRankDrops90 + BSR band + Amazon absent.
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
  else if (drops >= 5) velocity = 10;
  else if (drops >= 3) velocity = 6;

  let rankPts = 0;
  if (rank != null) {
    if (rank >= 1_000 && rank <= 30_000) rankPts = 20;
    else if (rank <= 60_000) rankPts = 16;
    else if (rank <= 100_000) rankPts = 11;
    else if (rank <= OPPORTUNITY_RULES.maxBsr) rankPts = 6;
    else if (rank <= 250_000) rankPts = 3;
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

  let discountBoost = 0;
  if ((hit.discount90 ?? 0) >= 0.15) discountBoost = 3;
  else if ((hit.discount90 ?? 0) >= 0.08) discountBoost = 1;

  // Pro Keepa signals: monthly sold beats raw drops; Amazon OOS opens OA lanes.
  let monthlyBoost = 0;
  const sold = hit.monthlySold ?? 0;
  if (sold >= 500) monthlyBoost = 8;
  else if (sold >= 200) monthlyBoost = 6;
  else if (sold >= 100) monthlyBoost = 4;
  else if (sold >= 50) monthlyBoost = 2;

  let oosBoost = 0;
  if (!hit.amazonRetail && (hit.amazonOos90 ?? 0) >= 80) oosBoost = 6;
  else if (!hit.amazonRetail && (hit.amazonOos90 ?? 0) >= 50) oosBoost = 3;
  else if ((hit.buyBoxAmazonShare90 ?? 100) <= 20 && !hit.amazonRetail) {
    oosBoost = 4;
  }

  let couponBoost = 0;
  if ((hit.couponPercent ?? 0) >= 15) couponBoost = 2;
  else if ((hit.couponPercent ?? 0) >= 8) couponBoost = 1;

  return clamp(
    velocity +
      rankPts +
      competition +
      proof +
      stability +
      ship +
      discountBoost +
      monthlyBoost +
      oosBoost +
      couponBoost,
  );
}

function hasUsablePrice(hit: KeepaSignals): boolean {
  const amazon = hit.buyBoxPrice ?? hit.amazonPrice ?? hit.newPrice ?? null;
  return amazon != null && amazon >= 10 && amazon <= 150;
}

function hasDemandBand(hit: KeepaSignals): boolean {
  const rank = hit.avgSalesRank90 ?? hit.salesRank;
  if (rank == null || rank < 200 || rank > 250_000) return false;
  const drops = hit.bsrDrops90 ?? 0;
  return drops >= AMAZON_MIN_BSR_DROPS;
}

/**
 * Sell-on-Amazon OA winner: Amazon preferably absent, real Keepa velocity.
 * Image preferred but not required when Keepa hydrated title + price + drops.
 */
export function isAmazonProductWinner(hit: KeepaSignals): boolean {
  // Arbitrage judge can mark thin asks as reject — Keepa demand still counts.
  if (hit.verdict === "reject" && !hit.keepa) return false;
  if (hit.policyRisk === "high" || hit.returnRisk === "high") return false;
  if (hit.amazonRetail) return false;
  if (!hasUsablePrice(hit)) return false;
  if (!hasDemandBand(hit)) return false;

  if (hit.sellerCount != null && hit.sellerCount > 20) return false;
  if (
    hit.packageLb != null &&
    hit.packageLb > OPPORTUNITY_RULES.maxPackageLb + 2
  ) {
    return false;
  }

  if (!String(hit.title || "").trim()) return false;
  // Prefer image, but Keepa rows with strong drops are still real.
  if (!String(hit.imageUrl || "").trim() && (hit.bsrDrops90 ?? 0) < 12) {
    return false;
  }

  if (!hit.keepa && (hit.bsrDrops90 ?? 0) < KEEPA_SIGNAL_WITHOUT_FLAG) {
    return false;
  }

  return amazonProductScore(hit) >= AMAZON_PRODUCT_WINNER_MIN;
}

/**
 * Buy-on-Amazon Keepa velocity hit for Amazon→eBay when asks are thin.
 * Amazon retail presence is OK — that is the buy source.
 */
export function isKeepaBuyVelocityWinner(hit: KeepaSignals): boolean {
  if (hit.verdict === "reject" && !hit.keepa) return false;
  if (hit.policyRisk === "high" || hit.returnRisk === "high") return false;
  if (!hasUsablePrice(hit)) return false;
  if (!hasDemandBand(hit)) return false;
  if (!String(hit.title || "").trim()) return false;
  if (
    hit.packageLb != null &&
    hit.packageLb > OPPORTUNITY_RULES.maxPackageLb + 2
  ) {
    return false;
  }
  const drops = hit.bsrDrops90 ?? 0;
  if (!hit.keepa && drops < KEEPA_SIGNAL_WITHOUT_FLAG) return false;
  // Score as if Amazon were absent so retail buy-box doesn't zero competition pts.
  return amazonProductScore({ ...hit, amazonRetail: false }) >= 50 || drops >= 20;
}

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
  if ((hit.monthlySold ?? 0) > 0) {
    parts.push(`${hit.monthlySold!.toLocaleString("en-US")} sold/mo`);
  } else if (drops > 0) {
    parts.push(`${drops} BSR drops / 90d`);
  }
  if (rank != null) parts.push(`BSR ~${rank.toLocaleString("en-US")}`);
  if ((hit.amazonOos90 ?? 0) >= 50) parts.push(`Amazon OOS ${hit.amazonOos90}%`);
  if ((hit.couponPercent ?? 0) > 0) parts.push(`Coupon ${hit.couponPercent}%`);
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
