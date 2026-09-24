import { describe, expect, it } from "vitest";
import {
  buildFacebookPromoCopy,
  defaultFacebookPromoMessage,
  facebookBold,
  productHook,
} from "@/lib/facebook/promo-copy";
import {
  dedupePromoCards,
  isJunkBrand,
  productImageKey,
  suggestPromoPacks,
  suggestReadyVitrinas,
} from "@/lib/facebook/promo-groups";

describe("facebook promo copy", () => {
  it("renders Mathematical Bold for Latin letters", () => {
    expect(facebookBold("Higlou")).toBe("𝗛𝗶𝗴𝗹𝗼𝘂");
    expect(facebookBold("WOW 12")).toContain("𝗪𝗢𝗪");
    expect(facebookBold("WOW 12")).toContain("𝟭𝟮");
  });

  it("ads copy is Amazon-Deals editorial (no precio verificado)", () => {
    const copy = buildFacebookPromoCopy({
      format: "ads",
      titles: ["Anker Power Bank 10000mAh Portable Charger"],
      prices: ["$24.99"],
      seed: 0,
    });
    expect(copy.message.split("\n").length).toBe(3);
    expect(copy.message).toContain("━━━━━━━━");
    expect(copy.message.toLowerCase()).not.toMatch(/verificad|higlou|precio/);
    expect(copy.cardDescription("$24.99")).toBe("$24.99");
    expect(copy.cardDescription(null)).toBe("");
    expect(copy.cardName("ASIN B0CHS1BVBC Anker Bank")).toBe("Anker Bank");
    expect(
      copy.cardName(
        "YosaToo Kids Tablet 10 inch Android with Case Charger Bundle Extra Long Name",
      ).length,
    ).toBeLessThanOrEqual(41);
  });

  it("carousel copy is TOP DEALS / SWIPE → SHOP", () => {
    const copy = buildFacebookPromoCopy({
      format: "carousel",
      titles: ["A", "B", "C"],
      seed: 0,
    });
    expect(copy.message).toMatch(/𝗧𝗢𝗣 𝗗𝗘𝗔𝗟𝗦|𝗧𝗢𝗗𝗔𝗬|𝗗𝗘𝗔𝗟𝗦/);
    expect(copy.message).toContain("→");
    expect(copy.message.split("\n").length).toBe(3);
    expect(copy.message.toLowerCase()).not.toMatch(/verificad|opciones/);
  });

  it("vitrina copy is short retail-premium, ignores junk niche /Go", () => {
    const copy = buildFacebookPromoCopy({
      format: "vitrina",
      titles: ["Label Printer Wireless", "Label Tape", "Label Maker"],
      niche: "/Go",
      seed: 0,
    });
    expect(copy.collectionTitle.toLowerCase()).not.toMatch(/\/go/);
    expect(copy.message.toLowerCase()).not.toMatch(
      /precios bajos|curaduría|verificad|sin relleno/,
    );
    expect(copy.message.split("\n").length).toBe(3);
    expect(copy.message).toContain("━━━━━━━━");
    expect(defaultFacebookPromoMessage("ads")).toContain("\n");
  });

  it("vitrina uses niche as collection title when provided", () => {
    const copy = buildFacebookPromoCopy({
      format: "vitrina",
      titles: ["A", "B", "C"],
      niche: "Anker",
      seed: 0,
    });
    expect(copy.collectionTitle).toBe("Anker");
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
      asin: "B0ANKER001",
      imageUrl: "https://cdn.example.com/1.jpg",
    },
    {
      id: "2",
      title: "Anker Power Bank 20000mAh Fast Charging Portable",
      brand: "Anker",
      priceLabel: "$39.99",
      asin: "B0ANKER002",
      imageUrl: "https://cdn.example.com/2.jpg",
    },
    {
      id: "3",
      title: "Anker USB C Cable 6ft Fast Charge",
      brand: "Anker",
      priceLabel: "$12.99",
      asin: "B0ANKER003",
      imageUrl: "https://cdn.example.com/3.jpg",
    },
    {
      id: "4",
      title: "Anker Wireless Charger Pad Fast",
      brand: "Anker",
      priceLabel: "$19.99",
      asin: "B0ANKER004",
      imageUrl: "https://cdn.example.com/4.jpg",
    },
    {
      id: "5",
      title: "Kitchen Knife Set Stainless Steel Chef",
      brand: "Generic",
      priceLabel: "$29.99",
      asin: "B0KNIFE001",
      imageUrl: "https://cdn.example.com/5.jpg",
    },
    {
      id: "6",
      title: "Kitchen Knife Block Set Professional",
      brand: "Generic",
      priceLabel: "$34.99",
      asin: "B0KNIFE002",
      imageUrl: "https://cdn.example.com/6.jpg",
    },
    {
      id: "7",
      title: "Kitchen Knife Sharpener Rod",
      brand: "Generic",
      priceLabel: "$14.99",
      asin: "B0KNIFE003",
      imageUrl: "https://cdn.example.com/7.jpg",
    },
    {
      id: "8",
      title: "Yoga Mat Non Slip Exercise Mat",
      brand: "FitLife",
      priceLabel: "$19.99",
      asin: "B0YOGA0001",
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

  it("never niches packs as /Go from affiliate chrome", () => {
    const aff = [
      {
        id: "a1",
        title: "Phomemo Label Printer Bluetooth Portable",
        meta: "Afiliado · /go",
        brand: "/go",
        asin: "B0PRINT001",
        priceLabel: "$29.99",
        imageUrl: "https://cdn.example.com/p1.jpg",
      },
      {
        id: "a2",
        title: "Phomemo Label Maker Tape Refill",
        meta: "Afiliado · /go",
        brand: "/go",
        asin: "B0PRINT002",
        priceLabel: "$12.99",
        imageUrl: "https://cdn.example.com/p2.jpg",
      },
      {
        id: "a3",
        title: "Phomemo Thermal Label Paper Rolls",
        meta: "Afiliado · /go",
        brand: "/go",
        asin: "B0PRINT003",
        priceLabel: "$15.99",
        imageUrl: "https://cdn.example.com/p3.jpg",
      },
      {
        id: "a4",
        title: "Yoga Mat Non Slip Exercise",
        meta: "Afiliado · /go",
        brand: "/go",
        asin: "B0YOGA9999",
        priceLabel: "$19.99",
        imageUrl: "https://cdn.example.com/y1.jpg",
      },
    ];
    const packs = suggestPromoPacks(aff, { limit: 4, preferVitrina: true });
    for (const p of packs) {
      expect(p.niche.toLowerCase()).not.toMatch(/^\/?go$/);
      expect(p.label.toLowerCase()).not.toMatch(/vitrina.*\/go|· \/go/);
    }
    const printer = packs.find((p) => /phomemo|label|printer/i.test(p.niche + p.label));
    expect(printer).toBeTruthy();
    expect(printer!.cardIds).not.toContain("a4");
  });

  it("dedupes same ASIN and same image from packs", () => {
    const dirty = [
      ...catalog.slice(0, 4),
      {
        id: "dup-asin",
        title: "Anker Power Bank DUPLICATE ASIN",
        brand: "Anker",
        asin: "B0ANKER001",
        priceLabel: "$24.99",
        imageUrl: "https://cdn.example.com/dup-asin.jpg",
      },
      {
        id: "dup-img",
        title: "Anker Power Bank DUPLICATE IMAGE",
        brand: "Anker",
        asin: "B0ANKER099",
        priceLabel: "$22.99",
        imageUrl: "https://cdn.example.com/1.jpg",
      },
    ];
    const cleaned = dedupePromoCards(dirty);
    expect(cleaned.map((c) => c.id)).not.toContain("dup-asin");
    expect(cleaned.map((c) => c.id)).not.toContain("dup-img");
    const packs = suggestPromoPacks(dirty, { limit: 4 });
    for (const p of packs) {
      expect(new Set(p.cardIds).size).toBe(p.cardIds.length);
      expect(p.cardIds).not.toContain("dup-asin");
      expect(p.cardIds).not.toContain("dup-img");
    }
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

  it("flags junk brands and fingerprints amazon images", () => {
    expect(isJunkBrand("/go")).toBe(true);
    expect(isJunkBrand("Go")).toBe(true);
    expect(isJunkBrand("Anker")).toBe(false);
    expect(
      productImageKey(
        "https://ws-na.amazon-adsystem.com/widgets/q?ASIN=B0CHS1BVBC&Format=_SL500_",
      ),
    ).toBe("asin:B0CHS1BVBC");
  });
});
