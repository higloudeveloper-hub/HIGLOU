import { describe, expect, it } from "vitest";
import {
  classifyOffersForStore,
  HIGLOU_DEFAULT_STORE_PATHS,
} from "@/lib/ebay/store-organize";

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
          sku: "PUMP-1",
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
          sku: "LIGHT-1",
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
});
