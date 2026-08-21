import { describe, expect, it } from "vitest";
import { parseWalmartLink } from "@/lib/walmart/item-id";
import { detectCatalogStore } from "@/lib/catalog/detect-store";

describe("parseWalmartLink", () => {
  it("reads /ip/slug/itemId", () => {
    const parsed = parseWalmartLink(
      "https://www.walmart.com/ip/Great-Value-Whole-Vitamin-D-Milk-Gallon-128-Fl-Oz/10449411",
    );
    expect(parsed?.itemId).toBe("10449411");
    expect(parsed?.canonicalUrl).toBe("https://www.walmart.com/ip/10449411");
  });

  it("reads /ip/itemId", () => {
    expect(parseWalmartLink("https://www.walmart.com/ip/10449411")?.itemId).toBe(
      "10449411",
    );
  });

  it("reads walmart.ca", () => {
    expect(
      parseWalmartLink("https://www.walmart.ca/ip/dewalt-drill/6000191234567")
        ?.itemId,
    ).toBe("6000191234567");
  });

  it("rejects Amazon and Home Depot links", () => {
    expect(parseWalmartLink("https://www.amazon.com/dp/B0D123ABCD")).toBeNull();
    expect(
      parseWalmartLink("https://www.homedepot.com/p/DEWALT/312119566"),
    ).toBeNull();
  });

  it("does not treat a bare number as Walmart", () => {
    expect(parseWalmartLink("312119566")).toBeNull();
    expect(detectCatalogStore("312119566")).toBe("homedepot");
  });
});
