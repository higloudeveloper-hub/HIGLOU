import { describe, expect, it } from "vitest";
import {
  FORCE_MINI_PACKAGE,
  MINI_PACKAGE,
  estimatePackageAndShipping,
  parseShippingWeightFromText,
  resolveListingPackage,
  packageEstimateToCsvValues,
  parseProductDimensionsInches,
  seedPackageOnListing,
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
  it("TEMP: forces mini package 1 lb 1 oz / 1×1×1 while FORCE_MINI_PACKAGE is on", () => {
    expect(FORCE_MINI_PACKAGE).toBe(true);
    const estimate = estimatePackageAndShipping({
      title: "Everbilt 1/6 HP Submersible Utility Pump",
      categoryName: "Water Pumps",
    });
    expect(estimate.weightLbs).toBe(MINI_PACKAGE.weightLbs);
    expect(estimate.weightOz).toBe(MINI_PACKAGE.weightOz);
    expect(estimate.lengthIn).toBe(MINI_PACKAGE.lengthIn);
    expect(estimate.widthIn).toBe(MINI_PACKAGE.widthIn);
    expect(estimate.depthIn).toBe(MINI_PACKAGE.depthIn);
    expect(estimate.shippingService).toBe("USPSGroundAdvantage");
    expect(estimate.freeShipping).toBe(false);
    expect(estimate.shippingCost).toBeGreaterThan(0);
  });

  it("TEMP: ignores saved large boxes when mini force is on", () => {
    const pkg = resolveListingPackage({
      title: "Everbilt 1/6 HP Submersible Utility Pump",
      categoryName: "Water Pumps",
      packageWeightLbs: 12,
      packageWeightOz: 4,
      packageLengthIn: 15,
      packageWidthIn: 11,
      packageDepthIn: 9,
      packageSource: "manual",
    });
    expect(pkg.lengthIn).toBe(1);
    expect(pkg.widthIn).toBe(1);
    expect(pkg.depthIn).toBe(1);
    expect(pkg.weightLbs).toBe(1);
    expect(pkg.weightOz).toBe(1);
  });

  it("TEMP: seedPackageOnListing always writes mini box", () => {
    const seeded = seedPackageOnListing({
      title: "Shark Robot Vacuum",
      packageSource: "manual" as const,
      packageWeightLbs: 20,
      packageWeightOz: 0,
      packageLengthIn: 24,
      packageWidthIn: 18,
      packageDepthIn: 12,
    });
    expect(seeded.packageLengthIn).toBe(1);
    expect(seeded.packageWidthIn).toBe(1);
    expect(seeded.packageDepthIn).toBe(1);
    expect(seeded.packageWeightLbs).toBe(1);
    expect(seeded.packageWeightOz).toBe(1);
  });

  it("emits File Exchange / Seller Hub aliases with buyer-paid cost", () => {
    const estimate = estimatePackageAndShipping({
      title: "Aquafina Purified Water",
      size: "16.9 fl oz",
    });
    const values = packageEstimateToCsvValues(estimate);
    expect(values.WeightMajor).toBe("1");
    expect(values.WeightMinor).toBe("1");
    expect(values.PackageLength).toBe("1");
    expect(values.PackageWidth).toBe("1");
    expect(values.PackageDepth).toBe("1");
    expect(values.WeightUnit).toBe("lbs");
    expect(values["Shipping service 1 option"]).toBe("USPSGroundAdvantage");
    expect(values.ShippingType).toBe("Flat");
  });

  it("parses labeled shipping weight from packaging text", () => {
    const labeled = parseShippingWeightFromText(
      "Everbilt Utility Pump Net Wt 11.2 lb Made in China",
    );
    expect(labeled).not.toBeNull();
    expect(labeled!.totalOz).toBeGreaterThan(160);
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

  it("keeps warehouse defaults available", () => {
    expect(DEFAULT_VALUES.postalCode).toBeTruthy();
  });
});
