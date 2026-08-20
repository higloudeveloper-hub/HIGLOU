import { describe, expect, it } from "vitest";
import { matchListingToShopProduct } from "../lib/don-baraton/match-promo-listings";
import { toEbayInventorySku } from "../lib/ebay/listing-helpers";

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

  it("matches hyphenated Higlou SKUs to eBay custom labels on the shop", () => {
    const live = [
      {
        id: "3",
        sku: "MILW48731430",
        slug: "milwaukee-48-73-1430",
        name: "Milwaukee Hard Hat",
      },
    ];
    expect(matchListingToShopProduct("MILW-48-73-1430", live)?.id).toBe("3");
  });

  it("matches Amazon import SKUs to the HG label Don Baratón stored from CSV", () => {
    const listingSku = "AMZ-B0CHS1BVBC";
    const live = [
      {
        id: "4",
        sku: toEbayInventorySku(listingSku),
        slug: "amazon-import",
        name: "Imported Amazon item",
      },
    ];
    expect(matchListingToShopProduct(listingSku, live)?.id).toBe("4");
  });

  it("matches a unique shop title when the SKU format differs", () => {
    const live = [
      {
        id: "5",
        sku: "OTHER",
        slug: "ryobi-sander",
        name: 'Ryobi 320W 5" Random Orbit Sander with Dust Bag',
      },
    ];
    expect(
      matchListingToShopProduct(
        "P421A",
        live,
        'Ryobi 320W 5" Random Orbit Sander with Dust Bag',
      )?.id,
    ).toBe("5");
  });
});
