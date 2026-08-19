import { describe, expect, it } from "vitest";
import {
  formatEbayInches,
  parseDimensionTriplet,
  inferFurnitureDefaultDims,
  inferItemDimensionAspect,
  inferItemDimsFromText,
  ensureInferredDimensionAspects,
  realisticPackageDims,
} from "@/lib/ebay/infer-item-dimensions";
import {
  inferAspectValueFromText,
  parseMissingAspectFromEbayError,
} from "@/lib/ebay/infer-voltage";
import { listingToInventoryItem } from "@/lib/ebay/listing-to-inventory";
import { createEmptyListing } from "@/lib/demo/sample-listing";

describe("infer item dimensions (eBay 25002 Item Length)", () => {
  it("formats inches for eBay aspects", () => {
    expect(formatEbayInches(22)).toBe("22 in");
    expect(formatEbayInches(18.4)).toBe("18 in");
  });

  it("parses L×W×H from title/OCR", () => {
    expect(parseDimensionTriplet(`18" x 22" x 34"`)).toEqual({
      lengthIn: 18,
      widthIn: 22,
      heightIn: 34,
    });
    expect(parseDimensionTriplet("20 x 18 x 32 in")).toEqual({
      lengthIn: 20,
      widthIn: 18,
      heightIn: 32,
    });
  });

  it("uses patio folding-chair defaults when no numbers are present", () => {
    expect(
      inferFurnitureDefaultDims(
        "Black Metal Folding Patio Chair Patio Chairs Folding Chair",
      ),
    ).toEqual({ lengthIn: 22, widthIn: 18, heightIn: 34 });
    expect(
      inferItemDimensionAspect(
        "Item Length",
        "Black Metal Folding Patio Chair Patio Chairs",
      ),
    ).toBe("22 in");
  });

  it("ignores FORCE_MINI_PACKAGE 1×1×1", () => {
    expect(
      realisticPackageDims({ lengthIn: 1, widthIn: 1, depthIn: 1 }),
    ).toBeNull();
    expect(
      inferItemDimsFromText("Milwaukee M18 Drill", {
        lengthIn: 1,
        widthIn: 1,
        depthIn: 1,
      }),
    ).toBeNull();
  });

  it("uses realistic package dims when they are product-sized", () => {
    expect(
      inferItemDimsFromText("Generic product", {
        lengthIn: 24,
        widthIn: 18,
        depthIn: 16,
      }),
    ).toEqual({ lengthIn: 24, widthIn: 18, heightIn: 16 });
  });

  it("parses eBay 25002 missing Item Length", () => {
    expect(
      parseMissingAspectFromEbayError(
        "A user error has occurred. The item specific Item Length is missing. Add Item Length to this listing, enter a valid value, and then try again. [eBay 25002]",
      ),
    ).toBe("Item Length");
    expect(
      inferAspectValueFromText(
        "Item Length",
        "Black Metal Folding Patio Chair Patio Chairs",
      ),
    ).toBe("22 in");
  });

  it("fills Item Length/Width/Height on inventory aspects for patio chairs", () => {
    const listing = createEmptyListing();
    listing.title = "Black Metal Folding Patio Chair";
    listing.productType = "Folding Chair";
    listing.categoryId = "20521";
    listing.categoryName = "Patio Chairs";
    listing.price = 29;
    listing.sku = "TESTCHAIR1";
    listing.packageLengthIn = 1;
    listing.packageWidthIn = 1;
    listing.packageDepthIn = 1;

    const inventory = listingToInventoryItem(listing);
    expect(inventory.aspects["Item Length"]).toEqual(["22 in"]);
    expect(inventory.aspects["Item Width"]).toEqual(["18 in"]);
    expect(inventory.aspects["Item Height"]).toEqual(["34 in"]);
  });

  it("ensureInferredDimensionAspects is idempotent", () => {
    const aspects: Record<string, string[]> = {};
    const hay = "Black Metal Folding Patio Chair Patio Chairs";
    expect(ensureInferredDimensionAspects(aspects, hay)).toEqual([
      "Item Length",
      "Item Width",
      "Item Height",
    ]);
    expect(ensureInferredDimensionAspects(aspects, hay)).toEqual([]);
    expect(aspects["Item Length"]).toEqual(["22 in"]);
  });

  it("does not invent furniture dims for power tools", () => {
    expect(
      inferItemDimensionAspect(
        "Item Length",
        "Milwaukee M18 Compact Brushless Drill Power Tool Sets",
      ),
    ).toBeNull();
  });

  it("fills Item Width for bamboo drawer organizers", () => {
    const hay =
      "VAIKENE Bamboo Drawer Organizer Set with Adjustable Compartments";
    expect(inferFurnitureDefaultDims(hay)).toEqual({
      lengthIn: 18,
      widthIn: 13,
      heightIn: 2,
    });
    expect(inferItemDimensionAspect("Item Width", hay)).toBe("13 in");
    expect(inferAspectValueFromText("Item Width", hay)).toBe("13 in");
    expect(
      parseMissingAspectFromEbayError(
        "A user error has occurred. The item specific Item Width is missing. Add Item Width to this listing, enter a valid value, and then try again. [eBay 25002]",
      ),
    ).toBe("Item Width");

    const listing = createEmptyListing();
    listing.title = hay;
    listing.productType = "Drawer Organizer";
    listing.categoryName = "Kitchen Storage";
    listing.price = 19.99;
    listing.sku = "TESTORG001";
    listing.packageLengthIn = 1;
    listing.packageWidthIn = 1;
    listing.packageDepthIn = 1;
    const inventory = listingToInventoryItem(listing);
    expect(inventory.aspects["Item Length"]).toEqual(["18 in"]);
    expect(inventory.aspects["Item Width"]).toEqual(["13 in"]);
    expect(inventory.aspects["Item Height"]).toEqual(["2 in"]);
  });

  it("uses a short package height when length/width are product-sized", () => {
    expect(
      realisticPackageDims({ lengthIn: 18, widthIn: 13, depthIn: 2 }),
    ).toEqual({ lengthIn: 18, widthIn: 13, heightIn: 2 });
  });
});
