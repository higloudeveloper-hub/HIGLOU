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

  it("reads dimensionToAsinMap from mobile / inline twister JSON", () => {
    const set = parseAmazonVariations(`
      "dimensions":["color_name"]
      "variationDisplayLabels":["Color"]
      "variationValues":{"color_name":["Multicolor 8 Pack","Blue 4 Pack"]}
      "dimensionToAsinMap":{"0":"B0GT3QBGYR","1":"B0BLUE4PK0"}
    `);
    expect(set?.axisNames).toEqual(["Color"]);
    expect(set?.variants.map((row) => row.asin).sort()).toEqual([
      "B0BLUE4PK0",
      "B0GT3QBGYR",
    ]);
    expect(
      set?.variants.find((row) => row.asin === "B0GT3QBGYR")?.aspects.Color,
    ).toBe("Multicolor 8 Pack");
  });

  it("reads variations from an a-state script tag", () => {
    const set = parseAmazonVariations(`
      <script type="a-state" data-a-state="{&quot;key&quot;:&quot;twister-plus-inline-twister&quot;}">
      {"dimensions":["color_name"],"variationDisplayLabels":["Color"],"variationValues":{"color_name":["Multicolor 8 Pack","Green 8 Pack"]},"dimensionToAsinMap":{"0":"B0GT3QBGYR","1":"B0GREEN8PK"}}
      </script>
    `);
    expect(set?.variants).toHaveLength(2);
    expect(set?.variants.map((row) => row.aspects.Color).sort()).toEqual([
      "Green 8 Pack",
      "Multicolor 8 Pack",
    ]);
  });

  it("reads color swatches from desktop HTML", () => {
    const set = parseAmazonVariations(`
      <li id="color_name_0" class="swatchSelect" data-defaultasin="B0GT3QBGYR" title="Multicolor 8 Pack"></li>
      <li id="color_name_1" class="swatchAvailable" data-defaultasin="B0BLUE4PK0" title="Blue 4 Pack"></li>
    `);
    expect(set?.variants).toHaveLength(2);
    expect(set?.variants[0]?.aspects.Color).toBe("Multicolor 8 Pack");
  });

  it("reads unquoted dataToReturn twister JSON", () => {
    const set = parseAmazonVariations(`
      P.register("twister-js-init-dpx-data", function() {
        var dataToReturn = {
          dimensions : ["color_name"],
          variationDisplayLabels : ["Color"],
          variationValues : { color_name : ["Bamboo 11 Pack", "Rose Gold 8 Pack"] },
          dimensionToAsinMap : { "0" : "B0173HB5K0", "1" : "B0ROSE8PK0" }
        };
        return dataToReturn;
      });
    `);
    expect(set?.variants).toHaveLength(2);
    expect(
      set?.variants.find((row) => row.asin === "B0173HB5K0")?.aspects.Color,
    ).toBe("Bamboo 11 Pack");
  });

  it("skips an empty dimensionToAsinMap before the real one", () => {
    const set = parseAmazonVariations(`
      "dimensionToAsinMap": {}
      "variationValues": {"foo":["x"]}
      "dimensions":["color_name"]
      "variationDisplayLabels":["Color"]
      "variationValues":{"color_name":["Bamboo 11 Pack","Pink 8 Pack"]}
      "dimensionToAsinMap":{"0":"B0173HB5K0","1":"B0PINK08PK"}
    `);
    expect(set?.variants.map((row) => row.asin).sort()).toEqual([
      "B0173HB5K0",
      "B0PINK08PK",
    ]);
  });

  it("reads image swatches whose label is on a nested img alt", () => {
    const set = parseAmazonVariations(`
      <li id="color_name_0" class="swatchSelect" data-defaultasin="B0173HB5K0"><img alt="Bamboo 11 Pack" /></li>
      <li id="color_name_1" class="swatchAvailable" data-defaultasin="B0ROSE8PK0"><img alt="Rose Gold 8 Pack" /></li>
    `);
    expect(set?.variants).toHaveLength(2);
    expect(set?.variants[0]?.aspects.Color).toBe("Bamboo 11 Pack");
  });

  it("reads data-dp-url child ASINs in a twister row", () => {
    const set = parseAmazonVariations(`
      <li class="swatchAvailable" data-dp-url="/foo/dp/B0173HB5K0/ref=twister_swatch" title="Bamboo 11 Pack"></li>
      <li class="swatchAvailable" data-dp-url="/foo/dp/B0ROSE8PK0/ref=twister_swatch" title="Rose Gold 8 Pack"></li>
    `);
    expect(set?.variants).toHaveLength(2);
  });

  it("reads twister-plus dimensionList valueToAsinList", () => {
    const set = parseAmazonVariations(`
      "dimensionList":[{
        "dimensionName":"color_name",
        "displayName":"Color",
        "valueToAsinList":[
          {"asin":"B0173HB5K0","value":"Bamboo 11 Pack"},
          {"asin":"B0ROSE8PK0","value":"Rose Gold 8 Pack"}
        ]
      }]
    `);
    expect(set?.axisNames).toEqual(["Color"]);
    expect(set?.variants).toHaveLength(2);
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
