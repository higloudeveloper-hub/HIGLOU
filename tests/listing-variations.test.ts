import { describe, expect, it } from "vitest";
import {
  applyVariantSelection,
  decodeVariationsSet,
  encodeVariationsSpecific,
  selectedVariationSet,
  variationSummary,
  withEncodedVariations,
} from "@/lib/listing/variations";

const set = {
  axisNames: ["Color", "Size"],
  variants: [
    {
      asin: "B0BLACKMED",
      sku: "AMZ-B0BLACKMED",
      aspects: { Color: "Black", Size: "M" },
      imageUrls: ["https://m.media-amazon.com/images/I/71aaa.jpg"],
      selected: true,
    },
    {
      asin: "B0WHITELRG",
      sku: "AMZ-B0WHITELRG",
      aspects: { Color: "White", Size: "L" },
      imageUrls: [],
      selected: true,
    },
    {
      asin: "B0RED00XLG",
      sku: "AMZ-B0RED00XLG",
      aspects: { Color: "Red", Size: "XL" },
      imageUrls: [],
      selected: false,
    },
  ],
};

describe("variation selection", () => {
  it("keeps unselected Amazon options in the blob", () => {
    const field = encodeVariationsSpecific(set);
    const decoded = decodeVariationsSet(field.value);
    expect(decoded?.variants).toHaveLength(3);
    expect(decoded?.variants.find((row) => row.asin === "B0RED00XLG")?.selected).toBe(
      false,
    );
  });

  it("publishes only selected options", () => {
    const selected = selectedVariationSet(set);
    expect(selected?.variants.map((row) => row.asin)).toEqual([
      "B0BLACKMED",
      "B0WHITELRG",
    ]);
  });

  it("applies a seller asin checklist", () => {
    const next = applyVariantSelection(set, ["B0RED00XLG", "b0blackmed"]);
    expect(next.variants.filter((row) => row.selected).map((row) => row.asin)).toEqual(
      ["B0BLACKMED", "B0RED00XLG"],
    );
  });

  it("summarizes a partial store selection", () => {
    expect(variationSummary(set)).toMatch(/2 of 3 for your store/);
  });

  it("still encodes the full Amazon set when only one option is checked", () => {
    const one = applyVariantSelection(set, ["B0BLACKMED"]);
    const specifics = withEncodedVariations([], one);
    const decoded = decodeVariationsSet(specifics[0]!.value);
    expect(decoded?.variants).toHaveLength(3);
    expect(decoded?.variants.filter((row) => row.selected)).toHaveLength(1);
  });
});
