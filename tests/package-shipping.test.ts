import { describe, expect, it } from "vitest";
import {
  estimatePackageAndShipping,
  packageEstimateToCsvValues,
  parseProductDimensionsInches,
} from "@/lib/ebay/package-shipping";
import { isCategoryProductMismatch } from "@/lib/ebay/category-guard";
import { DEFAULT_VALUES } from "@/config/default-values";

describe("parseProductDimensionsInches", () => {
  it("parses LxWxH inches", () => {
    const dims = parseProductDimensionsInches("Matte Black 12 x 8 x 3 in fixture");
    expect(dims).not.toBeNull();
    expect(dims!.lengthIn).toBe(12);
    expect(dims!.widthIn).toBe(8);
    expect(dims!.depthIn).toBe(3);
  });

  it("parses diameter", () => {
    const dims = parseProductDimensionsInches('Flush Mount 14" diameter');
    expect(dims).not.toBeNull();
    expect(dims!.lengthIn).toBe(14);
    expect(dims!.widthIn).toBe(14);
  });
});

describe("estimatePackageAndShipping", () => {
  it("uses fluid ounces for bottled water weight", () => {
    const estimate = estimatePackageAndShipping({
      title: "Aquafina Purified Water Bottle 16.9 fl oz",
      productType: "Purified Water",
      size: "16.9 fl oz",
      brand: "Aquafina",
    });
    expect(estimate.totalOz).toBeGreaterThanOrEqual(17);
    expect(estimate.totalOz).toBeLessThanOrEqual(24);
    expect(estimate.shippingService).toBe("USPSGroundAdvantage");
    expect(estimate.shippingType).toBe("Calculated");
    expect(estimate.freeShipping).toBe(false);
    expect(estimate.shippingCost).toBeNull();
    expect(estimate.weightLbs + estimate.weightOz / 16).toBeGreaterThan(1);
  });

  it("sizes vacuum boxes tighter than oversized defaults", () => {
    const estimate = estimatePackageAndShipping({
      title: "Shark Robot Vacuum",
      productType: "Robot Vacuum",
      categoryName: "Vacuum Cleaners",
      brand: "Shark",
    });
    expect(estimate.weightLbs).toBeLessThanOrEqual(12);
    expect(estimate.lengthIn).toBeLessThanOrEqual(20);
    expect(estimate.widthIn).toBeLessThanOrEqual(16);
    expect(estimate.shippingService).toBe("USPSGroundAdvantage");
    expect(estimate.freeShipping).toBe(false);
  });

  it("builds a tight box from product LxWxH", () => {
    const estimate = estimatePackageAndShipping({
      title: "Ceiling Light",
      size: "10 x 10 x 4 in",
      productType: "Flush Mount",
      categoryName: "Lighting",
    });
    // 10×10×4 + 0.75 pad → ~11×11×5
    expect(estimate.lengthIn).toBeLessThanOrEqual(12);
    expect(estimate.widthIn).toBeLessThanOrEqual(12);
    expect(estimate.depthIn).toBeLessThanOrEqual(6);
    expect(estimate.shippingType).toBe("Calculated");
  });

  it("emits File Exchange / Seller Hub aliases without flat cost", () => {
    const estimate = estimatePackageAndShipping({
      title: "Aquafina Purified Water",
      size: "16.9 fl oz",
    });
    const values = packageEstimateToCsvValues(estimate);
    expect(values.WeightMajor).toBe(String(estimate.weightLbs));
    expect(values.WeightMinor).toBe(String(estimate.weightOz));
    expect(values.WeightUnit).toBe("lbs");
    expect(values["Shipping service 1 option"]).toBe("USPSGroundAdvantage");
    expect(values["Shipping service 1 priority"]).toBe("1");
    expect(values.ShippingType).toBe("Calculated");
    expect(values["Shipping service 1 cost"]).toBeUndefined();
    expect(values.PackageType).toBeTruthy();
  });
});

describe("category guard + warehouse defaults", () => {
  it("flags fishing for aquafina", () => {
    expect(
      isCategoryProductMismatch({
        categoryId: "179985",
        categoryName: "Fishing Equipment",
        title: "Aquafina Purified Water Bottle 16.9 fl oz",
        brand: "Aquafina",
        productType: "Purified Water",
      }),
    ).toBe(true);
  });

  it("defaults warehouse to Logansport IN 46947", () => {
    expect(DEFAULT_VALUES.itemLocation).toBe("Logansport, IN");
    expect(DEFAULT_VALUES.postalCode).toBe("46947");
  });
});
