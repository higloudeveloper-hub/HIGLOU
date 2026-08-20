import { describe, expect, it } from "vitest";
import { matchListingToShopProduct } from "../lib/don-baraton/match-promo-listings";

describe("matchListingToShopProduct", () => {
  const shop = [
    { id: "1", sku: "RYOBI-PCL424B", slug: "ryobi", name: "Ryobi" },
    { id: "2", sku: "echo-cs", slug: "echo", name: "Echo" },
  ];

  it("matches Higlou SKU to the live Don Baratón product", () => {
    expect(matchListingToShopProduct(" ryobi-pcl424b ", shop)?.id).toBe("1");
  });

  it("returns null when the listing is not on the shop yet", () => {
    expect(matchListingToShopProduct("missing", shop)).toBeNull();
    expect(matchListingToShopProduct("", shop)).toBeNull();
  });
});
