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

  it("reads the iPhone GraphQL gallery, including SIZE tokens", () => {
    const json = JSON.stringify({
      data: {
        product: {
          itemId: "307505277",
          identifiers: {
            brandName: "Commercial Electric",
            modelNumber: "DW9582BK-C",
            productLabel: "19-Watt Black Outdoor LED Classic Wall Pack Light",
          },
          media: {
            images: [
              {
                url: "https://images.thdstatic.com/productImages/aaa/svn/black-commercial-electric-wall-pack-lights-dw9582bk-c-64_<SIZE>.jpg",
              },
              {
                url: "https://images.thdstatic.com/productImages/bbb/svn/black-commercial-electric-wall-pack-lights-dw9582bk-c-e1_<SIZE>.jpg",
              },
              {
                url: "https://images.thdstatic.com/productImages/ccc/svn/black-commercial-electric-wall-pack-lights-dw9582bk-c-e4_<SIZE>.jpg",
              },
              {
                url: "https://images.thdstatic.com/productImages/ddd/svn/black-commercial-electric-wall-pack-lights-dw9582bk-c-40_<SIZE>.jpg",
              },
              {
                url: "https://images.thdstatic.com/productImages/eee/svn/black-commercial-electric-wall-pack-lights-dw9582bk-c-1d_<SIZE>.jpg",
              },
            ],
          },
        },
      },
    });
    const product = parseHomeDepotProductPage(json, {
      itemId: "307505277",
      url: "https://www.homedepot.com/p/307505277",
    });
    expect(product.title).toMatch(/Wall Pack/i);
    expect(product.brand).toBe("Commercial Electric");
    expect(product.model).toBe("DW9582BK-C");
    expect(product.imageUrls.length).toBe(5);
    expect(product.imageUrls.every((u) => u.includes("_1000."))).toBe(true);
    expect(product.imageUrls.some((u) => u.includes("-e1_1000."))).toBe(true);
    expect(product.imageUrls.some((u) => u.includes("-1d_1000."))).toBe(true);
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

  it("keeps Beyond Bright photos when the model is BEBRNOV-PD27", () => {
    const html = `
      https://images.thdstatic.com/productImages/aaa/svn/beyond-bright-led-light-bulbs-bebrnov-pd27-64_600.jpg
      https://images.thdstatic.com/productImages/bbb/svn/beyond-bright-led-light-bulbs-bebrnov-pd27-e4_600.jpg
      https://images.thdstatic.com/productImages/ccc/svn/other-led-bulbs-pd27-64_600.jpg
    `;
    const photos = selectHomeDepotSearchPhotos(
      collectHomeDepotImageUrlsFromHtml(html),
      { model: "BEBRNOV-PD27", itemId: "319137828" },
    );
    expect(photos).toHaveLength(2);
    expect(photos.every((u) => u.includes("bebrnov-pd27"))).toBe(true);
  });

  it("keeps wall-pack photos when the model is DW9582BK-C", () => {
    const html = `
      https://images.thdstatic.com/productImages/aaa/svn/black-commercial-electric-wall-pack-lights-dw9582bk-c-64_600.jpg
      https://images.thdstatic.com/productImages/bbb/svn/black-commercial-electric-wall-pack-lights-dw9582bk-c-e4_600.jpg
      https://images.thdstatic.com/productImages/ccc/svn/black-wall-pack-lights-dw10231bk-c-64_600.jpg
    `;
    const photos = selectHomeDepotSearchPhotos(
      collectHomeDepotImageUrlsFromHtml(html),
      { model: "DW9582BK-C", itemId: "307505277" },
    );
    expect(photos).toHaveLength(2);
    expect(photos.every((u) => u.includes("dw9582bk-c"))).toBe(true);
  });

  it("keeps the repeating wall-pack stem when the model is missing", () => {
    const html = `
      https://images.thdstatic.com/productImages/aaa/svn/black-commercial-electric-wall-pack-lights-dw9582bk-c-64_600.jpg
      https://images.thdstatic.com/productImages/bbb/svn/black-commercial-electric-wall-pack-lights-dw9582bk-c-e4_600.jpg
      https://images.thdstatic.com/productImages/ccc/svn/black-wall-pack-lights-dw10231bk-c-64_600.jpg
    `;
    const photos = selectHomeDepotSearchPhotos(
      collectHomeDepotImageUrlsFromHtml(html),
      { model: "", itemId: "307505277" },
    );
    expect(photos).toHaveLength(2);
    expect(photos.every((u) => u.includes("dw9582bk-c"))).toBe(true);
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

  it("reads JSON-escaped and percent-encoded gallery URLs", () => {
    const html = `
      {"url":"https:\\/\\/images.thdstatic.com\\/productImages\\/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\\/svn\\/black-defiant-floodlights-17000148-e1_1000.jpg"}
      https%3A%2F%2Fimages.thdstatic.com%2FproductImages%2Fcccccccc-cccc-cccc-cccc-cccccccccccc%2Fsvn%2Fblack-defiant-floodlights-17000148-1d_600.jpg
    `;
    const urls = collectHomeDepotImageUrlsFromHtml(html);
    expect(urls.some((u) => u.includes("-e1_1000.jpg"))).toBe(true);
    expect(urls.some((u) => u.includes("-1d_600.jpg"))).toBe(true);
  });

  it("keeps this SKU even when twelve related products appear first", () => {
    const related = Array.from({ length: 12 }, (_, i) => {
      const id = String(i).padStart(2, "0");
      return `https://images.thdstatic.com/productImages/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa${id}/svn/other-floodlights-17000019-64_400.jpg`;
    });
    const own = [
      "64",
      "e1",
      "e2",
      "e3",
      "e4",
      "40",
      "a0",
      "1d",
      "1f",
      "44",
      "66",
    ].map(
      (type, i) =>
        `https://images.thdstatic.com/productImages/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb${String(i).padStart(2, "0")}/svn/black-defiant-floodlights-17000148-${type}_400.jpg`,
    );
    const html = [...related, ...own].map((u) => `<img src="${u}" />`).join("\n");
    const photos = selectHomeDepotSearchPhotos(
      collectHomeDepotImageUrlsFromHtml(html),
      { model: "17000148", itemId: "324294069" },
    );
    expect(photos).toHaveLength(11);
    expect(photos.every((u) => u.includes("17000148"))).toBe(true);
    expect(photos.some((u) => u.includes("17000019"))).toBe(false);
  });

  it("reads official media.images JSON even when related products fill the HTML first", () => {
    const related = Array.from({ length: 12 }, (_, i) => {
      const id = String(i).padStart(2, "0");
      return `"url":"https://images.thdstatic.com/productImages/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa${id}/svn/other-floodlights-17000019-64_<SIZE>.jpg"`;
    }).join(",");
    const gallery = [
      "64",
      "e1",
      "e2",
      "e3",
      "e4",
      "40",
      "a0",
      "1d",
      "1f",
      "44",
      "66",
    ]
      .map(
        (type, i) =>
          `"url":"https://images.thdstatic.com/productImages/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb${String(i).padStart(2, "0")}/svn/black-defiant-floodlights-17000148-${type}_\\u003cSIZE>.jpg"`,
      )
      .join(",");
    const html = `{"itemId":"324294069","media":{"images":[${related},${gallery}]}}`;
    const photos = selectHomeDepotSearchPhotos(
      collectHomeDepotImageUrlsFromHtml(html),
      { model: "17000148", itemId: "324294069" },
    );
    expect(photos).toHaveLength(11);
    expect(photos.every((u) => u.includes("17000148") && u.includes("_1000."))).toBe(
      true,
    );
  });

  it("drops related-product photos from the same Home Depot page", () => {
    const html = `
      <meta property="og:image" content="https://images.thdstatic.com/productImages/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/svn/milwaukee-brad-nailers-2541-20-48-73-2010-64_400.jpg" />
      <img src="https://images.thdstatic.com/productImages/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/svn/milwaukee-brad-nailers-2541-20-48-73-2010-e1_400.jpg" />
      <img src="https://images.thdstatic.com/productImages/dddddddd-dddd-dddd-dddd-dddddddddddd/svn/milwaukee-power-drills-2904-20-64_400.jpg" />
    `;
    const product = parseHomeDepotProductPage(html, {
      itemId: "330557271",
      url: "https://www.homedepot.com/p/330557271",
    });
    expect(product.imageUrls.every((u) => u.includes("2541-20-48-73-2010"))).toBe(
      true,
    );
    expect(product.imageUrls.some((u) => u.includes("2904-20"))).toBe(false);
    expect(product.imageUrls.length).toBe(2);
  });
});
