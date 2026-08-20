import { describe, expect, it } from "vitest";
import { parseAmazonVariations } from "@/lib/amazon/parse-variations";
import { parseAmazonProductPage } from "@/lib/amazon/parse-product";
import { resolveEbayCategory } from "@/config/ebay-categories";

const TWISTER = `
"variationDisplayLabels":["Color","Size"]
"dimensionValuesDisplayData":{
  "B0BK1MED01":["BK-1","Medium"],
  "B0BK1XLG01":["BK-1","X-Large"],
  "B0RD1MED01":["RD-1","Medium"],
  "B0RD1XLG01":["RD-1","X-Large"]
}
'colorImages': {
  'BK-1': [{"hiRes":"https://m.media-amazon.com/images/I/71BLACK._AC_SL1500_.jpg"}],
  'RD-1': [{"hiRes":"https://m.media-amazon.com/images/I/71RED01._AC_SL1500_.jpg"}]
}
`;

describe("parseAmazonVariations", () => {
  it("reads color and size child ASINs from twister JSON", () => {
    const set = parseAmazonVariations(TWISTER);
    expect(set?.axisNames).toEqual(["Color", "Size"]);
    expect(set?.variants).toHaveLength(4);
    expect(set?.variants.map((row) => row.asin).sort()).toEqual([
      "B0BK1MED01",
      "B0BK1XLG01",
      "B0RD1MED01",
      "B0RD1XLG01",
    ]);
    const black = set?.variants.find((row) => row.asin === "B0BK1MED01");
    expect(black?.aspects).toEqual({ Color: "BK-1", Size: "Medium" });
    expect(black?.imageUrls[0]).toMatch(/71BLACK/);
  });

  it("falls back to colorToAsin when size is not in the page", () => {
    const set = parseAmazonVariations(`
      'colorToAsin': { 'initial': { 'Black': 'B0BLACK001', 'Red': 'B0RED00001' } }
    `);
    expect(set?.axisNames).toEqual(["Color"]);
    expect(set?.variants).toHaveLength(2);
  });

  it("attaches variations to the Amazon product draft", () => {
    const product = parseAmazonProductPage(
      `<span id="productTitle">Sexy Thong</span>${TWISTER}`,
      { asin: "B0BK1MED01", url: "https://www.amazon.com/dp/B0BK1MED01" },
    );
    expect(product.variations?.variants.length).toBe(4);
  });
});

describe("lingerie category", () => {
  it("maps a women's thong to Panties, not men's underwear", () => {
    const result = resolveEbayCategory({
      title:
        "Sexy Underwear for Women Lace Panties Sexy Thong with Funny Rhinestone Letters",
      productType: "Thong",
    });
    expect(result.categoryId).toBe("11507");
  });
});
