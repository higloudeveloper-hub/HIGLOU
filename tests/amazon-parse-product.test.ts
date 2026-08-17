import { describe, expect, it } from "vitest";
import {
  parseAmazonProductPage,
  upgradeAmazonImage,
} from "@/lib/amazon/parse-product";

const HTML = `
<html>
  <head>
    <meta property="og:title" content="RIDGID 18V Nailer Kit" />
    <meta property="og:image" content="https://m.media-amazon.com/images/I/71abc._AC_US40_.jpg" />
    <script type="application/ld+json">
      {"@type":"Product","name":"RIDGID 18V Nailer Kit","brand":{"@type":"Brand","name":"RIDGID"},"image":["https://m.media-amazon.com/images/I/71abc._AC_SL1500_.jpg"],"offers":{"@type":"Offer","price":"189.00"}}
    </script>
  </head>
  <body>
    <span id="productTitle"> RIDGID 18V Brushless Nailer </span>
    <a id="bylineInfo">Visit the RIDGID Store</a>
    <div id="feature-bullets">
      <ul>
        <li><span class="a-list-item">18V brushless motor</span></li>
        <li><span class="a-list-item">Includes battery and charger</span></li>
      </ul>
    </div>
    'colorImages': { 'initial': [{"hiRes":"https://m.media-amazon.com/images/I/71xyz._AC_SL1500_.jpg","large":"https://m.media-amazon.com/images/I/71xyz._AC_SX679_.jpg"}] }
  </body>
</html>
`;

describe("parseAmazonProductPage", () => {
  it("reads title, brand, price, bullets, and photos", () => {
    const product = parseAmazonProductPage(HTML, {
      asin: "B0TESTASIN",
      url: "https://www.amazon.com/dp/B0TESTASIN",
    });
    expect(product.title).toMatch(/RIDGID 18V Brushless Nailer/i);
    expect(product.brand).toBe("RIDGID");
    expect(product.price).toBe(189);
    expect(product.features[0]).toMatch(/brushless/i);
    expect(product.imageUrls.length).toBeGreaterThan(0);
    expect(product.imageUrls.every((u) => u.includes("_AC_SL1500_"))).toBe(true);
  });
});

describe("upgradeAmazonImage", () => {
  it("asks Amazon for the large file", () => {
    expect(
      upgradeAmazonImage("https://m.media-amazon.com/images/I/71abc._AC_US40_.jpg"),
    ).toBe("https://m.media-amazon.com/images/I/71abc._AC_SL1500_.jpg");
  });

  it("rewrites ssl-images-amazon thumbs onto the media CDN", () => {
    expect(
      upgradeAmazonImage(
        "https://images-na.ssl-images-amazon.com/images/I/51share._SS40_.jpg",
      ),
    ).toBe("https://m.media-amazon.com/images/I/51share._AC_SL1500_.jpg");
  });

  it("drops logos and sprite assets", () => {
    expect(
      upgradeAmazonImage(
        "https://m.media-amazon.com/images/G/01/social_share/amazon_logo.png",
      ),
    ).toBe("");
  });
});

describe("parseAmazonProductPage markdown fallback", () => {
  it("reads a jina-style markdown page", () => {
    const product = parseAmazonProductPage(
      `# RIDGID 18V Nailer\n\n- Brushless motor with battery\n- Includes charger and bag\n\nhttps://m.media-amazon.com/images/I/71md._AC_SL1500_.jpg\n`,
      { asin: "B0MARKDOWN1", url: "https://www.amazon.com/dp/B0MARKDOWN1" },
    );
    expect(product.title).toMatch(/RIDGID 18V Nailer/i);
    expect(product.features[0]).toMatch(/Brushless/i);
    expect(product.imageUrls[0]).toContain("71md");
  });

  it("ignores Amazon Videos widget links", () => {
    const product = parseAmazonProductPage(
      `# Perfume\n\n- [Videos](https://www.amazon.com/dp/B0FP96MNQ4#va-related-videos-widget_feature_div)\n- Glass bottle with high heel silhouette\n`,
      { asin: "B0FP96MNQ4", url: "https://www.amazon.com/dp/B0FP96MNQ4" },
    );
    expect(product.features.join(" ")).not.toMatch(/video|https?:\/\//i);
    expect(product.features[0]).toMatch(/Glass bottle/i);
  });
});
