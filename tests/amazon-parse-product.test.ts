import { describe, expect, it } from "vitest";
import {
  parseAmazonProductPage,
  parseAmazonReviews,
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

  it("does not keep Amazon.com page titles as the product title", () => {
    const product = parseAmazonProductPage(
      `
      <title>Amazon.com: Pipishell Bamboo Expandable Silverware Drawer Organizer, Adjustable : Home &amp; Kitchen</title>
      <meta property="og:title" content="Amazon.com - Pipishell Bamboo Expandable Silverware Drawer Organizer, Adjustable" />
      `,
      { asin: "B07SRV3SN8", url: "https://www.amazon.com/dp/B07SRV3SN8" },
    );
    expect(product.title).not.toMatch(/amazon\.com/i);
    expect(product.title).toMatch(/^Pipishell Bamboo Expandable Silverware/i);
    expect(product.title.length).toBeLessThanOrEqual(80);
  });

  it("keeps later gallery slides when the first photo has nested [width,height]", () => {
    const product = parseAmazonProductPage(
      `
      'colorImages': { 'initial': [
        {"hiRes":"https://m.media-amazon.com/images/I/71aaa._AC_SL1500_.jpg","main":{"https://m.media-amazon.com/images/I/71aaa._AC_SX679_.jpg":[679,679]}},
        {"hiRes":"https://m.media-amazon.com/images/I/71bbb._AC_SL1500_.jpg","large":"https://m.media-amazon.com/images/I/71bbb._AC_SX679_.jpg"},
        {"hiRes":"https://m.media-amazon.com/images/I/71ccc._AC_SL1500_.jpg","large":"https://m.media-amazon.com/images/I/71ccc._AC_SX679_.jpg"}
      ] }
      `,
      { asin: "B0NESTED01", url: "https://www.amazon.com/dp/B0NESTED01" },
    );
    const ids = product.imageUrls.map((url) => url.match(/\/images\/I\/([^./]+)/i)?.[1]);
    expect(ids).toEqual(expect.arrayContaining(["71aaa", "71bbb", "71ccc"]));
    expect(new Set(ids).size).toBeGreaterThanOrEqual(3);
  });

  it("keeps this ASIN gallery and drops related-product photos on the same page", () => {
    const product = parseAmazonProductPage(
      `
      'colorImages': { 'initial': [
        {"hiRes":"https://m.media-amazon.com/images/I/71THIS1._AC_SL1500_.jpg"},
        {"hiRes":"https://m.media-amazon.com/images/I/71THIS2._AC_SL1500_.jpg"},
        {"hiRes":"https://m.media-amazon.com/images/I/71THIS3._AC_SL1500_.jpg"}
      ] }
      <div id="purchase-sims-feature">
        <img src="https://m.media-amazon.com/images/I/71OTHERA._AC_US40_.jpg" />
        <img src="https://m.media-amazon.com/images/I/71OTHERB._AC_US40_.jpg" />
      </div>
      <img src="https://m.media-amazon.com/images/I/71SPONSO._AC_SL1500_.jpg" />
      `,
      { asin: "B0EXACTAS1", url: "https://www.amazon.com/dp/B0EXACTAS1" },
    );
    const ids = product.imageUrls.map((url) => url.match(/\/images\/I\/([^./]+)/i)?.[1]);
    expect(ids).toEqual(["71THIS1", "71THIS2", "71THIS3"]);
    expect(ids.join(" ")).not.toMatch(/OTHER|SPONSO/);
  });

  it("uses the color gallery that matches the pasted ASIN", () => {
    const product = parseAmazonProductPage(
      `
      'colorToAsin': { 'initial': { 'Black': 'B0BLACK001', 'Red': 'B0RED00001' } }
      'colorImages': {
        'initial': [{"hiRes":"https://m.media-amazon.com/images/I/71BLACK._AC_SL1500_.jpg"}],
        'Black': [{"hiRes":"https://m.media-amazon.com/images/I/71BLACK._AC_SL1500_.jpg"}],
        'Red': [
          {"hiRes":"https://m.media-amazon.com/images/I/71RED01._AC_SL1500_.jpg"},
          {"hiRes":"https://m.media-amazon.com/images/I/71RED02._AC_SL1500_.jpg"}
        ]
      }
      `,
      { asin: "B0RED00001", url: "https://www.amazon.com/dp/B0RED00001" },
    );
    const ids = product.imageUrls.map((url) => url.match(/\/images\/I\/([^./]+)/i)?.[1]);
    expect(ids).toEqual(["71RED01", "71RED02"]);
    expect(ids).not.toContain("71BLACK");
  });

  it("adds imageGalleryData slides so the gallery is not only the hero", () => {
    const product = parseAmazonProductPage(
      `
      'colorImages': { 'initial': [
        {"hiRes":"https://m.media-amazon.com/images/I/71HERO1._AC_SL1500_.jpg"}
      ] }
      'imageGalleryData': [
        {"mainUrl":"https://m.media-amazon.com/images/I/71HERO1._AC_SL1500_.jpg"},
        {"mainUrl":"https://m.media-amazon.com/images/I/71SIDE2._AC_SL1500_.jpg"},
        {"mainUrl":"https://m.media-amazon.com/images/I/71BACK3._AC_SL1500_.jpg"}
      ]
      `,
      { asin: "B0GALLERY1", url: "https://www.amazon.com/dp/B0GALLERY1" },
    );
    const ids = product.imageUrls.map((url) => url.match(/\/images\/I\/([^./]+)/i)?.[1]);
    expect(ids).toEqual(expect.arrayContaining(["71HERO1", "71SIDE2", "71BACK3"]));
    expect(new Set(ids).size).toBe(3);
  });

  it("reads the iPhone gallery from ib-low-res-alt-images so import is not stuck on one hero", () => {
    const product = parseAmazonProductPage(
      `
      <script type="a-state" data-a-state="{&quot;key&quot;:&quot;mobile-landing-image-data&quot;}">{"landingImageUrl":"https://m.media-amazon.com/images/I/61nrIQ3yCtL._AC_UF350,350_QL50_.jpg"}</script>
      <script type="a-state" data-a-state="{&quot;key&quot;:&quot;ib-low-res-alt-images&quot;}">{"1":"https://m.media-amazon.com/images/I/718YMVdXg3L._AC_UF350,350_QL80_.jpg","2":"https://m.media-amazon.com/images/I/71oRfIaJS0L._AC_UF350,350_QL80_.jpg","3":"https://m.media-amazon.com/images/I/71P2xG+FdpL._AC_UF350,350_QL80_.jpg","6":"https://m.media-amazon.com/images/I/61v6Yjamv-L._AC_UF350,350_QL80_.jpg"}</script>
      <img src="https://m.media-amazon.com/images/I/11i1DYEiaoL._RC_AC_US40_.jpg" />
      <img src="https://m.media-amazon.com/images/I/61xJcNKKLXL.js._AC_SL1500_.jpg" />
      `,
      { asin: "B0CHS1BVBC", url: "https://www.amazon.com/dp/B0CHS1BVBC" },
    );
    const ids = product.imageUrls.map((url) => url.match(/\/images\/I\/([^./]+)/i)?.[1]);
    expect(ids[0]).toBe("61nrIQ3yCtL");
    expect(ids).toEqual(
      expect.arrayContaining([
        "61nrIQ3yCtL",
        "718YMVdXg3L",
        "71oRfIaJS0L",
        "71P2xG+FdpL",
        "61v6Yjamv-L",
      ]),
    );
    expect(ids.length).toBe(5);
    expect(ids.join(" ")).not.toMatch(/11i1DYEiaoL|61xJcNKKLXL/);
  });

  it("reads star rating and review count from JSON-LD", () => {
    const html = `
      <script type="application/ld+json">
        {"@type":"Product","name":"Fluke tester","aggregateRating":{"@type":"AggregateRating","ratingValue":"4.7","reviewCount":"3251"},"image":"https://m.media-amazon.com/images/I/71rate._AC_SL1500_.jpg"}
      </script>
    `;
    const product = parseAmazonProductPage(html, {
      asin: "B0REVIEW001",
      url: "https://www.amazon.com/dp/B0REVIEW001",
    });
    expect(product.rating).toBe(4.7);
    expect(product.reviewCount).toBe(3251);
    expect(parseAmazonReviews(html)).toEqual({ rating: 4.7, reviewCount: 3251 });
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

  it("drops logos, sprites, and script assets", () => {
    expect(
      upgradeAmazonImage(
        "https://m.media-amazon.com/images/G/01/social_share/amazon_logo.png",
      ),
    ).toBe("");
    expect(
      upgradeAmazonImage(
        "https://m.media-amazon.com/images/I/61xJcNKKLXL.js._AC_SL1500_.jpg",
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
