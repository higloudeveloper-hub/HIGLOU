import { describe, expect, it } from "vitest";
import { amazonAsinFromListing, amazonListingUrl, parseAmazonLink } from "@/lib/amazon/asin";

describe("parseAmazonLink", () => {
  it("reads /dp/ASIN", () => {
    const parsed = parseAmazonLink(
      "https://www.amazon.com/Some-Title/dp/B0D123ABCD/ref=sr_1_1",
    );
    expect(parsed?.asin).toBe("B0D123ABCD");
    expect(parsed?.canonicalUrl).toBe("https://www.amazon.com/dp/B0D123ABCD");
  });

  it("reads /gp/product/ASIN", () => {
    expect(
      parseAmazonLink("https://www.amazon.com/gp/product/B09ABCDEFG")?.asin,
    ).toBe("B09ABCDEFG");
  });

  it("reads a bare ASIN", () => {
    expect(parseAmazonLink("b0d123abcd")?.asin).toBe("B0D123ABCD");
  });

  it("reads amazon.es and query asin", () => {
    expect(
      parseAmazonLink("https://www.amazon.es/dp/B0ABCDEF12?th=1")?.asin,
    ).toBe("B0ABCDEF12");
  });

  it("rejects non-Amazon links", () => {
    expect(parseAmazonLink("https://ebay.com/itm/123")).toBeNull();
  });

  it("flags short links until they redirect", () => {
    const parsed = parseAmazonLink("https://amzn.to/abc123");
    expect(parsed?.short).toBe(true);
  });

  it("keeps the ASIN from an Amazon import SKU even if the model is just the brand", () => {
    expect(
      amazonAsinFromListing({
        sku: "AMZ-B0D123ABCD",
        asin: "",
        itemSpecifics: [],
      }),
    ).toBe("B0D123ABCD");
    expect(
      amazonAsinFromListing({
        sku: "KSIPZE-100FT",
        itemSpecifics: [{ label: "ASIN", value: "B0D123ABCD" }],
      }),
    ).toBe("B0D123ABCD");
    expect(
      amazonAsinFromListing({
        amazonAsin: "B0D123ABCD",
        sku: "MILWAUKEE-HAT",
      }),
    ).toBe("B0D123ABCD");
    expect(
      amazonAsinFromListing({
        sku: "MILWAUKEE-HAT",
        description:
          '<p>Imported from <a href="https://www.amazon.com/dp/B08MESHHAT">Amazon</a></p>',
      }),
    ).toBe("B08MESHHAT");
  });

  it("opens the official Amazon listing from an imported ASIN", () => {
    expect(
      amazonListingUrl({ sku: "AMZ-B08HRPDBFF" }),
    ).toBe("https://www.amazon.com/dp/B08HRPDBFF");
    expect(
      amazonListingUrl({
        amazonUrl: "https://www.amazon.com/Some-Title/dp/B0FS72NDGZ/ref=sr_1_1",
      }),
    ).toBe("https://www.amazon.com/dp/B0FS72NDGZ");
  });
});
