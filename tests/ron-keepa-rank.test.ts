import { describe, expect, it } from "vitest";
import {
  mergeRonKeepaStrategyHits,
  pickRonKeepaDecisions,
  scoreRonKeepaDecision,
  summarizeStrategyCounts,
} from "@/lib/ron/keepa-rank";
import { RON_DEFAULT_LEARNING } from "@/lib/ron/types";
import type { OpportunityProduct } from "@/lib/opportunity/types";

function hit(
  asin: string,
  opts?: Partial<OpportunityProduct>,
): OpportunityProduct {
  return {
    asin,
    title: opts?.title || `Product ${asin}`,
    brand: opts?.brand || "Brand",
    imageUrl:
      opts?.imageUrl ||
      `https://m.media-amazon.com/images/I/${asin}.jpg`,
    upc: "",
    salesRank: opts?.salesRank ?? 5000,
    salesRankLabel: "",
    browseNodeId: "",
    browseNodeName: "",
    rating: 4.5,
    reviewCount: 200,
    amazonPrice: opts?.amazonPrice ?? 29.99,
    ebayPrice: null,
    ebayCount: null,
    opportunity: "now",
    mode: "amazon",
    sourceMarket: "amazon",
    sourceId: asin,
    destMarket: "ebay",
    eligibility: "SELLABLE",
    eligibilityMessage: "",
    score: opts?.score ?? 70,
    grade: "good",
    reasons: [],
    demandScore: 70,
    sellerCount: opts?.sellerCount ?? 4,
    amazonRetail: false,
    buyBoxPrice: opts?.buyBoxPrice ?? 29.99,
    avgSalesRank90: opts?.avgSalesRank90 ?? 5000,
    bsrDrops90: opts?.bsrDrops90 ?? 25,
    priceVariation90: 5,
    cost: null,
    salePrice: null,
    amazonFees: null,
    ebayFees: null,
    shipping: null,
    packing: null,
    returnsReserve: null,
    netProfit: 8,
    roi: 20,
    margin: 15,
    ebayActiveMedian: null,
    ebayActiveLow: null,
    ebayActiveCount: null,
    ebayListingsAreSold: false,
    keepa: true,
    mpn: "",
    ebayTitle: "",
    ebayMatchedByGtin: false,
    packQty: null,
    packageLb: null,
    avgAmazon90: null,
    keepaStrategy: opts?.keepaStrategy ?? null,
  } as OpportunityProduct;
}

describe("RON Keepa general rank", () => {
  it("merges modalities and boosts multi-strategy consensus", () => {
    const byStrategy = {
      velocity: [hit("B0MULTI001", { bsrDrops90: 30, title: "Vel Hit" })],
      hot_deals: [
        hit("B0MULTI001", { bsrDrops90: 18, title: "Deal Hit Longer Title" }),
        hit("B0SOLO0001", { bsrDrops90: 40, title: "Solo Hot" }),
      ],
      price_drop: [hit("B0MULTI001", { bsrDrops90: 22 })],
    } as const;

    const ranked = mergeRonKeepaStrategyHits(
      byStrategy,
      RON_DEFAULT_LEARNING,
    );
    expect(ranked.length).toBe(2);
    const multi = ranked.find((h) => h.asin === "B0MULTI001")!;
    expect(multi.ronStrategies.sort()).toEqual([
      "hot_deals",
      "price_drop",
      "velocity",
    ]);
    expect(multi.title).toContain("Deal Hit");
    // Consensus ASIN outranks single-strategy even with fewer drops
    expect(ranked[0]!.asin).toBe("B0MULTI001");
    expect(multi.ronDecisionScore).toBeGreaterThan(
      scoreRonKeepaDecision(
        {
          ...hit("B0SOLO0001", { bsrDrops90: 40 }),
          ronStrategies: ["hot_deals"],
          ronDecisionScore: 0,
        },
        RON_DEFAULT_LEARNING,
      ),
    );
  });

  it("picks top decisions for Facebook", () => {
    const ranked = mergeRonKeepaStrategyHits(
      {
        velocity: [
          hit("B0AAA00001"),
          hit("B0AAA00002"),
          hit("B0AAA00003"),
        ],
        amazon_oos: [hit("B0AAA00001"), hit("B0AAA00004")],
      },
      RON_DEFAULT_LEARNING,
    );
    const picks = pickRonKeepaDecisions(ranked, 3);
    expect(picks).toHaveLength(3);
    expect(picks[0]!.asin).toBe("B0AAA00001");
  });

  it("summarizes strategy hit counts for live activity", () => {
    expect(
      summarizeStrategyCounts({
        velocity: [hit("B0AAAA0001")],
        hot_deals: [hit("B0BBBB0002"), hit("B0CCCC0003")],
      }),
    ).toContain("velocity:1");
    expect(
      summarizeStrategyCounts({
        velocity: [hit("B0AAAA0001")],
        hot_deals: [hit("B0BBBB0002"), hit("B0CCCC0003")],
      }),
    ).toContain("hot_deals:2");
  });
});