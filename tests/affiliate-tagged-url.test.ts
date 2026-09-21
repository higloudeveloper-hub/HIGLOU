import { describe, expect, it } from "vitest";
import {
  amazonUrlHasAssociateTag,
  ensureTaggedAmazonDestination,
  extractAsinFromAmazonUrl,
  isAmazonProductUrl,
  isSmartGoPath,
  readAssociateTagFromUrl,
  smartGoSlug,
} from "@/lib/monetization/affiliate/tagged-url";

describe("tagged affiliate URL trust", () => {
  it("detects Amazon product URLs and ASINs", () => {
    expect(
      isAmazonProductUrl("https://www.amazon.com/dp/B0CHS1BVBC?tag=x-20"),
    ).toBe(true);
    expect(
      extractAsinFromAmazonUrl(
        "https://www.amazon.com/gp/product/B0CHS1BVBC/ref=xx",
      ),
    ).toBe("B0CHS1BVBC");
    expect(isSmartGoPath("https://higlou.vercel.app/go/abcd1234")).toBe(true);
    expect(smartGoSlug("/go/abcd1234")).toBe("abcd1234");
  });

  it("requires tag= for commission-safe Amazon destinations", () => {
    expect(
      amazonUrlHasAssociateTag(
        "https://www.amazon.com/dp/B0CHS1BVBC?tag=higlou-20",
        "higlou-20",
      ),
    ).toBe(true);
    expect(
      amazonUrlHasAssociateTag(
        "https://www.amazon.com/dp/B0CHS1BVBC",
        "higlou-20",
      ),
    ).toBe(false);
    expect(
      amazonUrlHasAssociateTag(
        "https://www.amazon.com/dp/B0CHS1BVBC?tag=other-20",
        "higlou-20",
      ),
    ).toBe(false);
    expect(
      readAssociateTagFromUrl(
        "https://www.amazon.com/dp/B0CHS1BVBC?tag=higlou-20",
      ),
    ).toBe("higlou-20");
  });

  it("rebuilds bare Amazon URLs with the Associate tag", () => {
    const healed = ensureTaggedAmazonDestination({
      asin: "B0CHS1BVBC",
      destinationUrl: "https://www.amazon.com/dp/B0CHS1BVBC",
      associateTag: "higlou-20",
    });
    expect(healed).toContain("https://www.amazon.com/dp/B0CHS1BVBC");
    expect(healed).toContain("tag=higlou-20");
  });

  it("keeps an already-correct tagged URL", () => {
    const url =
      "https://www.amazon.com/dp/B0CHS1BVBC?tag=higlou-20&psc=1";
    expect(
      ensureTaggedAmazonDestination({
        asin: "B0CHS1BVBC",
        destinationUrl: url,
        associateTag: "higlou-20",
      }),
    ).toBe(url);
  });

  it("returns null when tag or ASIN is missing", () => {
    expect(
      ensureTaggedAmazonDestination({
        asin: "B0CHS1BVBC",
        associateTag: "",
      }),
    ).toBeNull();
    expect(
      ensureTaggedAmazonDestination({
        asin: "bad",
        associateTag: "higlou-20",
      }),
    ).toBeNull();
  });
});
