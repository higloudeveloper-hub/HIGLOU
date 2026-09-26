import { describe, expect, it } from "vitest";
import { parseKeepaVariations } from "@/lib/keepa/variations";
import {
  pickDistinctVariationExtras,
  strongVariationImage,
} from "@/lib/ron/variation-pack";
import { productImageKey } from "@/lib/facebook/promo-groups";

describe("Keepa variation family for RON packs", () => {
  it("parses a full color family ready for carousel/vitrina", () => {
    const set = parseKeepaVariations({
      asin: "B0PARENT01",
      variations: [
        {
          asin: "B0COLRED01",
          image: "71RED.jpg",
          attributes: [
            { dimension: "color_name", value: "Crimson" },
            { dimension: "size_name", value: "Medium" },
          ],
        },
        {
          asin: "B0COLBLU01",
          image: "71BLUE.jpg",
          attributes: [
            { dimension: "color_name", value: "Navy" },
            { dimension: "size_name", value: "Medium" },
          ],
        },
        {
          asin: "B0COLGRN01",
          image: "71GREEN.jpg",
          attributes: [
            { dimension: "color_name", value: "Forest" },
            { dimension: "size_name", value: "Large" },
          ],
        },
      ],
    });
    expect(set).not.toBeNull();
    expect(set!.variants.length).toBe(3);
    expect(set!.axisNames).toEqual(expect.arrayContaining(["Color", "Size"]));
    expect(set!.variants.every((v) => v.imageUrls[0]?.includes("images/I/"))).toBe(
      true,
    );
  });
});

describe("pickDistinctVariationExtras", () => {
  const family = parseKeepaVariations({
    asin: "B0PARENT01",
    variations: [
      {
        asin: "B0SEED0001",
        image: "71SEED.jpg",
        attributes: [
          { dimension: "color_name", value: "Black" },
          { dimension: "size_name", value: "One Size" },
        ],
      },
      {
        asin: "B0COLRED01",
        image: "71RED.jpg",
        attributes: [
          { dimension: "color_name", value: "Crimson" },
          { dimension: "size_name", value: "Medium" },
        ],
      },
      {
        asin: "B0COLBLU01",
        image: "71BLUE.jpg",
        attributes: [
          { dimension: "color_name", value: "Navy" },
          { dimension: "size_name", value: "Medium" },
        ],
      },
      {
        asin: "B0COLGRN01",
        image: "71GREEN.jpg",
        attributes: [
          { dimension: "color_name", value: "Forest" },
          { dimension: "size_name", value: "Large" },
        ],
      },
      {
        // Same color as Crimson, different size — must not twin the red photo
        asin: "B0COLRED02",
        image: "71RED.jpg",
        attributes: [
          { dimension: "color_name", value: "Crimson" },
          { dimension: "size_name", value: "Large" },
        ],
      },
      {
        // No real Keepa I/ image — skip
        asin: "B0WEAK0001",
        image: "",
        attributes: [{ dimension: "color_name", value: "Gold" }],
      },
    ],
  })!;

  it("keeps seed out and picks 3 color-distinct extras with unique photos", () => {
    const seedImg =
      "https://m.media-amazon.com/images/I/71SEED._AC_SL1500_.jpg";
    const extras = pickDistinctVariationExtras(family.variants, {
      seedAsin: "B0SEED0001",
      seedImageKey: productImageKey(seedImg),
      seedColor: "black",
      limit: 3,
    });
    expect(extras).toHaveLength(3);
    expect(extras.map((v) => v.asin)).not.toContain("B0SEED0001");
    expect(extras.map((v) => v.asin)).not.toContain("B0COLRED02");
    const colors = extras.map((v) => v.aspects.Color);
    expect(new Set(colors).size).toBe(3);
    const imgs = extras.map((v) => productImageKey(v.imageUrls[0]));
    expect(new Set(imgs).size).toBe(3);
  });
});

describe("strongVariationImage", () => {
  it("accepts real Amazon I/ photos", () => {
    const got = strongVariationImage(
      "https://m.media-amazon.com/images/I/71ABC._AC_SL1500_.jpg",
      [],
      "B0TEST0001",
    );
    expect(got?.imageUrl).toContain("/images/I/");
  });

  it("rejects ads-system / P-ASIN stubs so gray cards never ship", () => {
    const weak = strongVariationImage(
      "https://ws-na.amazon-adsystem.com/widgets/q?ASIN=B0TEST0001&Format=_SL500_",
      [
        "https://m.media-amazon.com/images/P/B0TEST0001.01.LZZZZZZZ.jpg",
      ],
      "B0TEST0001",
    );
    expect(weak).toBeNull();
  });
});
