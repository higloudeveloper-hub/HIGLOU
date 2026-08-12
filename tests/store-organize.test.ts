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
    expect(row.suggestedPath).toBe("/Tools");
  });

  it("files tool brands into seller Tools even when Higlou Power Tools exists", () => {
    const live = [
      {
        path: "/Tools",
        name: "Tools",
        categoryId: "9002",
      },
      {
        path: "/Tools/Power Tools",
        name: "Power Tools",
        categoryId: "9010",
      },
      {
        path: "/Bath and Plumbing",
        name: "Bath and Plumbing",
        categoryId: "9001",
      },
    ];
    const rows = classifyOffersForStore(
      [
        {
          offerId: "t1",
          sku: "T1",
          status: "PUBLISHED",
          title: "Ryobi 18V ONE+ Rotary Tool P241",
          categoryId: "20779",
          brand: "Ryobi",
          listingId: "1",
          price: 59,
          currentStorePaths: [],
        },
        {
          offerId: "t2",
          sku: "T2",
          status: "PUBLISHED",
          title: "DeWalt 20V MAX Cordless Drill",
          categoryId: "29518",
          brand: "DeWalt",
          listingId: "2",
          price: 99,
          currentStorePaths: [],
        },
        {
          offerId: "t3",
          sku: "T3",
          status: "PUBLISHED",
          title: "Milwaukee M18 Impact Driver",
          categoryId: "42259",
          brand: "Milwaukee",
          listingId: "3",
          price: 129,
          currentStorePaths: ["/Other"],
        },
      ],
      live,
    );
    expect(rows.every((r) => r.suggestedPath === "/Tools")).toBe(true);
  });

  it("assigns LED lamps to Lighting + Smart Home (2nd Store folder)", () => {
    const live = [
      {
        path: "/Lighting",
        name: "Lighting",
        categoryId: "9100",
      },
      {
        path: "/Smart Home",
        name: "Smart Home",
        categoryId: "9200",
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
          offerId: "led1",
          sku: "LED1",
          status: "PUBLISHED",
          title: "Philips Hue White LED Smart Bulb A19",
          categoryId: "112581",
          brand: "Philips Hue",
          productType: "LED Bulb",
          listingId: "55",
          price: 29,
          currentStorePaths: ["/Lighting"],
        },
      ],
      live,
    );
    // Featured Smart Home wins over non-featured Lighting on this store.
    expect(row.suggestedPath).toBe("/Smart Home");
    expect(row.unchanged).toBe(false);
  });

  it("maps into the four featured folders Tools / Smart Home / Outdoor Living / Bath and Plumbing", () => {
    const featured = [
      { path: "/Tools", name: "Tools", categoryId: "1" },
      { path: "/Smart Home", name: "Smart Home", categoryId: "2" },
      { path: "/Outdoor Living", name: "Outdoor Living", categoryId: "3" },
      {
        path: "/Bath and Plumbing",
        name: "Bath and Plumbing",
        categoryId: "4",
      },
    ];
    const rows = classifyOffersForStore(
      [
        {
          offerId: "1",
          sku: "1",
          status: "PUBLISHED",
          title: "Ryobi 18V Drill",
          categoryId: "20779",
          brand: "Ryobi",
          listingId: "1",
          price: 1,
          currentStorePaths: [],
        },
        {
          offerId: "2",
          sku: "2",
          status: "PUBLISHED",
          title: "Philips Hue LED Smart Bulb",
          categoryId: "112581",
          brand: "Philips",
          listingId: "2",
          price: 1,
          currentStorePaths: [],
        },
        {
          offerId: "3",
          sku: "3",
          status: "PUBLISHED",
          title: "Patio Umbrella Outdoor Living",
          categoryId: "20524",
          listingId: "3",
          price: 1,
          currentStorePaths: [],
        },
        {
          offerId: "4",
          sku: "4",
          status: "PUBLISHED",
          title: "Moen Kitchen Faucet",
          categoryId: "63897",
          brand: "Moen",
          listingId: "4",
          price: 1,
          currentStorePaths: [],
        },
        {
          offerId: "5",
          sku: "5",
          status: "PUBLISHED",
          title: "Solar LED Outdoor String Lights",
          categoryId: "117503",
          listingId: "5",
          price: 1,
          currentStorePaths: [],
        },
      ],
      featured,
    );
    expect(rows[0].suggestedPath).toBe("/Tools");
    expect(rows[1].suggestedPath).toBe("/Smart Home");
    expect(rows[2].suggestedPath).toBe("/Outdoor Living");
    expect(rows[3].suggestedPath).toBe("/Bath and Plumbing");
    expect(rows[4].suggestedPath).toBe("/Outdoor Living");
    expect(rows[4].suggestedPath2).toBe("/Smart Home");
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
