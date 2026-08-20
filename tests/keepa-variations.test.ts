import { describe, expect, it } from "vitest";
import { parseKeepaVariations } from "@/lib/keepa/variations";

describe("parseKeepaVariations", () => {
  it("maps Keepa child ASINs to Color options", () => {
    const set = parseKeepaVariations({
      asin: "B0173HB5K0",
      variations: [
        {
          asin: "B0173HB5K0",
          attributes: [{ dimension: "Color", value: "Bamboo 11 Pack" }],
        },
        {
          asin: "B0ROSE8PK0",
          attributes: [{ dimension: "Color", value: "Rose Gold 8 Pack" }],
        },
      ],
    });
    expect(set?.axisNames).toEqual(["Color"]);
    expect(set?.variants).toHaveLength(2);
    expect(
      set?.variants.find((row) => row.asin === "B0173HB5K0")?.aspects.Color,
    ).toBe("Bamboo 11 Pack");
  });

  it("keeps the Keepa child photo so eBay can show each option", () => {
    const set = parseKeepaVariations({
      variations: [
        {
          asin: "B0173HB5K0",
          image: "71BAMBOO.jpg",
          attributes: [{ dimension: "Color", value: "Bamboo 11 Pack" }],
        },
        {
          asin: "B0ROSE8PK0",
          image: "71ROSEGOLD.jpg",
          attributes: [{ dimension: "Color", value: "Rose Gold 8 Pack" }],
        },
      ],
    });
    expect(
      set?.variants.find((row) => row.asin === "B0173HB5K0")?.imageUrls[0],
    ).toMatch(/71BAMBOO/);
  });

  it("returns null when Keepa only has one child", () => {
    expect(
      parseKeepaVariations({
        variations: [
          {
            asin: "B0173HB5K0",
            attributes: [{ dimension: "Color", value: "Bamboo 11 Pack" }],
          },
        ],
      }),
    ).toBeNull();
  });
});
