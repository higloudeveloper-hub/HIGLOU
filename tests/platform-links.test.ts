import { describe, expect, it } from "vitest";
import {
  amazonProductUrl,
  buildPlatformUrls,
  ebayItemUrl,
  ebaySearchUrl,
  homeDepotProductUrl,
  walmartProductUrl,
  withPlatformUrls,
} from "@/lib/opportunity/platform-links";
import type { OpportunityProduct } from "@/lib/opportunity/types";

function hit(partial: Partial<OpportunityProduct> = {}): OpportunityProduct {
  return {
    asin: "B0TESTLNK1",
    title: "Cable organizer desk kit",
    brand: "Higlou",
    imageUrl: "",
    upc: "012345678905",
    amazonPrice: 18,
    cost: 18,
    ebayActiveLow: 42,
    mode: "amazon_to_ebay",
    sourceMarket: "amazon",
    sourceId: "B0TESTLNK1",
    destMarket: "ebay",
    ...partial,
  } as OpportunityProduct;
}

describe("platform-links", () => {
  it("builds Amazon / eBay / Walmart / HD product URLs from ids", () => {
    expect(amazonProductUrl("B0TESTLNK1")).toBe(
      "https://www.amazon.com/dp/B0TESTLNK1",
    );
    expect(ebayItemUrl("123456789012")).toBe(
      "https://www.ebay.com/itm/123456789012",
    );
    expect(walmartProductUrl("5544332211")).toBe(
      "https://www.walmart.com/ip/5544332211",
    );
    expect(homeDepotProductUrl("9988776655")).toBe(
      "https://www.homedepot.com/p/9988776655",
    );
    expect(amazonProductUrl("bad")).toBeNull();
  });

  it("falls back to exact eBay search (brand + tokens), not vague junk", () => {
    const url = ebaySearchUrl("Cable organizer desk kit", "Higlou");
    expect(url).toMatch(/^https:\/\/www\.ebay\.com\/sch\/i\.html\?/);
    expect(url).toContain("_nkw=");
    expect(url).toContain(encodeURIComponent("Higlou"));
  });

  it("prefers UPC for eBay search when available", () => {
    const url = ebaySearchUrl("Anything", "Brand", { upc: "012345678905" });
    expect(url).toContain(encodeURIComponent("012345678905"));
  });

  it("stamps platformUrls on an opportunity for side-by-side comparison", () => {
    const stamped = withPlatformUrls(
      hit({
        ebayItemId: "123456789012",
        walmartItemId: "5544332211",
        homedepotItemId: "9988776655",
      }),
    );
    expect(stamped.platformUrls?.amazon).toBe(
      "https://www.amazon.com/dp/B0TESTLNK1",
    );
    expect(stamped.platformUrls?.ebay).toBe(
      "https://www.ebay.com/itm/123456789012",
    );
    expect(stamped.platformUrls?.walmart).toBe(
      "https://www.walmart.com/ip/5544332211",
    );
    expect(stamped.platformUrls?.homedepot).toBe(
      "https://www.homedepot.com/p/9988776655",
    );
  });

  it("prefers live quote urls from cross-platform analysis", () => {
    const urls = buildPlatformUrls(hit(), [
      {
        platform: "walmart",
        price: 14.5,
        fees: null,
        id: "111",
        title: "Cable",
        url: "https://www.walmart.com/ip/111",
        matchedBy: "upc",
      },
      {
        platform: "ebay",
        price: 40,
        fees: null,
        id: "999888777666",
        title: "Cable",
        url: "https://www.ebay.com/itm/999888777666",
        matchedBy: "title",
      },
    ]);
    expect(urls.walmart).toBe("https://www.walmart.com/ip/111");
    expect(urls.ebay).toBe("https://www.ebay.com/itm/999888777666");
    expect(urls.amazon).toBe("https://www.amazon.com/dp/B0TESTLNK1");
  });

  it("uses retail sourceId for Walmart / Home Depot product pages", () => {
    const wm = buildPlatformUrls(
      hit({
        asin: "",
        sourceMarket: "walmart",
        sourceId: "7788990011",
        mode: "walmart_to_ebay",
      }),
    );
    expect(wm.walmart).toBe("https://www.walmart.com/ip/7788990011");

    const hd = buildPlatformUrls(
      hit({
        asin: "",
        sourceMarket: "homedepot",
        sourceId: "3344556677",
        mode: "homedepot_to_ebay",
      }),
    );
    expect(hd.homedepot).toBe("https://www.homedepot.com/p/3344556677");
  });
});
