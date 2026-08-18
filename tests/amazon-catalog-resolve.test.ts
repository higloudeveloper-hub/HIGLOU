import { describe, expect, it } from "vitest";
import { listingModelMatchesHit } from "@/lib/amazon/catalog-match";
import {
  amazonCatalogFactTexts,
  barcodeSearchKeys,
  enrichHitWithCatalog,
} from "@/lib/amazon/catalog-resolve";

describe("Amazon exact catalog resolve", () => {
  it("tries UPC and EAN variants of a Home Depot barcode", () => {
    expect(barcodeSearchKeys("033187174264")).toEqual([
      { identifier: "033187174264", identifierType: "UPC" },
      { identifier: "0033187174264", identifierType: "EAN" },
    ]);
  });

  it("reads Amazon model_number facts including hashed Ryobi codes", () => {
    expect(
      amazonCatalogFactTexts({
        brand: [{ value: "RYOBI" }],
        model_number: [{ value: "#P241" }],
        part_number: [{ value: "P241" }],
      }),
    ).toEqual(expect.arrayContaining(["RYOBI", "#P241", "P241"]));
  });

  it("enriches a vague Amazon title with catalog model facts", () => {
    const hit = enrichHitWithCatalog(
      {
        asin: "B008E76BZ4",
        title: "ONEAND 18V Cordless 3/8 in. Right Angle Drill Tool-ONLY",
      },
      {
        asin: "B008E76BZ4",
        title: "ONEAND 18V Cordless 3/8 in. Right Angle Drill Tool-ONLY",
        productType: "DRILL",
        images: [],
        attributes: {
          brand: [{ value: "RYOBI" }],
          model_number: [{ value: "#P241" }],
        },
      },
    );
    expect(
      listingModelMatchesHit(hit, {
        brand: "Ryobi",
        model: "P241",
        title: "Ryobi ONE+ 18V Cordless Right Angle Drill - Tool Only",
      }),
    ).toBe(true);
    expect(
      listingModelMatchesHit(
        {
          asin: "B08XF7BWQ4",
          title: "RYOBI ONE+ HP 18V Brushless Compact Right Angle Drill",
          identifiers: ["PSBRA02B"],
        },
        {
          brand: "Ryobi",
          model: "P241",
          title: "Ryobi ONE+ 18V Cordless Right Angle Drill - Tool Only",
        },
      ),
    ).toBe(false);
  });

  it("treats RTH2CWF-N and RTH2CWF as the same Honeywell model", () => {
    expect(
      listingModelMatchesHit(
        {
          asin: "B0DSGCDMPT",
          title: "Honeywell Home X2S Smart Wi-Fi Thermostat, Gray",
          identifiers: ["RTH2CWF"],
        },
        { brand: "Honeywell", model: "RTH2CWF-N", title: "Honeywell Home RTH2CWF-N" },
      ),
    ).toBe(true);
  });
});
