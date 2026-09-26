import { describe, expect, it } from "vitest";
import { parseKeepaVariations } from "@/lib/keepa/variations";
import {
  pickColorVariationCandidates,
  pickDistinctVariationExtras,
  strongVariationImage,
  normalizeAmazonProductImage,
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
        // Title says Gold but Keepa photo is same as seed — must drop
        asin: "B0FAKEGOLD1",
        image: "71SEED.jpg",
        attributes: [{ dimension: "color_name", value: "Gold" }],
      },
    ],
  })!;

  it("picks color ASINs without requiring images first", () => {
    const colors = pickColorVariationCandidates(family.variants, {
      seedAsin: "B0SEED0001",
      seedColor: "black",
      limit: 3,
    });
    expect(colors.map((v) => v.aspects.Color)).toEqual([
      "Crimson",
      "Navy",
      "Forest",
    ]);
  });

  it("keeps seed out and picks 3 color-distinct extras with unique photos", () => {
    const seedImg =
      "https://m.media-amazon.com/images/I/71SEED._AC_SL1500_.jpg";
    const imageByAsin = new Map([
      ["B0SEED0001", seedImg],
      [
        "B0COLRED01",
        "https://m.media-amazon.com/images/I/71RED._AC_SL1500_.jpg",
      ],
      [
        "B0COLBLU01",
        "https://m.media-amazon.com/images/I/71BLUE._AC_SL1500_.jpg",
      ],
      [
        "B0COLGRN01",
        "https://m.media-amazon.com/images/I/71GREEN._AC_SL1500_.jpg",
      ],
      [
        "B0COLRED02",
        "https://m.media-amazon.com/images/I/71RED._AC_SX500_.jpg",
      ],
      [
        "B0FAKEGOLD1",
        "https://m.media-amazon.com/images/I/71SEED._AC_SX300_.jpg",
      ],
    ]);
    const extras = pickDistinctVariationExtras(family.variants, {
      seedAsin: "B0SEED0001",
      seedImageKey: productImageKey(seedImg),
      seedColor: "black",
      limit: 3,
      imageByAsin,
    });
    expect(extras).toHaveLength(3);
    expect(extras.map((v) => v.asin)).not.toContain("B0SEED0001");
    expect(extras.map((v) => v.asin)).not.toContain("B0COLRED02");
    expect(extras.map((v) => v.asin)).not.toContain("B0FAKEGOLD1");
    const colors = extras.map((v) => v.aspects.Color);
    expect(new Set(colors).size).toBe(3);
    const imgs = extras.map((v) => productImageKey(v.imageUrls[0]));
    expect(new Set(imgs).size).toBe(3);
  });
});

describe("image fingerprints", () => {
  it("treats Amazon size variants of the same I/ id as one photo", () => {
    expect(
      productImageKey(
        "https://m.media-amazon.com/images/I/71ABC._AC_SL1500_.jpg",
      ),
    ).toBe(
      productImageKey(
        "https://m.media-amazon.com/images/I/71ABC._AC_SX500_.jpg",
      ),
    );
  });

  it("normalizes Keepa image URLs to SL1500", () => {
    expect(
      normalizeAmazonProductImage(
        "https://m.media-amazon.com/images/I/71ABC.jpg",
      ),
    ).toBe("https://m.media-amazon.com/images/I/71ABC._AC_SL1500_.jpg");
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
