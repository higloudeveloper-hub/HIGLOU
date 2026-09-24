import { amazonProductScore } from "@/lib/opportunity/amazon-product-winner";
import type { OpportunityProduct } from "@/lib/opportunity/types";
import {
  KEEPA_STRATEGY_IDS,
  type KeepaStrategyId,
} from "@/lib/keepa/strategies";
import { scoreAsin } from "@/lib/ron/learn";
import type { RonLearning } from "@/lib/ron/types";

export type RonStrategyHit = OpportunityProduct & {
  /** Strategies that independently surfaced this ASIN in the general scan */
  ronStrategies: KeepaStrategyId[];
  ronDecisionScore: number;
};

export function scoreKeepaStrategy(
  learning: RonLearning,
  strategy: KeepaStrategyId,
): number {
  return 1 + Math.min(2.5, Number(learning.strategies?.[strategy]) || 0);
}

/**
 * Merge winners from every Keepa modality.
 * ASINs found by multiple strategies get consensus boost — that’s RON’s edge.
 */
export function mergeRonKeepaStrategyHits(
  byStrategy: Partial<Record<KeepaStrategyId, OpportunityProduct[]>>,
  learning: RonLearning,
): RonStrategyHit[] {
  const map = new Map<string, RonStrategyHit>();

  for (const strategy of KEEPA_STRATEGY_IDS) {
    const hits = byStrategy[strategy] || [];
    for (const hit of hits) {
      const asin = String(hit.asin || "")
        .trim()
        .toUpperCase();
      if (!/^[A-Z0-9]{10}$/.test(asin)) continue;
      const existing = map.get(asin);
      if (!existing) {
        map.set(asin, {
          ...hit,
          asin,
          keepa: true,
          keepaStrategy: hit.keepaStrategy || strategy,
          ronStrategies: [strategy],
          ronDecisionScore: 0,
        });
        continue;
      }
      if (!existing.ronStrategies.includes(strategy)) {
        existing.ronStrategies.push(strategy);
      }
      // Prefer richer title / image / price from any modality
      if (!existing.imageUrl && hit.imageUrl) existing.imageUrl = hit.imageUrl;
      if (
        hit.title &&
        hit.title.trim().length > String(existing.title || "").trim().length
      ) {
        existing.title = hit.title;
      }
      if (existing.buyBoxPrice == null && hit.buyBoxPrice != null) {
        existing.buyBoxPrice = hit.buyBoxPrice;
      }
      if (existing.amazonPrice == null && hit.amazonPrice != null) {
        existing.amazonPrice = hit.amazonPrice;
      }
      if ((hit.bsrDrops90 ?? 0) > (existing.bsrDrops90 ?? 0)) {
        existing.bsrDrops90 = hit.bsrDrops90;
      }
      if ((hit.score ?? 0) > (existing.score ?? 0)) {
        existing.score = hit.score;
      }
      // Primary strategy = highest learned weight among matches
      const best = existing.ronStrategies
        .slice()
        .sort(
          (a, b) => scoreKeepaStrategy(learning, b) - scoreKeepaStrategy(learning, a),
        )[0];
      if (best) existing.keepaStrategy = best;
    }
  }

  const ranked = [...map.values()].map((hit) => ({
    ...hit,
    ronDecisionScore: scoreRonKeepaDecision(hit, learning),
  }));

  ranked.sort((a, b) => b.ronDecisionScore - a.ronDecisionScore);
  return ranked;
}

/**
 * Exact decision score for Facebook / affiliate priority.
 * Multi-strategy consensus > single hot deal; learning weights the rest.
 */
export function scoreRonKeepaDecision(
  hit: Pick<
    RonStrategyHit,
    | "ronStrategies"
    | "asin"
    | "score"
    | "bsrDrops90"
    | "buyBoxPrice"
    | "amazonPrice"
    | "keepa"
    | "title"
    | "imageUrl"
    | "brand"
    | "sellerCount"
    | "amazonRetail"
    | "salesRank"
    | "avgSalesRank90"
    | "monthlySold"
    | "discount90"
  >,
  learning: RonLearning,
): number {
  const strategies = hit.ronStrategies?.length
    ? hit.ronStrategies
    : (["velocity"] as KeepaStrategyId[]);
  const consensus = strategies.length;
  const product = amazonProductScore(hit);
  const asinBoost = scoreAsin(learning, hit.asin);
  const strategyBoost = strategies.reduce(
    (s, id) => s + scoreKeepaStrategy(learning, id),
    0,
  );
  const drops = Math.min(40, Number(hit.bsrDrops90) || 0);
  const price =
    hit.buyBoxPrice ?? hit.amazonPrice ?? 0;
  // Prefer mid-ticket deals that convert on FB ($12–$80)
  const priceBand =
    price >= 12 && price <= 80 ? 8 : price > 0 && price < 120 ? 3 : 0;

  return (
    product * 1.1 +
    consensus * 18 +
    strategyBoost * 4 +
    asinBoost * 3 +
    drops * 0.35 +
    priceBand +
    (Number(hit.score) || 0) * 0.15
  );
}

/** Top N after exact ranking — ready for boards / affiliates / Facebook. */
export function pickRonKeepaDecisions(
  ranked: RonStrategyHit[],
  limit = 12,
): RonStrategyHit[] {
  return ranked.slice(0, Math.max(1, Math.min(limit, 24)));
}

export function summarizeStrategyCounts(
  byStrategy: Partial<Record<KeepaStrategyId, OpportunityProduct[]>>,
): string {
  const parts: string[] = [];
  for (const id of KEEPA_STRATEGY_IDS) {
    const n = byStrategy[id]?.length || 0;
    if (n > 0) parts.push(`${id}:${n}`);
  }
  return parts.length ? parts.join(" · ") : "sin hits";
}
