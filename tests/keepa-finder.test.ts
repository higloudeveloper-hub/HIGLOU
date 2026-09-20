import { describe, expect, it } from "vitest";
import {
  buildKeepaFinderSelection,
  KEEPA_FINDER_MIN_PER_PAGE,
  KEEPA_MIN_BSR_DROPS_90,
} from "@/lib/keepa/finder";
import { OPPORTUNITY_RULES } from "@/lib/opportunity/types";
import {
  keepaBudgetOk,
  rememberKeepaTokens,
  resolveKeepaMode,
} from "@/lib/keepa/budget";

describe("buildKeepaFinderSelection", () => {
  it("never sends perPage below Keepa's minimum of 50", () => {
    const selection = buildKeepaFinderSelection({ perPage: 20 });
    expect(selection.perPage).toBe(KEEPA_FINDER_MIN_PER_PAGE);
    expect(selection.page).toBe(0);
  });

  it("uses BSR drops instead of broken deltaPercent filters", () => {
    const selection = buildKeepaFinderSelection({
      rootCategory: "1055398",
      mode: "amazon_to_ebay",
    });
    expect(selection.salesRankDrops90_gte).toBe(KEEPA_MIN_BSR_DROPS_90);
    expect(selection.deltaPercent90_NEW_lte).toBeUndefined();
    expect(selection.current_NEW_gte).toBe(
      Math.round(OPPORTUNITY_RULES.minPrice * 100),
    );
    expect(selection.rootCategory).toEqual([1055398]);
    expect(selection.productType).toEqual([0, 1]);
  });

  it("does not send short category keywords as title filters", () => {
    const selection = buildKeepaFinderSelection({
      title: "kitchen",
      rootCategory: "1055398",
    });
    expect(selection.title).toBeUndefined();
  });

  it("adds seller-count filters for Amazon sell modes", () => {
    const selection = buildKeepaFinderSelection({ mode: "amazon" });
    expect(selection.current_COUNT_NEW_gte).toBe(OPPORTUNITY_RULES.minSellers);
    expect(selection.current_COUNT_NEW_lte).toBe(OPPORTUNITY_RULES.maxSellers);
    expect(selection.availabilityAmazon).toEqual([-1]);
  });
});

describe("Keepa budget", () => {
  it("defaults live mode to off so idle loops do not bill Keepa", () => {
    expect(resolveKeepaMode(undefined, "live")).toBe("off");
    expect(resolveKeepaMode(undefined, "manual")).toBe("full");
  });

  it("blocks Keepa when tokens fall near the floor", () => {
    rememberKeepaTokens(100);
    expect(keepaBudgetOk(12)).toBe(false);
    rememberKeepaTokens(800);
    expect(keepaBudgetOk(12)).toBe(true);
  });
});
