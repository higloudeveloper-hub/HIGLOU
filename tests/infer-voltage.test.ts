import { describe, expect, it } from "vitest";
import {
  formatEbayVoltage,
  inferVoltageFromText,
  inferBatteryTechnologyFromText,
  inferCompatibleAspect,
  inferModelAspect,
  inferFragranceName,
  inferAspectValueFromText,
  parseMissingAspectFromEbayError,
  humanizeEbayPublishError,
  ensureInferredElectricalAspects,
  ensureCompatibleAspects,
  ensureRequiredCategoryAspects,
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

describe("compatible aspects (eBay 25002 Compatible Model)", () => {
  it("parses Compatible Model from eBay 25002 text", () => {
    expect(
      parseMissingAspectFromEbayError(
        "A user error has occurred. The item specific Compatible Model is missing. Add Compatible Model to this listing, enter a valid value, and then try again.",
      ),
    ).toBe("Compatible Model");
  });

  it("uses Does Not Apply for a finished kettle", () => {
    expect(
      inferCompatibleAspect("Compatible Model", {
        title: "Pinky Up Noelle Ceramic Electric Tea Kettle 50 oz",
        brand: "Pinky Up",
        model: "Noelle",
        productType: "Electric Kettle",
      }),
    ).toBe("Does Not Apply");
  });

  it("uses the model for replacement parts", () => {
    expect(
      inferCompatibleAspect("Compatible Model", {
        title: "Replacement filter for Noelle kettle",
        brand: "Pinky Up",
        model: "Noelle",
        productType: "Filter",
      }),
    ).toBe("Noelle");
  });

  it("fills required Compatible Model before Inventory PUT", () => {
    const aspects: Record<string, string[]> = { Brand: ["Pinky Up"] };
    ensureCompatibleAspects(aspects, ["Compatible Model", "Color"], {
      title: "Pinky Up Noelle Ceramic Electric Tea Kettle",
      brand: "Pinky Up",
      model: "Noelle",
      productType: "Electric Kettle",
    });
    expect(aspects["Compatible Model"]).toEqual(["Does Not Apply"]);
    expect(aspects.Color).toBeUndefined();
  });

  it("humanizes the 25002 Compatible Model error", () => {
    const msg = humanizeEbayPublishError(
      "A user error has occurred. The item specific Compatible Model is missing. Add Compatible Model to this listing.",
    );
    expect(msg.headline).toContain("Compatible Model");
    expect(msg.detail.toLowerCase()).toContain("try again");
  });
});

describe("Model aspect (eBay 25002 Model)", () => {
  it("parses Model from eBay 25002 text", () => {
    expect(
      parseMissingAspectFromEbayError(
        "A user error has occurred. The item specific Model is missing. Add Model to this listing, enter a valid value, and then try again. [eBay 25002]",
      ),
    ).toBe("Model");
  });

  it("uses Does Not Apply for a kettle with no model number", () => {
    expect(
      inferModelAspect({
        title: "Pinky Up Electric Ceramic Kettle with Gooseneck Spout",
        brand: "Pinky Up",
      }),
    ).toBe("Does Not Apply");
  });

  it("keeps an explicit model like Noelle", () => {
    expect(
      inferModelAspect({
        title: "Pinky Up Noelle Ceramic Electric Tea Kettle",
        brand: "Pinky Up",
        model: "Noelle",
      }),
    ).toBe("Noelle");
  });

  it("fills Model on 25002 retry inference", () => {
    expect(
      inferAspectValueFromText(
        "Model",
        "Pinky Up Electric Ceramic Kettle with Gooseneck Spout",
        { brand: "Pinky Up" },
      ),
    ).toBe("Does Not Apply");
  });

  it("fills required Model before Inventory PUT", () => {
    const aspects: Record<string, string[]> = { Brand: ["Pinky Up"] };
    ensureRequiredCategoryAspects(aspects, ["Model", "Color"], {
      title: "Pinky Up Electric Ceramic Kettle with Gooseneck Spout",
      brand: "Pinky Up",
      productType: "Electric Kettle",
    });
    expect(aspects.Model).toEqual(["Does Not Apply"]);
  });

  it("puts Model on the inventory item even when the listing has none", () => {
    const listing = createEmptyListing();
    listing.title = "Pinky Up Electric Ceramic Kettle with Gooseneck Spout";
    listing.brand = "Pinky Up";
    listing.model = "";
    listing.categoryId = "20681";
    listing.categoryName = "Electric Kettles";
    const item = listingToInventoryItem(listing);
    expect(item.aspects?.Model?.[0]).toBeTruthy();
  });
});

describe("Fragrance Name aspect (eBay 25002 Fragrance Name)", () => {
  it("parses Fragrance Name from eBay 25002 text", () => {
    expect(
      parseMissingAspectFromEbayError(
        "A user error has occurred. The item specific Fragrance Name is missing. Add Fragrance Name to this listing, enter a valid value, and then try again. [eBay 25002]",
      ),
    ).toBe("Fragrance Name");
  });

  it("pulls the scent line from a perfume title", () => {
    expect(
      inferFragranceName({
        title: "Valentine Nero Women Eau de Parfum 100ml",
      }),
    ).toBe("Valentine Nero");
  });

  it("strips the brand prefix from the title", () => {
    expect(
      inferFragranceName({
        title: "URBAN COLLECTION Valentine Nero Women Eau de Parfum 100ml",
        brand: "URBAN COLLECTION",
      }),
    ).toBe("Valentine Nero");
  });

  it("fills Fragrance Name on 25002 retry inference", () => {
    expect(
      inferAspectValueFromText(
        "Fragrance Name",
        "Valentine Nero Women Eau de Parfum 100ml",
        { title: "Valentine Nero Women Eau de Parfum 100ml" },
      ),
    ).toBe("Valentine Nero");
  });

  it("fills required Fragrance Name before Inventory PUT", () => {
    const aspects: Record<string, string[]> = { Brand: ["URBAN COLLECTION"] };
    ensureRequiredCategoryAspects(aspects, ["Fragrance Name", "Brand"], {
      title: "Valentine Nero Women Eau de Parfum 100ml",
      brand: "URBAN COLLECTION",
    });
    expect(aspects["Fragrance Name"]).toEqual(["Valentine Nero"]);
  });

  it("uses Does Not Apply when the title has no scent line", () => {
    expect(inferFragranceName({ title: "", brand: "" })).toBe("Does Not Apply");
  });
});

describe("Department aspect (eBay 25002 Department)", () => {
  it("parses Department from eBay 25002 text", () => {
    expect(
      parseMissingAspectFromEbayError(
        "A user error has occurred. The item specific Department is missing. Add Department to this listing, enter a valid value, and then try again. [eBay 25002]",
      ),
    ).toBe("Department");
  });

  it("uses Unisex Adults for an RFID wallet", () => {
    expect(
      inferAspectValueFromText(
        "Department",
        "Green RFID Blocking Wallet with Keychain",
        { title: "Green RFID Blocking Wallet with Keychain" },
      ),
    ).toBe("Unisex Adults");
  });

  it("uses Women when the title says ladies", () => {
    expect(
      inferAspectValueFromText("Department", "Ladies Leather Wallet", {
        title: "Ladies Leather Wallet",
      }),
    ).toBe("Women");
  });

  it("ignores Higlou store departments like Beauty", () => {
    expect(
      inferAspectValueFromText("Department", "Green RFID Blocking Wallet", {
        title: "Green RFID Blocking Wallet",
        department: "Health & Beauty",
      }),
    ).toBe("Unisex Adults");
  });

  it("fills required Department before Inventory PUT", () => {
    const aspects: Record<string, string[]> = { Brand: ["Unbranded"] };
    ensureRequiredCategoryAspects(aspects, ["Department", "Color"], {
      title: "Green RFID Blocking Wallet with Keychain",
      productType: "Wallet",
    });
    expect(aspects.Department).toEqual(["Unisex Adults"]);
  });
});
