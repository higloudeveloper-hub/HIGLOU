import { describe, expect, it } from "vitest";
import { planVariationGroup } from "@/lib/ebay/publish-variation-group";

describe("planVariationGroup", () => {
  it("keeps Color and Size when both actually vary", () => {
    const plan = planVariationGroup(
      {
        axisNames: ["Color", "Size"],
        variants: [
          {
            asin: "B0BK1MED01",
            sku: "AMZ-B0BK1MED01",
            aspects: { Color: "Black", Size: "M" },
            imageUrls: ["https://m.media-amazon.com/images/I/71aaa.jpg"],
          },
          {
            asin: "B0WH1LRG01",
            sku: "AMZ-B0WH1LRG01",
            aspects: { Color: "White", Size: "L" },
            imageUrls: ["https://m.media-amazon.com/images/I/71bbb.jpg"],
          },
          {
            asin: "B0BK1LRG01",
            sku: "AMZ-B0BK1LRG01",
            aspects: { Color: "Black", Size: "L" },
            imageUrls: [],
          },
        ],
      },
      "AMZ-B0BK1MED01",
    );
    expect(plan?.specifications.map((row) => row.name)).toEqual(["Color", "Size"]);
    expect(plan?.variantSkus).toHaveLength(3);
    expect(plan?.groupKey).toMatch(/G$/);
  });

  it("ignores Amazon options the seller unchecked", () => {
    const plan = planVariationGroup(
      {
        axisNames: ["Color", "Size"],
        variants: [
          {
            asin: "B0BK1MED01",
            sku: "AMZ-B0BK1MED01",
            aspects: { Color: "Black", Size: "M" },
            imageUrls: [],
            selected: true,
          },
          {
            asin: "B0WH1LRG01",
            sku: "AMZ-B0WH1LRG01",
            aspects: { Color: "White", Size: "L" },
            imageUrls: [],
            selected: true,
          },
          {
            asin: "B0RD1XLG01",
            sku: "AMZ-B0RD1XLG01",
            aspects: { Color: "Red", Size: "XL" },
            imageUrls: [],
            selected: false,
          },
        ],
      },
      "AMZ-B0BK1MED01",
    );
    expect(plan?.variantSkus).toHaveLength(2);
    expect(plan?.specifications.find((row) => row.name === "Color")?.values).toEqual(
      ["Black", "White"],
    );
  });

  it("drops an axis that does not vary and refuses a single leftover combo", () => {
    const plan = planVariationGroup(
      {
        axisNames: ["Color", "Size"],
        variants: [
          {
            asin: "B0AAAAAAA1",
            sku: "AMZ-B0AAAAAAA1",
            aspects: { Color: "Black", Size: "M" },
            imageUrls: [],
          },
          {
            asin: "B0AAAAAAA2",
            sku: "AMZ-B0AAAAAAA2",
            aspects: { Color: "Black", Size: "M" },
            imageUrls: [],
          },
        ],
      },
      "AMZ-B0AAAAAAA1",
    );
    expect(plan).toBeNull();
  });
});
