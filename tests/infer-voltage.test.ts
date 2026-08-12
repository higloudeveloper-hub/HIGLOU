import { describe, expect, it } from "vitest";
import {
  formatEbayVoltage,
  inferVoltageFromText,
  parseMissingAspectFromEbayError,
  ensureInferredElectricalAspects,
} from "@/lib/ebay/infer-voltage";
import { listingToInventoryItem } from "@/lib/ebay/listing-to-inventory";
import { createEmptyListing } from "@/lib/demo/sample-listing";

describe("inferVoltageFromText", () => {
  it("formats voltage for eBay aspects", () => {
    expect(formatEbayVoltage(120)).toBe("120 V");
    expect(formatEbayVoltage("240V")).toBe("240 V");
  });

  it("reads labeled voltage", () => {
    expect(inferVoltageFromText("Input Voltage: 240V AC")).toBe("240 V");
  });

  it("prefers common EV adapter rating for NACS/CCS titles", () => {
    expect(
      inferVoltageFromText(
        "DeWalt EV Charger NACS to CCS1 Fast Charge Adapter",
      ),
    ).toBe("1000 V");
  });

  it("parses eBay missing-aspect error", () => {
    expect(
      parseMissingAspectFromEbayError(
        "The item specific Voltage is missing. Add Voltage to this listing (eBay 25002)",
      ),
    ).toBe("Voltage");
  });

  it("adds Voltage onto inventory aspects for EV adapters", () => {
    const listing = createEmptyListing();
    listing.title = "DeWalt EV Charger NACS to CCS1 Fast Charge Adapter";
    listing.brand = "DeWalt";
    listing.categoryId = "179421";
    listing.categoryName = "Electric Vehicle Accessories";
    listing.price = 155;
    listing.sku = "TESTSKU1";
    listing.images = [
      {
        id: "1",
        url: "https://example.com/a.jpg",
        fileName: "a.jpg",
        isPrimary: true,
        mimeType: "image/jpeg",
        sizeBytes: 1,
        sortOrder: 0,
      },
    ];
    const inv = listingToInventoryItem(listing);
    expect(inv.aspects.Voltage?.[0]).toBe("1000 V");
  });

  it("ensureInferredElectricalAspects is idempotent", () => {
    const aspects: Record<string, string[]> = { Brand: ["DeWalt"] };
    ensureInferredElectricalAspects(
      aspects,
      "DeWalt EV Charger NACS to CCS1 Adapter",
    );
    expect(aspects.Voltage).toEqual(["1000 V"]);
    ensureInferredElectricalAspects(aspects, "120V");
    expect(aspects.Voltage).toEqual(["1000 V"]);
  });
});
