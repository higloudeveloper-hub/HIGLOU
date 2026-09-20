import { describe, expect, it } from "vitest";
import {
  buildKeepaFinderSelection,
  KEEPA_FINDER_MIN_PER_PAGE,
  KEEPA_MIN_BSR_DROPS_90,
  KEEPA_SCAN_ROOTS,
} from "@/lib/keepa/finder";
import {
  keepaBudgetOk,
  rememberKeepaTokens,
  resolveKeepaMode,
} from "@/lib/keepa/budget";

describe("buildKeepaFinderSelection", () => {
  it("never sends perPage below Keepa's minimum of 50", () => {
    const selection = buildKeepaFinderSelection({
      perPage: 20,
      rootCategory: "1055398",
    });
    expect(selection.perPage).toBe(KEEPA_FINDER_MIN_PER_PAGE);
    expect(selection.page).toBe(0);
  });

  it("uses BSR drops + NEW price filters like real Product Finder tutorials", () => {
    const selection = buildKeepaFinderSelection({
      rootCategory: "1055398",
      mode: "amazon_to_ebay",
      tone: "strict",
    });
    expect(selection.salesRankDrops90_gte).toBe(KEEPA_MIN_BSR_DROPS_90);
    expect(selection.avg90_NEW_gte).toBe(1_500);
    expect(selection.deltaPercent90_NEW_lte).toBeUndefined();
    expect(selection.rootCategory).toEqual([1055398]);
    expect(selection.productType).toEqual([0]);
    // Buy-on-Amazon: prefer Amazon in stock
    expect(selection.availabilityAmazon).toEqual([0]);
  });

  it("open tone uses live NEW price band and drop floor", () => {
    const selection = buildKeepaFinderSelection({
      mode: "amazon_to_ebay",
      tone: "open",
      rootCategory: "1055398",
      page: 2,
    });
    expect(selection.rootCategory).toEqual([1055398]);
    expect(selection.salesRankDrops90_gte).toBe(10);
    expect(selection.current_NEW_gte).toBe(1_200);
    expect(selection.page).toBe(2);
    expect(selection.sort).toEqual([
      ["salesRankDrops90", "desc"],
      ["avg90_SALES", "asc"],
    ]);
  });

  it("does not send short category keywords as title filters", () => {
    const selection = buildKeepaFinderSelection({
      title: "kitchen",
      rootCategory: "1055398",
    });
    expect(selection.title).toBeUndefined();
  });

  it("adds Amazon-absent filter for sell-on-Amazon modes", () => {
    const selection = buildKeepaFinderSelection({
      mode: "amazon",
      rootCategory: "1055398",
      tone: "open",
    });
    expect(selection.availabilityAmazon).toEqual([-1]);
    expect(selection.current_COUNT_NEW_gte).toBe(2);
  });

  it("exposes scan roots for general opportunity rotation", () => {
    expect(KEEPA_SCAN_ROOTS.length).toBeGreaterThanOrEqual(5);
    expect(KEEPA_SCAN_ROOTS.every((r) => /^\d+$/.test(r.id))).toBe(true);
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
