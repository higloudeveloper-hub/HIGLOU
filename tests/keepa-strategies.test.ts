import { describe, expect, it } from "vitest";
import {
  applyKeepaStrategyFilters,
  buildKeepaDealSelection,
  isKeepaStrategyId,
  KEEPA_STRATEGIES,
  resolveKeepaStrategy,
} from "@/lib/keepa/strategies";
import { buildKeepaFinderSelection } from "@/lib/keepa/finder";
import { parseKeepaProduct } from "@/lib/keepa/parse";
import { amazonProductScore } from "@/lib/opportunity/amazon-product-winner";

describe("Keepa pro strategies", () => {
  it("lists the pro playbooks sellers actually use", () => {
    expect(KEEPA_STRATEGIES.map((s) => s.id)).toEqual([
      "velocity",
      "amazon_oos",
      "price_drop",
      "seller_vacuum",
      "rising_price",
      "hot_deals",
    ]);
    expect(isKeepaStrategyId("amazon_oos")).toBe(true);
    expect(isKeepaStrategyId("nope")).toBe(false);
    expect(resolveKeepaStrategy("price_drop")).toBe("price_drop");
    expect(resolveKeepaStrategy("junk")).toBe("velocity");
  });

  it("amazon_oos uses Amazon-absent + 3P Buy Box like reverse-sourcing tutorials", () => {
    const selection = buildKeepaFinderSelection({
      rootCategory: "1055398",
      mode: "amazon",
      tone: "open",
      strategy: "amazon_oos",
    });
    expect(selection.availabilityAmazon).toEqual([-1]);
    expect(selection.buyBoxIsAmazon).toBe(false);
    expect(selection.outOfStockPercentage90_gte).toBe(70);
    expect(selection.buyBoxStatsAmazon90_lte).toBe(25);
    expect(selection.current_COUNT_NEW_lte).toBe(10);
  });

  it("price_drop looks for Buy Box falling 15–45% in 30d", () => {
    const selection = buildKeepaFinderSelection({
      rootCategory: "1055398",
      mode: "amazon",
      strategy: "price_drop",
    });
    expect(selection.deltaPercent30_BUY_BOX_SHIPPING_lte).toBe(-15);
    expect(selection.deltaPercent30_BUY_BOX_SHIPPING_gte).toBe(-45);
  });

  it("seller_vacuum tracks NEW offer count leaving the listing", () => {
    const selection = applyKeepaStrategyFilters(
      { productType: [0] },
      "seller_vacuum",
      { mode: "amazon" },
    );
    expect(selection.deltaPercent30_COUNT_NEW_lte).toBe(-25);
    expect(selection.availabilityAmazon).toEqual([-1]);
  });

  it("rising_price uses positive Buy Box delta (Keepa: up = positive)", () => {
    const selection = applyKeepaStrategyFilters({}, "rising_price");
    expect(selection.deltaPercent30_BUY_BOX_SHIPPING_gte).toBe(15);
    expect(selection.deltaPercent30_BUY_BOX_SHIPPING_lte).toBe(45);
  });

  it("hot_deals builds a Keepa /deal browsing selection", () => {
    const deal = buildKeepaDealSelection({ rootCategory: "1055398" });
    expect(deal.domainId).toBe(1);
    expect(deal.includeCategories).toEqual([1055398]);
    expect(deal.deltaPercentRange).toEqual([20, 70]);
    expect(deal.priceTypes).toEqual([0, 1, 18]);
  });

  it("velocity asks for monthlySold when Amazon exposes it", () => {
    const selection = buildKeepaFinderSelection({
      rootCategory: "165793011",
      mode: "amazon",
      strategy: "velocity",
      tone: "open",
    });
    expect(selection.monthlySold_gte).toBe(50);
  });
});

describe("Keepa parse pro signals", () => {
  it("reads monthlySold, Amazon OOS%, and coupon from product payload", () => {
    const snap = parseKeepaProduct({
      asin: "B0CHS1BVBC",
      title: "Pro Keepa Widget",
      brand: "Higlou",
      imagesCSV: "abc.jpg",
      monthlySold: 220,
      outOfStockPercentage90: 82,
      buyBoxStatsAmazon90: 12,
      coupon: [500, 10],
      salesRankDrops90: 24,
      csv: [],
      stats: {
        current: Array.from({ length: 20 }, () => -1),
      },
    });
    expect(snap?.monthlySold).toBe(220);
    expect(snap?.amazonOos90).toBe(82);
    expect(snap?.buyBoxAmazonShare90).toBe(12);
    expect(snap?.couponPercent).toBe(10);
  });
});

describe("amazon product score pro boosts", () => {
  it("boosts score for monthly sold + Amazon OOS lane", () => {
    const base = amazonProductScore({
      avgSalesRank90: 20_000,
      bsrDrops90: 20,
      sellerCount: 4,
      amazonRetail: false,
      rating: 4.4,
      reviewCount: 100,
      buyBoxPrice: 28,
      keepa: true,
      title: "Widget",
      imageUrl: "https://x/y.jpg",
    });
    const boosted = amazonProductScore({
      avgSalesRank90: 20_000,
      bsrDrops90: 20,
      sellerCount: 4,
      amazonRetail: false,
      rating: 4.4,
      reviewCount: 100,
      buyBoxPrice: 28,
      keepa: true,
      title: "Widget",
      imageUrl: "https://x/y.jpg",
      monthlySold: 300,
      amazonOos90: 85,
      couponPercent: 12,
    });
    expect(boosted).toBeGreaterThan(base);
  });
});
