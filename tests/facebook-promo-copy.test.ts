import { describe, expect, it } from "vitest";
import {
  buildFacebookPromoCopy,
  defaultFacebookPromoMessage,
  facebookBold,
  productHook,
} from "@/lib/facebook/promo-copy";
import { suggestPromoPacks } from "@/lib/facebook/promo-groups";

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
    expect(copy.message).toMatch(/𝗔|𝗣|𝗛|𝗪/); // has bold runes
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
    expect(productHook("The Best Kitchen Knife Set for Home")).toMatch(/Kitchen/i);
  });
});

describe("facebook promo packs by similarity", () => {
  const catalog = [
    {
      id: "1",
      title: "Anker Power Bank 10000mAh Portable Charger Black",
      brand: "Anker",
      priceLabel: "$24.99",
    },
    {
      id: "2",
      title: "Anker Power Bank 20000mAh Fast Charging Portable",
      brand: "Anker",
      priceLabel: "$39.99",
    },
    {
      id: "3",
      title: "Anker USB C Cable 6ft Fast Charge",
      brand: "Anker",
      priceLabel: "$12.99",
    },
    {
      id: "4",
      title: "Kitchen Knife Set Stainless Steel Chef",
      brand: "Generic",
      priceLabel: "$29.99",
    },
    {
      id: "5",
      title: "Kitchen Knife Block Set Professional",
      brand: "Generic",
      priceLabel: "$34.99",
    },
    {
      id: "6",
      title: "Yoga Mat Non Slip Exercise Mat",
      brand: "FitLife",
      priceLabel: "$19.99",
    },
  ];

  it("clusters similar products into carousel/vitrina packs", () => {
    const packs = suggestPromoPacks(catalog, { limit: 4 });
    expect(packs.length).toBeGreaterThan(0);
    const anker = packs.find((p) => /anker/i.test(p.label + p.niche));
    expect(anker).toBeTruthy();
    expect(anker!.cardIds.length).toBeGreaterThanOrEqual(2);
    expect(["carousel", "vitrina"]).toContain(anker!.format);
  });

  it("returns empty when fewer than 2 cards", () => {
    expect(suggestPromoPacks([catalog[0]!])).toEqual([]);
  });
});
