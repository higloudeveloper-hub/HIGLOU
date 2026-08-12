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
});
