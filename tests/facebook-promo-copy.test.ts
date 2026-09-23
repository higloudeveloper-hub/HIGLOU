import { describe, expect, it } from "vitest";
import {
  buildFacebookPromoCopy,
  defaultFacebookPromoMessage,
  facebookBold,
  productHook,
} from "@/lib/facebook/promo-copy";
import {
  suggestPromoPacks,
  suggestReadyVitrinas,
} from "@/lib/facebook/promo-groups";

describe("facebook promo copy", () => {
  it("renders Mathematical Bold for Latin letters", () => {
    expect(facebookBold("Higlou")).toBe("𝗛𝗶𝗴𝗹𝗼𝘂");
    expect(facebookBold("WOW 12")).toContain("𝗪𝗢𝗪");
    expect(facebookBold("WOW 12")).toContain("𝟭𝟮");
  });

  it("builds an ads message with bold hook + CTA", () => {
    const copy = buildFacebookPromoCopy({
      format: "ads",
      titles: ["Anker Power Bank 10000mAh Portable Charger"],
      prices: ["$24.99"],
      seed: 0,
    });
    expect(copy.message).toMatch(/𝗔|𝗣|𝗛|𝗪/);
    expect(copy.message.toLowerCase()).toMatch(/tocá|comprá|verific/);
    expect(copy.cardDescription("$24.99")).toContain("$24.99");
    expect(copy.cardName("ASIN B0CHS1BVBC Anker Bank")).toBe("Anker Bank");
  });

  it("carousel copy mentions product count", () => {
    const copy = buildFacebookPromoCopy({
      format: "carousel",
      titles: ["A", "B", "C"],
      seed: 1,
    });
    expect(copy.message).toContain("3");
  });

  it("vitrina returns a collection title", () => {
    const copy = buildFacebookPromoCopy({ format: "vitrina", seed: 2 });
    expect(copy.collectionTitle.length).toBeGreaterThan(3);
    expect(defaultFacebookPromoMessage("ads")).toContain("\n");
  });

  it("productHook pulls meaningful words", () => {
    expect(productHook("The Best Kitchen Knife Set for Home")).toMatch(
      /Kitchen/i,
    );
  });
});

describe("ready-made related vitrinas", () => {
  const catalog = [
    {
      id: "1",
      title: "Anker Power Bank 10000mAh Portable Charger Black",
      brand: "Anker",
      priceLabel: "$24.99",
      imageUrl: "https://cdn.example.com/1.jpg",
    },
    {
      id: "2",
      title: "Anker Power Bank 20000mAh Fast Charging Portable",
      brand: "Anker",
      priceLabel: "$39.99",
      imageUrl: "https://cdn.example.com/2.jpg",
    },
    {
      id: "3",
      title: "Anker USB C Cable 6ft Fast Charge",
      brand: "Anker",
      priceLabel: "$12.99",
      imageUrl: "https://cdn.example.com/3.jpg",
    },
    {
      id: "4",
      title: "Anker Wireless Charger Pad Fast",
      brand: "Anker",
      priceLabel: "$19.99",
      imageUrl: "https://cdn.example.com/4.jpg",
    },
    {
      id: "5",
      title: "Kitchen Knife Set Stainless Steel Chef",
      brand: "Generic",
      priceLabel: "$29.99",
      imageUrl: "https://cdn.example.com/5.jpg",
    },
    {
      id: "6",
      title: "Kitchen Knife Block Set Professional",
      brand: "Generic",
      priceLabel: "$34.99",
      imageUrl: "https://cdn.example.com/6.jpg",
    },
    {
      id: "7",
      title: "Kitchen Knife Sharpener Rod",
      brand: "Generic",
      priceLabel: "$14.99",
      imageUrl: "https://cdn.example.com/7.jpg",
    },
    {
      id: "8",
      title: "Yoga Mat Non Slip Exercise Mat",
      brand: "FitLife",
      priceLabel: "$19.99",
      imageUrl: "https://cdn.example.com/8.jpg",
    },
  ];

  it("builds ready vitrinas with 3+ related products", () => {
    const vitrinas = suggestReadyVitrinas(catalog, 4);
    expect(vitrinas.length).toBeGreaterThan(0);
    expect(vitrinas.every((v) => v.format === "vitrina")).toBe(true);
    expect(vitrinas.every((v) => v.cardIds.length >= 3)).toBe(true);
    const anker = vitrinas.find((v) => /anker/i.test(v.label + v.niche));
    expect(anker).toBeTruthy();
    expect(anker!.cardIds.length).toBeGreaterThanOrEqual(3);
    expect(anker!.imageUrls.length).toBeGreaterThan(0);
  });

  it("puts vitrinas before carousels in suggestPromoPacks", () => {
    const packs = suggestPromoPacks(catalog, { limit: 6, preferVitrina: true });
    const firstVitrina = packs.findIndex((p) => p.format === "vitrina");
    const firstCarousel = packs.findIndex((p) => p.format === "carousel");
    expect(firstVitrina).toBeGreaterThanOrEqual(0);
    if (firstCarousel >= 0) {
      expect(firstVitrina).toBeLessThan(firstCarousel);
    }
  });

  it("returns empty when fewer than 2 cards", () => {
    expect(suggestPromoPacks([catalog[0]!])).toEqual([]);
  });
});
