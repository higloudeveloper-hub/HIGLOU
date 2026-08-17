import { describe, expect, it } from "vitest";
import {
  collectHomeDepotImageUrlsFromHtml,
  parseHomeDepotProductPage,
  selectHomeDepotSearchPhotos,
  upgradeHomeDepotImage,
} from "@/lib/homedepot/parse-product";

const HTML = `
<html>
  <head>
    <meta property="og:title" content="DEWALT 20V MAX Drill | The Home Depot" />
    <meta property="og:image" content="https://images.thdstatic.com/productImages/a62efdbd-f93b-4614-9e89-7dfad8dc5c3a/svn/dewalt-dcd791p1-64_400.jpg" />
    <script type="application/ld+json">
      {"@type":"Product","name":"DEWALT 20V MAX XR Drill","brand":{"@type":"Brand","name":"DEWALT"},"mpn":"DCD791P1","gtin13":"885911541377","image":["https://images.thdstatic.com/productImages/a62efdbd-f93b-4614-9e89-7dfad8dc5c3a/svn/dewalt-dcd791p1-64_600.jpg"],"offers":{"@type":"Offer","price":"199.00"}}
    </script>
  </head>
  <body>
    <h1 data-testid="product-title">DEWALT 20V MAX XR Cordless Drill</h1>
    <div>Brand</div><div>DEWALT</div>
    <li class="overview-bullet">Brushless motor for longer runtime</li>
    <img src="https://images.thdstatic.com/productImages/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/svn/dewalt-kit-64_300.jpg" />
  </body>
</html>
`;

describe("parseHomeDepotProductPage", () => {
  it("reads title, brand, model, price, UPC, and large photos", () => {
    const product = parseHomeDepotProductPage(HTML, {
      itemId: "312119566",
      url: "https://www.homedepot.com/p/312119566",
    });
    expect(product.title).toMatch(/DEWALT 20V MAX XR Cordless Drill/i);
    expect(product.brand).toBe("DEWALT");
    expect(product.model).toBe("DCD791P1");
    expect(product.price).toBe(199);
    expect(product.upc).toBe("885911541377");
    expect(product.features[0]).toMatch(/Brushless/i);
    expect(product.imageUrls.length).toBeGreaterThan(0);
    expect(product.imageUrls.every((u) => u.includes("_1000."))).toBe(true);
  });
});

describe("upgradeHomeDepotImage", () => {
  it("asks Home Depot for the 1000px gallery file", () => {
    expect(
      upgradeHomeDepotImage(
        "https://images.thdstatic.com/productImages/abc/svn/dewalt-64_400.jpg",
      ),
    ).toBe(
      "https://images.thdstatic.com/productImages/abc/svn/dewalt-64_1000.jpg",
    );
  });

  it("drops color swatches", () => {
    expect(
      upgradeHomeDepotImage(
        "https://images.thdstatic.com/catalog/swatchImages/35/95/dewalt_35.jpg",
      ),
    ).toBe("");
  });

  it("drops truncated search URLs that are not image files", () => {
    expect(
      upgradeHomeDepotImage(
        "https://images.thdstatic.com/productImages/abc/svn/black-defiant-floodlights-17000148-6",
      ),
    ).toBe("");
  });

  it("fills the empty size token on Home Depot media URLs", () => {
    expect(
      upgradeHomeDepotImage(
        "https://images.thdstatic.com/productImages/abc/svn/dewalt-64_.jpg",
      ),
    ).toBe(
      "https://images.thdstatic.com/productImages/abc/svn/dewalt-64_1000.jpg",
    );
  });
});

describe("selectHomeDepotSearchPhotos", () => {
  it("keeps this SKU and drops a similar floodlight", () => {
    const html = `
      murl&quot;:&quot;https://images.thdstatic.com/productImages/aaa/svn/black-defiant-floodlights-17000018-64_600.jpg&quot;
      murl&quot;:&quot;https://images.thdstatic.com/productImages/bbb/svn/black-defiant-floodlights-17000148-64_600.jpg&quot;
    `;
    const photos = selectHomeDepotSearchPhotos(
      collectHomeDepotImageUrlsFromHtml(html),
      { model: "17000148", itemId: "324294069" },
    );
    expect(photos).toHaveLength(1);
    expect(photos[0]).toContain("17000148");
    expect(photos[0]).toContain("_1000.");
  });
});

describe("Home Depot gallery angles", () => {
  it("keeps extra shots that share a productImages id", () => {
    const html = `
      <meta property="og:image" content="https://images.thdstatic.com/productImages/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/svn/black-defiant-floodlights-17000148-64_400.jpg" />
      <img src="https://images.thdstatic.com/productImages/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/svn/black-defiant-floodlights-17000148-e1_400.jpg" />
      <img src="https://images.thdstatic.com/productImages/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/svn/black-defiant-floodlights-17000148-e4_400.jpg" />
    `;
    const product = parseHomeDepotProductPage(html, {
      itemId: "324294069",
      url: "https://www.homedepot.com/p/324294069",
    });
    expect(product.imageUrls).toHaveLength(3);
    expect(product.imageUrls.some((u) => u.includes("-64_1000."))).toBe(true);
    expect(product.imageUrls.some((u) => u.includes("-e1_1000."))).toBe(true);
    expect(product.imageUrls.some((u) => u.includes("-e4_1000."))).toBe(true);
  });

  it("reads gallery URLs that use a <SIZE> token", () => {
    const html = `
      {"url":"https://images.thdstatic.com/productImages/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/svn/black-defiant-floodlights-17000148-e1_\\u003cSIZE>.jpg"}
      {"url":"https://images.thdstatic.com/productImages/cccccccc-cccc-cccc-cccc-cccccccccccc/svn/black-defiant-floodlights-17000148-40_<SIZE>.jpg"}
    `;
    const urls = collectHomeDepotImageUrlsFromHtml(html);
    expect(urls.some((u) => u.includes("-e1_1000.jpg"))).toBe(true);
    expect(urls.some((u) => u.includes("-40_1000.jpg"))).toBe(true);
  });
});
