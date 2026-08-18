import { describe, expect, it } from "vitest";
import {
  amazonSearchKeywords,
  extractModelCode,
  pickAmazonCatalogMatch,
  scoreAmazonCatalogHit,
} from "@/lib/amazon/catalog-match";

const hits = [
  {
    asin: "B0BPY8L57P",
    title: "DEWALT 20V Max Drywall Screwgun, Tool Only (DCF630B)",
  },
  {
    asin: "B0BPYBS82C",
    title:
      "DEWALT 20V Max Drywall Screwgun with (2) 2Ah Batteries and Charger (DCF630D2)",
  },
  {
    asin: "B0C917MJBP",
    title: "DEWALT 20V Max Drywall Screwgun, Tool Only (DCF630B) (Renewed)",
  },
];

describe("Amazon catalog auto-match", () => {
  it("reads DCF630 from a Higlou title", () => {
    expect(
      extractModelCode("DeWalt 20V MAX XR Brushless Drywall Screwgun DCF630"),
    ).toBe("DCF630");
  });

  it("searches Amazon by brand + model", () => {
    expect(
      amazonSearchKeywords({
        brand: "DeWalt",
        title: "DeWalt 20V MAX XR Brushless Drywall Screwgun DCF630",
      }),
    ).toBe("DeWalt DCF630");
  });

  it("picks the bare tool, not the battery kit or renewed listing", () => {
    const match = pickAmazonCatalogMatch(hits, {
      brand: "DeWalt",
      title: "DeWalt 20V MAX XR Brushless Drywall Screwgun DCF630",
    });
    expect(match?.asin).toBe("B0BPY8L57P");
    expect(
      scoreAmazonCatalogHit(hits[0], {
        title: "DeWalt 20V MAX XR Brushless Drywall Screwgun DCF630",
        brand: "DeWalt",
      }),
    ).toBeGreaterThan(
      scoreAmazonCatalogHit(hits[1], {
        title: "DeWalt 20V MAX XR Brushless Drywall Screwgun DCF630",
        brand: "DeWalt",
      }),
    );
  });

  it("picks the kit when the Higlou listing is a kit", () => {
    const match = pickAmazonCatalogMatch(hits, {
      brand: "DeWalt",
      model: "DCF630D2",
      title: "DeWalt DCF630 kit with 2 batteries and charger",
    });
    expect(match?.asin).toBe("B0BPYBS82C");
  });
});
