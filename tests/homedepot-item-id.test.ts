import { describe, expect, it } from "vitest";
import { parseHomeDepotLink } from "@/lib/homedepot/item-id";
import { detectCatalogStore } from "@/lib/catalog/detect-store";

describe("parseHomeDepotLink", () => {
  it("reads /p/slug/itemId", () => {
    const parsed = parseHomeDepotLink(
      "https://www.homedepot.com/p/DEWALT-20V-MAX-Drill-DCD791P1/312119566",
    );
    expect(parsed?.itemId).toBe("312119566");
    expect(parsed?.canonicalUrl).toBe(
      "https://www.homedepot.com/p/DEWALT-20V-MAX-Drill-DCD791P1/312119566",
    );
  });

  it("reads a bare item id", () => {
    expect(parseHomeDepotLink("312119566")?.canonicalUrl).toBe(
      "https://www.homedepot.com/p/312119566",
    );
  });

  it("reads homedepot.ca /product/", () => {
    expect(
      parseHomeDepotLink("https://www.homedepot.ca/product/dewalt-drill/1001234567")
        ?.itemId,
    ).toBe("1001234567");
  });

  it("rejects non-Home Depot links", () => {
    expect(parseHomeDepotLink("https://www.amazon.com/dp/B0D123ABCD")).toBeNull();
  });
});

describe("detectCatalogStore", () => {
  it("routes Home Depot and Amazon separately", () => {
    expect(
      detectCatalogStore(
        "https://www.homedepot.com/p/DEWALT-Drill/312119566",
      ),
    ).toBe("homedepot");
    expect(detectCatalogStore("https://www.amazon.com/dp/B0D123ABCD")).toBe(
      "amazon",
    );
    expect(detectCatalogStore("312119566")).toBe("homedepot");
  });
});
