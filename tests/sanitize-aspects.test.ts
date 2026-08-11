import { describe, expect, it } from "vitest";
import { createEmptyListing } from "@/lib/demo/sample-listing";
import { listingToEbayAspects } from "@/lib/ebay/listing-to-inventory";
import {
  defaultCardinalityForAspect,
  sanitizeEbayAspects,
} from "@/lib/ebay/sanitize-aspects";

describe("sanitizeEbayAspects", () => {
  it("forces Color to a single value", () => {
    const aspects = sanitizeEbayAspects({
      Color: ["Matte Black", "Brown"],
      Material: ["Metal", "Rattan"],
      Features: ["Pull-Down", "Two Handle", "LED"],
    });
    expect(aspects.Color).toEqual(["Matte Black"]);
    expect(aspects.Material).toEqual(["Metal"]);
    expect(aspects.Features).toEqual(["Pull-Down", "Two Handle", "LED"]);
  });

  it("splits pipe/comma Color strings into one value", () => {
    const aspects = sanitizeEbayAspects({
      Color: ["Matte Black | Brown"],
    });
    expect(aspects.Color).toEqual(["Matte Black"]);
  });

  it("honors Taxonomy MULTI cardinality override", () => {
    const map = new Map<string, "SINGLE" | "MULTI">([["color", "MULTI"]]);
    const aspects = sanitizeEbayAspects(
      { Color: ["Matte Black", "Brown"] },
      map,
    );
    expect(aspects.Color).toEqual(["Matte Black", "Brown"]);
  });

  it("listingToEbayAspects collapses multi colors", () => {
    const listing = createEmptyListing();
    listing.brand = "Hampton Bay";
    listing.mpn = "1008 481 828";
    listing.colors = ["Matte Black", "Brown"];
    listing.materials = ["Metal", "Rattan"];
    listing.categoryId = "117503";
    listing.itemSpecifics = [
      { key: "C:Color", label: "Color", value: "Matte Black | Brown" },
      { key: "C:Material", label: "Material", value: "Metal | Rattan" },
    ];
    const aspects = listingToEbayAspects(listing);
    expect(aspects.Color).toEqual(["Matte Black"]);
    expect(aspects.Material).toEqual(["Metal"]);
    expect(defaultCardinalityForAspect("Color")).toBe("SINGLE");
  });
});
