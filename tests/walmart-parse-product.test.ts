import { describe, expect, it } from "vitest";
import {
  parseWalmartProductPage,
  upgradeWalmartImage,
} from "@/lib/walmart/parse-product";

const NEXT = {
  props: {
    pageProps: {
      initialData: {
        data: {
          product: {
            usItemId: "10449411",
            name: "Great Value Whole Vitamin D Milk, Gallon, 128 fl oz",
            brand: "Great Value",
            upc: "078742014047",
            shortDescription:
              "<li>Vitamin D whole milk</li><li>One gallon jug</li>",
            priceInfo: {
              currentPrice: { price: 3.46, priceString: "$3.46" },
            },
            imageInfo: {
              allImages: [
                {
                  url: "https://i5.walmartimages.com/asr/aaaa-hero.jpeg?odnHeight=180&odnWidth=180",
                },
                { url: "https://i5.walmartimages.com/asr/bbbb-side.jpeg" },
                { url: "https://i5.walmartimages.com/asr/cccc-label.jpeg" },
              ],
            },
          },
          idml: {
            specifications: [{ name: "Model", value: "GV-MILK-1" }],
          },
        },
      },
    },
  },
};

const HTML = `
<html>
  <head>
    <meta property="og:title" content="Great Value Whole Milk, Gallon" />
    <meta property="og:image" content="https://i5.walmartimages.com/asr/hero.jpeg?odnHeight=180&odnWidth=180" />
    <script type="application/ld+json">
      {"@type":"Product","name":"Great Value Whole Milk","brand":{"@type":"Brand","name":"Great Value"},"offers":{"price":"3.46"}}
    </script>
  </head>
  <body>
    <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(NEXT)}</script>
  </body>
</html>
`;

describe("parseWalmartProductPage", () => {
  it("reads title, brand, price, UPC, model, bullets, and gallery", () => {
    const product = parseWalmartProductPage(HTML, {
      itemId: "10449411",
      url: "https://www.walmart.com/ip/10449411",
    });
    expect(product.itemId).toBe("10449411");
    expect(product.title).toMatch(/Great Value Whole Vitamin D Milk/i);
    expect(product.brand).toBe("Great Value");
    expect(product.price).toBe(3.46);
    expect(product.upc).toBe("078742014047");
    expect(product.model).toBe("GV-MILK-1");
    expect(product.features[0]).toMatch(/Vitamin D/i);
    expect(product.imageUrls.length).toBeGreaterThanOrEqual(3);
    expect(product.imageUrls.every((url) => /odnHeight=2000/i.test(url))).toBe(
      true,
    );
  });

  it("keeps later gallery slides, not only the hero thumb", () => {
    const product = parseWalmartProductPage(HTML, {
      itemId: "10449411",
      url: "https://www.walmart.com/ip/10449411",
    });
    const ids = product.imageUrls.map((url) =>
      url.match(/\/asr\/([^./?]+)/i)?.[1],
    );
    expect(ids).toEqual(
      expect.arrayContaining(["aaaa-hero", "bbbb-side", "cccc-label"]),
    );
  });

  it("upgrades Walmart thumbs to 2000px", () => {
    expect(
      upgradeWalmartImage(
        "https://i5.walmartimages.com/asr/abcd.jpeg?odnHeight=180&odnWidth=180&odnBg=ffffff",
      ),
    ).toMatch(/odnHeight=2000/i);
  });
});
