import { describe, expect, it } from "vitest";
import {
  formatEbayVoltage,
  inferVoltageFromText,
  inferBatteryTechnologyFromText,
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

  it("reads Milwaukee M18 / M12 platform names as voltage", () => {
    expect(
      inferVoltageFromText(
        "Milwaukee M18 Compact Brushless Drill and Impact Driver Kit Power Tool Sets",
      ),
    ).toBe("18 V");
    expect(
      inferVoltageFromText("Milwaukee M12 Fuel Installation Drill Driver"),
    ).toBe("12 V");
  });

  it("adds Voltage onto inventory aspects for Milwaukee M18 kits", () => {
    const listing = createEmptyListing();
    listing.title = "Milwaukee M18 Compact Brushless Drill and Impact Driver Kit";
    listing.brand = "Milwaukee";
    listing.categoryId = "63176";
    listing.categoryName = "Power Tool Sets";
    listing.price = 210;
    listing.sku = "TESTM18KIT";
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
    expect(inv.aspects.Voltage?.[0]).toBe("18 V");
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
    expect(
      parseMissingAspectFromEbayError(
        "A user error has occurred. The item specific Battery Technology is missing. Add Battery Technology to this listing [eBay 25002]",
      ),
    ).toBe("Battery Technology");
  });

  it("infers Battery Technology for Ryobi lithium packs", () => {
    expect(
      inferBatteryTechnologyFromText(
        "Ryobi 18V Lithium Battery and Charger Kit Power Tool Batteries & Chargers",
      ),
    ).toBe("Lithium-Ion (Li-Ion)");
  });

  it("adds Battery Technology onto inventory aspects for tool batteries", () => {
    const listing = createEmptyListing();
    listing.title = "Ryobi 18V Lithium Battery and Charger Kit";
    listing.brand = "Ryobi";
    listing.categoryId = "42284";
    listing.categoryName = "Power Tool Batteries & Chargers";
    listing.price = 66;
    listing.sku = "TESTBAT1";
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
    expect(inv.aspects["Battery Technology"]?.[0]).toBe("Lithium-Ion (Li-Ion)");
    expect(inv.aspects.Voltage?.[0]).toBe("18 V");
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
