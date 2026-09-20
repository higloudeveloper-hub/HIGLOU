import { describe, expect, it } from "vitest";
import {
  buildKeepaFinderSelection,
  KEEPA_FINDER_MIN_PER_PAGE,
} from "@/lib/keepa/finder";
import { OPPORTUNITY_RULES } from "@/lib/opportunity/types";

describe("buildKeepaFinderSelection", () => {
  it("never sends perPage below Keepa's minimum of 50", () => {
    const selection = buildKeepaFinderSelection({ perPage: 20 });
    expect(selection.perPage).toBe(KEEPA_FINDER_MIN_PER_PAGE);
    expect(selection.page).toBe(0);
  });

  it("maps opportunity rules into Keepa cents / grams filters", () => {
    const selection = buildKeepaFinderSelection({
      rootCategory: "1055398",
      title: "drawer organizer",
      mode: "amazon_to_ebay",
    });
    expect(selection.current_NEW_gte).toBe(
      Math.round(OPPORTUNITY_RULES.minPrice * 100),
    );
    expect(selection.current_NEW_lte).toBe(
      Math.round(OPPORTUNITY_RULES.maxPrice * 100),
    );
    expect(selection.current_SALES_gte).toBe(OPPORTUNITY_RULES.minBsr);
    expect(selection.current_SALES_lte).toBe(OPPORTUNITY_RULES.maxBsr);
    expect(selection.deltaPercent90_NEW_lte).toBe(
      -Math.round(OPPORTUNITY_RULES.minDiscount90 * 100),
    );
    expect(selection.packageWeight_lte).toBe(
      Math.round(OPPORTUNITY_RULES.maxPackageLb * 453.592),
    );
    expect(selection.rootCategory).toEqual([1055398]);
    expect(selection.title).toEqual(["drawer organizer"]);
    expect(selection.productType).toEqual([0, 1]);
    expect(selection.sort).toEqual([["current_SALES", "asc"]]);
  });

  it("adds seller-count filters for Amazon sell modes", () => {
    const selection = buildKeepaFinderSelection({ mode: "amazon" });
    expect(selection.current_COUNT_NEW_gte).toBe(OPPORTUNITY_RULES.minSellers);
    expect(selection.current_COUNT_NEW_lte).toBe(OPPORTUNITY_RULES.maxSellers);
    expect(selection.availabilityAmazon).toEqual([-1]);
  });
});
