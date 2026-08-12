import { describe, expect, it } from "vitest";
import {
  classifyOffersForStore,
  HIGLOU_DEFAULT_STORE_PATHS,
  parseStoreCategoriesFromXml,
} from "@/lib/ebay/store-organize";

describe("parseStoreCategoriesFromXml", () => {
  it("parses nested ChildCategory paths with IDs", () => {
    const xml = `<?xml version="1.0"?>
<GetStoreResponse>
  <CustomCategories>
    <CustomCategory>
      <CategoryID>111</CategoryID>
      <Name>Plumbing</Name>
      <ChildCategory>
        <CategoryID>222</CategoryID>
        <Name>Pumps</Name>
      </ChildCategory>
    </CustomCategory>
  </CustomCategories>
</GetStoreResponse>`;
    const cats = parseStoreCategoriesFromXml(xml);
    expect(cats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/Plumbing",
          name: "Plumbing",
          categoryId: "111",
        }),
        expect.objectContaining({
          path: "/Plumbing/Pumps",
          name: "Pumps",
          categoryId: "222",
        }),
      ]),
    );
  });
});

describe("classifyOffersForStore", () => {
  const categories = HIGLOU_DEFAULT_STORE_PATHS.map((path) => ({
    path,
    name: path.split("/").pop() || path,
  }));

  it("maps utility pumps to Plumbing/Pumps", () => {
    const [row] = classifyOffersForStore(
      [
        {
          offerId: "1",
          sku: "PUMP1",
          status: "PUBLISHED",
          title: "Everbilt 1/6 HP Submersible Utility Pump",
          categoryId: "61573",
          listingId: null,
          price: 49,
          currentStorePaths: [],
        },
      ],
      categories,
    );
    expect(row.suggestedPath).toBe("/Plumbing/Pumps");
    expect(row.confidence).toBeGreaterThan(0.5);
    expect(row.needsReview).toBe(false);
  });

  it("maps ceiling lights to Lighting/Ceiling Lights", () => {
    const [row] = classifyOffersForStore(
      [
        {
          offerId: "2",
          sku: "LIGHT1",
          status: "PUBLISHED",
          title: "Matte Black Flush Mount Ceiling Light 14 inch",
          categoryId: "117503",
          listingId: null,
          price: 39,
          currentStorePaths: ["/Other"],
        },
      ],
      categories,
    );
    expect(row.suggestedPath).toBe("/Lighting/Ceiling Lights");
  });

  it("suggests Higlou taxonomy folders even when store has none yet", () => {
    const [row] = classifyOffersForStore(
      [
        {
          offerId: "3",
          sku: "PUMP2",
          status: "PUBLISHED",
          title: "Utility Water Pump 1/4 HP",
          categoryId: "61573",
          listingId: "123",
          price: 40,
          currentStorePaths: [],
        },
      ],
      [],
    );
    expect(row.suggestedPath).toBe("/Plumbing/Pumps");
    expect(row.reason).toMatch(/will create folder/i);
    expect(row.unchanged).toBe(false);
  });

  it("never dumps laser levels / batteries / scrubbers into Other", () => {
    const rows = classifyOffersForStore(
      [
        {
          offerId: "a",
          sku: "A",
          status: "PUBLISHED",
          title: "DeWalt Green Cross Line Laser Level with Case",
          categoryId: "1",
          listingId: "1",
          price: 1,
          currentStorePaths: [],
        },
        {
          offerId: "b",
          sku: "B",
          status: "PUBLISHED",
          title: "M18 REDLITHIUM FORGE HD12.0 Battery Pack",
          categoryId: "1",
          listingId: "2",
          price: 1,
          currentStorePaths: [],
        },
        {
          offerId: "c",
          sku: "C",
          status: "PUBLISHED",
          title: "Ryobi 11-Piece Scrubber Accessory Kit",
          categoryId: "1",
          listingId: "3",
          price: 1,
          currentStorePaths: [],
        },
        {
          offerId: "d",
          sku: "D",
          status: "PUBLISHED",
          title: "Philips Hue Econic Outdoor Pedestal Light",
          categoryId: "1",
          listingId: "4",
          price: 1,
          currentStorePaths: [],
        },
      ],
      [],
    );
    expect(rows.map((r) => r.suggestedPath)).toEqual([
      "/Tools/Measuring",
      "/Tools/Batteries",
      "/Home/Cleaning Accessories",
      "/Lighting/Smart Lighting",
    ]);
    for (const row of rows) {
      expect(row.suggestedPath.toLowerCase()).not.toContain("/other");
      expect(row.confidence).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("uses the seller's existing Bath and Plumbing folder", () => {
    const live = [
      {
        path: "/Bath and Plumbing",
        name: "Bath and Plumbing",
        categoryId: "9001",
      },
      {
        path: "/Plumbing/Pumps",
        name: "Pumps",
        categoryId: "9003",
      },
      {
        path: "/Tools",
        name: "Tools",
        categoryId: "9002",
      },
    ];
    const rows = classifyOffersForStore(
      [
        {
          offerId: "p1",
          sku: "P1",
          status: "PUBLISHED",
          title: "Everbilt Submersible Utility Pump",
          categoryId: "61573",
          listingId: "11",
          price: 49,
          currentStorePaths: [],
        },
        {
          offerId: "p2",
          sku: "P2",
          status: "PUBLISHED",
          title: "Moen Kitchen Faucet Brushed Nickel",
          categoryId: "20621",
          listingId: "12",
          price: 89,
          currentStorePaths: [],
        },
        {
          offerId: "p3",
          sku: "P3",
          status: "PUBLISHED",
          title: "Glacier Bay Aragon Single Handle Tub and Shower Set Chrome",
          categoryId: "20601",
          listingId: "13",
          price: 69,
          currentStorePaths: ["/Other"],
        },
      ],
      live,
    );
    expect(rows[0].suggestedPath).toBe("/Bath and Plumbing");
    expect(rows[1].suggestedPath).toBe("/Bath and Plumbing");
    expect(rows[2].suggestedPath).toBe("/Bath and Plumbing");
    expect(rows[0].reason).toMatch(/Bath and Plumbing/i);
  });

  it("remaps Higlou Plumbing taxonomy to Bath and Plumbing on publish-like titles", () => {
    const live = [
      {
        path: "/Bath and Plumbing",
        name: "Bath and Plumbing",
        categoryId: "9001",
      },
      {
        path: "/Plumbing/Pumps",
        name: "Pumps",
        categoryId: "9003",
      },
      {
        path: "/Plumbing/Faucets",
        name: "Faucets",
        categoryId: "9004",
      },
    ];
    const rows = classifyOffersForStore(
      [
        {
          offerId: "a",
          sku: "A",
          status: "PUBLISHED",
          title: "Delta Bathroom Sink Faucet",
          categoryId: "63897",
          brand: "Delta",
          productType: "Faucet",
          categoryName: "Faucets",
          listingId: "1",
          price: 40,
          currentStorePaths: [],
        },
        {
          offerId: "b",
          sku: "B",
          status: "PUBLISHED",
          title: "Kohler Toilet Fill Valve",
          categoryId: "20591",
          brand: "Kohler",
          listingId: "2",
          price: 20,
          currentStorePaths: [],
        },
      ],
      live,
    );
    expect(rows.every((r) => r.suggestedPath === "/Bath and Plumbing")).toBe(
      true,
    );
  });

  it("keeps power tools out of Bath and Plumbing", () => {
    const live = [
      {
        path: "/Bath and Plumbing",
        name: "Bath and Plumbing",
        categoryId: "9001",
      },
      {
        path: "/Tools",
        name: "Tools",
        categoryId: "9002",
      },
    ];
    const [row] = classifyOffersForStore(
      [
        {
          offerId: "t1",
          sku: "T1",
          status: "PUBLISHED",
          title: "Ryobi 18V ONE+ Rotary Tool",
          categoryId: "20779",
          brand: "Ryobi",
          productType: "Rotary Tool",
          listingId: "99",
          price: 59,
          currentStorePaths: [],
        },
      ],
      live,
    );
    expect(row.suggestedPath.toLowerCase()).not.toContain("bath");
    expect(row.suggestedPath.toLowerCase()).toMatch(/tool/);
  });

  it("still prefers Bath and Plumbing when that folder has a child", () => {
    const live = [
      {
        path: "/Bath and Plumbing",
        name: "Bath and Plumbing",
        categoryId: "9001",
      },
      {
        path: "/Bath and Plumbing/General",
        name: "General",
        categoryId: "9005",
      },
      {
        path: "/Plumbing/Pumps",
        name: "Pumps",
        categoryId: "9003",
      },
    ];
    const [row] = classifyOffersForStore(
      [
        {
          offerId: "p1",
          sku: "P1",
          status: "PUBLISHED",
          title: "Everbilt Submersible Utility Pump",
          categoryId: "61573",
          listingId: "11",
          price: 49,
          currentStorePaths: [],
        },
      ],
      live,
    );
    expect(row.suggestedPath.startsWith("/Bath and Plumbing")).toBe(true);
    expect(row.suggestedPath.toLowerCase()).not.toContain("/plumbing/pumps");
  });
});
