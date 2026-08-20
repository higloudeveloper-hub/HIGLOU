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

  it("keeps a scent name with commas as one Color value", () => {
    const plan = planVariationGroup(
      {
        axisNames: ["Color"],
        variants: [
          {
            asin: "B0CANDY0010",
            sku: "AMZ-B0CANDY0010",
            aspects: { Color: "Yara Candy" },
            imageUrls: ["https://m.media-amazon.com/images/I/71candy.jpg"],
          },
          {
            asin: "B0AMBER0010",
            sku: "AMZ-B0AMBER0010",
            aspects: { Color: "Amber, Fruity Vanilla" },
            imageUrls: ["https://m.media-amazon.com/images/I/71amber.jpg"],
          },
        ],
      },
      "AMZ-B0CANDY0010",
    );
    expect(plan?.specifications).toEqual([
      {
        name: "Color",
        values: ["Yara Candy", "Amber, Fruity Vanilla"],
      },
    ]);
  });

  it("maps Amazon Scent options to eBay Color so 25002 cannot fire", () => {
    const plan = planVariationGroup(
      {
        axisNames: ["Scent"],
        variants: [
          {
            asin: "B0CANDY010",
            sku: "AMZ-B0CANDY010",
            aspects: { Scent: "Yara Candy" },
            imageUrls: [],
          },
          {
            asin: "B0AMBER010",
            sku: "AMZ-B0AMBER010",
            aspects: { Scent: "Amber, Fruity Vanilla" },
            imageUrls: [],
          },
        ],
      },
      "AMZ-B0CANDY010",
    );
    expect(plan?.specifications).toEqual([
      {
        name: "Color",
        values: ["Yara Candy", "Amber, Fruity Vanilla"],
      },
    ]);
  });

  it("keeps at most two axes and 60 values so eBay 25013 cannot fire", () => {
    const colors = Array.from({ length: 70 }, (_, i) => `Scent ${i + 1}`);
    const plan = planVariationGroup(
      {
        axisNames: ["Color", "Size", "Style"],
        variants: colors.flatMap((color, index) => [
          {
            asin: `B0COL${String(index).padStart(5, "0")}`.slice(0, 10),
            sku: `AMZ-C${index}S`,
            aspects: { Color: color, Size: "50ml", Style: "Spray" },
            imageUrls: [],
          },
          {
            asin: `B1COL${String(index).padStart(5, "0")}`.slice(0, 10),
            sku: `AMZ-C${index}L`,
            aspects: { Color: color, Size: "100ml", Style: "Tester" },
            imageUrls: [],
          },
        ]),
      },
      "AMZ-PARENT01",
    );
    expect(plan?.specifications).toHaveLength(2);
    expect(plan?.specifications.map((row) => row.name)).toEqual(["Color", "Size"]);
    expect(
      plan?.specifications.find((row) => row.name === "Color")?.values.length,
    ).toBeLessThanOrEqual(60);
    expect(plan?.variantSkus.length).toBeLessThanOrEqual(60);
  });
});
