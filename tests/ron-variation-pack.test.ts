import { describe, expect, it } from "vitest";
import { parseKeepaVariations } from "@/lib/keepa/variations";
import {
  pickColorVariationCandidates,
  pickDistinctVariationExtras,
  strongVariationImage,
  normalizeAmazonProductImage,
  isVariationSwatchImage,
} from "@/lib/ron/variation-pack";
import { productImageKey } from "@/lib/facebook/promo-groups";
import { keepaGalleryImages } from "@/lib/keepa/parse";

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

describe("main gallery vs color swatch", () => {
  it("Keepa /product gallery prefers images[0] hero over swatch CSV only", () => {
    const gallery = keepaGalleryImages({
      images: [{ l: "71LIFESTYLE.jpg" }, { l: "71DETAIL.jpg" }],
      imagesCSV: "71SWATCH.jpg,71LIFESTYLE.jpg",
    });
    expect(gallery[0]).toContain("71LIFESTYLE");
    expect(gallery[0]).not.toContain("71SWATCH");
  });

  it("detects when a URL is the variation color swatch", () => {
    const variant = {
      asin: "B0COLRED01",
      sku: "AMZ-B0COLRED01",
      aspects: { Color: "Crimson" },
      imageUrls: [
        "https://m.media-amazon.com/images/I/71SWATCH._AC_SL1500_.jpg",
      ],
    };
    expect(
      isVariationSwatchImage(
        "https://m.media-amazon.com/images/I/71SWATCH._AC_SX300_.jpg",
        variant,
      ),
    ).toBe(true);
    expect(
      isVariationSwatchImage(
        "https://m.media-amazon.com/images/I/71LIFESTYLE._AC_SL1500_.jpg",
        variant,
      ),
    ).toBe(false);
  });
});

describe("pickDistinctVariationExtras", () => {
  const family = parseKeepaVariations({
    asin: "B0PARENT01",
    variations: [
      {
        asin: "B0SEED0001",
        image: "71SEEDSWATCH.jpg",
        attributes: [
          { dimension: "color_name", value: "Black" },
          { dimension: "size_name", value: "One Size" },
        ],
      },
      {
        asin: "B0COLRED01",
        image: "71REDSWATCH.jpg",
        attributes: [
          { dimension: "color_name", value: "Crimson" },
          { dimension: "size_name", value: "Medium" },
        ],
      },
      {
        asin: "B0COLBLU01",
        image: "71BLUESWATCH.jpg",
        attributes: [
          { dimension: "color_name", value: "Navy" },
          { dimension: "size_name", value: "Medium" },
        ],
      },
      {
        asin: "B0COLGRN01",
        image: "71GREENSWATCH.jpg",
        attributes: [
          { dimension: "color_name", value: "Forest" },
          { dimension: "size_name", value: "Large" },
        ],
      },
      {
        asin: "B0COLRED02",
        image: "71REDSWATCH.jpg",
        attributes: [
          { dimension: "color_name", value: "Crimson" },
          { dimension: "size_name", value: "Large" },
        ],
      },
      {
        asin: "B0FAKEGOLD1",
        image: "71GOLDSWATCH.jpg",
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

  it("uses main gallery heroes, never color swatches", () => {
    const seedHero =
      "https://m.media-amazon.com/images/I/71SEEDHERO._AC_SL1500_.jpg";
    // Gallery heroes are DIFFERENT ids from the swatch images on variants
    const imageByAsin = new Map([
      ["B0SEED0001", seedHero],
      [
        "B0COLRED01",
        "https://m.media-amazon.com/images/I/71REDHERO._AC_SL1500_.jpg",
      ],
      [
        "B0COLBLU01",
        "https://m.media-amazon.com/images/I/71BLUEHERO._AC_SL1500_.jpg",
      ],
      [
        "B0COLGRN01",
        "https://m.media-amazon.com/images/I/71GREENHERO._AC_SL1500_.jpg",
      ],
      // Same as seed hero → must drop (no real visual difference)
      [
        "B0FAKEGOLD1",
        "https://m.media-amazon.com/images/I/71SEEDHERO._AC_SX500_.jpg",
      ],
      // Swatch-only (gallery equals swatch) → must drop
      [
        "B0COLRED02",
        "https://m.media-amazon.com/images/I/71REDSWATCH._AC_SL1500_.jpg",
      ],
    ]);
    const extras = pickDistinctVariationExtras(family.variants, {
      seedAsin: "B0SEED0001",
      seedImageKey: productImageKey(seedHero),
      seedColor: "black",
      limit: 3,
      imageByAsin,
    });
    expect(extras).toHaveLength(3);
    expect(extras.map((v) => v.asin)).toEqual([
      "B0COLRED01",
      "B0COLBLU01",
      "B0COLGRN01",
    ]);
    for (const v of extras) {
      expect(v.imageUrls[0]).toContain("HERO");
      expect(v.imageUrls[0]).not.toContain("SWATCH");
    }
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
