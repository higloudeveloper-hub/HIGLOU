import { describe, expect, it } from "vitest";
import {
  EBAY_CATEGORY_OPTIONS,
  NON_LISTABLE_EBAY_CATEGORY_IDS,
  isListableEbayCategoryId,
  resolveEbayCategory,
} from "@/config/ebay-categories";
import { EXTRA_LEAF_NAMES } from "@/config/store-departments";

describe("eBay category integrity", () => {
  it("has unique curated category ids", () => {
    const ids = EBAY_CATEGORY_OPTIONS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("EXTRA_LEAF_NAMES has unique keys", () => {
    const keys = Object.keys(EXTRA_LEAF_NAMES);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("never resolves to known non-listable parents", () => {
    const result = resolveEbayCategory({
      categoryId: "20620",
      categoryName: "Lamps, Lighting & Ceiling Fans",
      title: "Hampton Bay Savannah Flush Mount Ceiling Light",
      brand: "Hampton Bay",
      productType: "Flush Mount",
    });
    expect(NON_LISTABLE_EBAY_CATEGORY_IDS.has(result.categoryId)).toBe(false);
    expect(isListableEbayCategoryId(result.categoryId)).toBe(true);
    expect(result.categoryId).toBe("117503");
  });
});
