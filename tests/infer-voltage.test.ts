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
  inferSizeTypeFromText,
  inferFilledAspectForEbayError,
  inferVolumeFromText,
  normalizeEbayBrand,
  nextEbayVolumeValue,
  resolveEbayBrandForCategory,
  resolveEbayVolume,
  coerceSelectionAspects,
  ensureInferredFragranceAspects,
  resolveEbayBrand,
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

  it("humanizes eBay 25013 too many trait values", () => {
    const msg = humanizeEbayPublishError(
      "Invalid data in the Inventory Item Group. Too many trait values in variation specifics of the variation [ebay 25013]",
    );
    expect(msg.headline.toLowerCase()).toContain("too many");
    expect(msg.detail.toLowerCase()).toContain("try again");
  });

  it("humanizes eBay 25002 Scent is not a variation specific", () => {
    const msg = humanizeEbayPublishError(
      "A user error has occurred. Scent is not allowed as a variation specific. [ebay 25002]",
    );
    expect(msg.headline.toLowerCase()).toContain("color");
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

describe("Volume aspect (eBay 25002 Volume)", () => {
  it("maps 100ml perfume bottles to 3.4 fl. oz.", () => {
    expect(inferVolumeFromText("Lattafa Yara Candy 100ml Eau de Parfum")).toBe(
      "3.4 fl. oz.",
    );
    expect(inferVolumeFromText("3.4 Fl Oz Eau de Parfum")).toBe("3.4 fl. oz.");
  });

  it("maps inferred sizes onto eBay's closed Volume list including dotted fl. oz.", () => {
    expect(
      resolveEbayVolume("3.4 oz", ["3.4 fl. oz.", "1.7 fl. oz."]),
    ).toBe("3.4 fl. oz.");
    expect(resolveEbayVolume("100 ml", ["3.4 fl. oz.", "1.7 fl. oz."])).toBe(
      "3.4 fl. oz.",
    );
    expect(resolveEbayVolume("3.4 fl oz")).toBe("3.4 fl. oz.");
    expect(nextEbayVolumeValue("3.4 fl. oz.")).toBe("3.4 fl oz");
    expect(resolveEbayVolume("3.4 fl oz", ["3.4", "1.7"])).toBe("3.4");
  });

  it("overwrites Does Not Apply Volume on perfume", () => {
    const aspects: Record<string, string[]> = { Volume: ["Does Not Apply"] };
    ensureInferredFragranceAspects(aspects, {
      title: "Yara Candy Eau de Parfum by Lattafa",
      productType: "Eau de Parfum",
    });
    expect(aspects.Volume).toEqual(["3.4 fl. oz."]);
  });

  it("fills Volume on a perfume with no size in the title", () => {
    const listing = createEmptyListing();
    listing.title =
      "Yara Candy Eau de Parfum by Lattafa - Amber Fruity Vanilla Fragrance for Women";
    listing.brand = "Lattafa";
    listing.categoryId = "11838";
    listing.categoryName = "Fragrances";
    listing.productType = "Eau de Parfum";
    const item = listingToInventoryItem(listing);
    expect(item.aspects?.Volume?.[0]).toBe("3.4 fl. oz.");
    expect(
      inferFilledAspectForEbayError(
        "Volume",
        listing.title,
        { title: listing.title, productType: "Eau de Parfum" },
      ),
    ).toBe("3.4 fl. oz.");
  });

  it("does not invent Volume for underwear", () => {
    const listing = createEmptyListing();
    listing.title = "Women's High Waist Cotton Underwear - 6 Pack";
    listing.categoryName = "Panties";
    listing.productType = "Underwear";
    const item = listingToInventoryItem(listing);
    expect(item.aspects?.Volume).toBeUndefined();
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

describe("Size Type aspect (eBay 25002 Size Type)", () => {
  it("parses Size Type from eBay 25002 text", () => {
    expect(
      parseMissingAspectFromEbayError(
        "A user error has occurred. The item specific Size Type is missing. Add Size Type to this listing, enter a valid value, and then try again. [eBay 25002]",
      ),
    ).toBe("Size Type");
  });

  it("uses Regular for a women's strapless tube top", () => {
    expect(inferSizeTypeFromText("Women's Black Strapless Tube Top")).toBe(
      "Regular",
    );
    expect(
      inferAspectValueFromText(
        "Size Type",
        "Trendy Queen Women's Strapless Bandeau Crop Top",
        { title: "Women's Black Strapless Tube Top" },
      ),
    ).toBe("Regular");
  });

  it("uses Plus / Petite when the title says so", () => {
    expect(inferSizeTypeFromText("Women's Plus Size Crop Top 3X-Large")).toBe(
      "Plus",
    );
    expect(inferSizeTypeFromText("Women's Petite Bandeau Tank")).toBe("Petite");
  });

  it("keeps One Size for wallet Size, Regular for wallet Size Type", () => {
    expect(
      inferAspectValueFromText("Size", "Green RFID Blocking Wallet", {
        title: "Green RFID Blocking Wallet",
      }),
    ).toBe("One Size");
    expect(
      inferAspectValueFromText("Size Type", "Green RFID Blocking Wallet", {
        title: "Green RFID Blocking Wallet",
      }),
    ).toBe("Regular");
  });

  it("fills Size Type before Inventory PUT even if taxonomy omitted it", () => {
    const aspects: Record<string, string[]> = { Brand: ["Trendy Queen"] };
    ensureRequiredCategoryAspects(aspects, ["Color"], {
      title: "Women's Black Strapless Tube Top",
      productType: "Tube Top",
      categoryName: "Women's Tops & Blouses",
      categoryId: "53159",
    });
    expect(aspects["Size Type"]).toEqual(["Regular"]);
    expect(aspects.Department).toEqual(["Women"]);
  });

  it("fills Department on women's underwear even when Size Type is already set", () => {
    const listing = createEmptyListing();
    listing.title = "Women's High Waist Cotton Underwear - 6 Pack";
    listing.brand = "";
    listing.categoryId = "11554";
    listing.categoryName = "Panties";
    listing.productType = "Underwear";
    listing.department = "Women's Clothing";
    const item = listingToInventoryItem(listing);
    expect(item.aspects?.["Size Type"]?.[0]).toBe("Regular");
    expect(item.aspects?.Department?.[0]).toBe("Women");
  });

  it("puts Size Type on the inventory item for women's tops", () => {
    const listing = createEmptyListing();
    listing.title = "Women's Black Strapless Tube Top";
    listing.brand = "Trendy Queen";
    listing.categoryId = "53159";
    listing.categoryName = "Women's Tops & Blouses";
    listing.productType = "Tube Top";
    const item = listingToInventoryItem(listing);
    expect(item.aspects?.["Size Type"]?.[0]).toBe("Regular");
  });

  it("does not invent Size Type for kettles", () => {
    const aspects: Record<string, string[]> = { Brand: ["Pinky Up"] };
    ensureRequiredCategoryAspects(aspects, ["Model"], {
      title: "Pinky Up Electric Ceramic Kettle with Gooseneck Spout",
      categoryName: "Electric Kettles",
      categoryId: "20681",
    });
    expect(aspects["Size Type"]).toBeUndefined();
  });
});

describe("Brand aspect (eBay 25002 Brand)", () => {
  it("parses Brand from eBay 25002 text", () => {
    expect(
      parseMissingAspectFromEbayError(
        "A user error has occurred. The item specific Brand is missing. Add Brand to this listing, enter a valid value, and then try again. 2=Brand] [ebay 25002]",
      ),
    ).toBe("Brand");
  });

  it("uses Unbranded when Amazon has no maker", () => {
    expect(normalizeEbayBrand("")).toBe("Unbranded");
    expect(normalizeEbayBrand("Does Not Apply")).toBe("Unbranded");
    expect(normalizeEbayBrand("N/A")).toBe("Unbranded");
    expect(inferAspectValueFromText("Brand", "Women's Floral Ruffle Sleeve Blouse")).toBe(
      "Unbranded",
    );
    expect(
      inferFilledAspectForEbayError("Brand", "Women's Floral Ruffle Sleeve Blouse"),
    ).toBe("Unbranded");
    expect(
      inferFilledAspectForEbayError(
        "Brand",
        "Women's High Waist Cotton Underwear - 6 Pack",
        {
          brand: "UNDER THE SEA",
          title: "Women's High Waist Cotton Underwear - 6 Pack",
        },
      ),
    ).toBe("Unbranded");
  });

  it("uses Unbranded for women's underwear with no Amazon maker", () => {
    const listing = createEmptyListing();
    listing.title = "Women's High Waist Cotton Underwear - 6 Pack";
    listing.brand = "";
    listing.categoryId = "11554";
    listing.categoryName = "Panties";
    listing.productType = "Underwear";
    const item = listingToInventoryItem(listing);
    expect(item.brand).toBe("Unbranded");
    expect(item.aspects?.Brand?.[0]).toBe("Unbranded");
  });

  it("uses Lattafa from a perfume byline instead of the scent name", () => {
    expect(
      resolveEbayBrand({
        brand: "Yara Candy",
        title:
          "Yara Candy Eau de Parfum by Lattafa - Amber Fruity Vanilla Fragrance for Women",
      }),
    ).toBe("Lattafa");
    const listing = createEmptyListing();
    listing.title =
      "Yara Candy Eau de Parfum by Lattafa - Amber Fruity Vanilla Fragrance for Women";
    listing.brand = "Yara Candy";
    listing.categoryId = "11854";
    listing.categoryName = "Fragrances";
    listing.productType = "Eau de Parfum";
    const item = listingToInventoryItem(listing);
    expect(item.brand).toBe("Lattafa");
    expect(item.aspects?.Brand?.[0]).toBe("Lattafa");
  });

  it("keeps a real Amazon brand", () => {
    expect(normalizeEbayBrand("ASTRID")).toBe("ASTRID");
    expect(
      inferAspectValueFromText("Brand", "ASTRID Women's Floral Blouse", {
        brand: "ASTRID",
      }),
    ).toBe("ASTRID");
  });

  it("maps boutique shaver brands onto Unbranded when eBay has no Wuudl", () => {
    expect(
      resolveEbayBrandForCategory({
        brand: "Wuudl",
        title: "Wuudl Double Head Electric Shaver for Women - Pink",
        allowed: ["Braun", "Philips", "Remington", "Unbranded"],
      }),
    ).toBe("Unbranded");
    expect(
      resolveEbayBrandForCategory({
        brand: "Unbranded",
        title: "Wuudl Double Head Electric Shaver for Women - Pink",
      }),
    ).toBe("Unbranded");
    const aspects: Record<string, string[]> = { Brand: ["Wuudl"] };
    coerceSelectionAspects(
      aspects,
      new Map([["brand", ["Braun", "Philips", "Unbranded"]]]),
      {
        title: "Wuudl Double Head Electric Shaver for Women - Pink",
        brand: "Wuudl",
      },
    );
    expect(aspects.Brand).toEqual(["Unbranded"]);
    expect(
      inferFilledAspectForEbayError(
        "Brand",
        "Wuudl Double Head Electric Shaver for Women - Pink",
        {
          brand: "Wuudl",
          title: "Wuudl Double Head Electric Shaver for Women - Pink",
        },
      ),
    ).toBe("Unbranded");
  });

  it("replaces Does Not Apply Brand before Inventory PUT", () => {
    const aspects: Record<string, string[]> = { Brand: ["Does Not Apply"] };
    ensureRequiredCategoryAspects(aspects, ["Brand"], {
      title: "Women's Floral Ruffle Sleeve Blouse",
      productType: "Blouse",
      categoryName: "Women's Tops & Blouses",
      categoryId: "53159",
    });
    expect(aspects.Brand).toEqual(["Unbranded"]);
  });

  it("puts Unbranded on a blouse with no Amazon brand", () => {
    const listing = createEmptyListing();
    listing.title = "Women's Floral Ruffle Sleeve Blouse";
    listing.brand = "";
    listing.categoryId = "53159";
    listing.categoryName = "Women's Tops & Blouses";
    listing.productType = "Blouse";
    listing.itemSpecifics = [{ key: "C:Brand", value: "Does Not Apply", label: "Brand" }];
    const item = listingToInventoryItem(listing);
    expect(item.brand).toBe("Unbranded");
    expect(item.aspects?.Brand?.[0]).toBe("Unbranded");
  });
});
