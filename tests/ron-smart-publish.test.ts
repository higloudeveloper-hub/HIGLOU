import { describe, expect, it } from "vitest";
import { buildFacebookPromoCopy } from "@/lib/facebook/promo-copy";
import {
  isJunkPromoTitle,
  keepaOffPercent,
  pickProductTitle,
} from "@/lib/facebook/promo-title";
import { suggestPromoPacks } from "@/lib/facebook/promo-groups";
import {
  filterFreshCatalogAsins,
  isRecentOverlappingPack,
  packHasInterest,
  rememberPublish,
  shouldSkipPackForCooldown,
} from "@/lib/ron/learn";
import { RON_DEFAULT_LEARNING } from "@/lib/ron/types";

describe("promo titles + Keepa % OFF", () => {
  it("rejects Facebook Ads / Higlou Market as a product title", () => {
    expect(isJunkPromoTitle("Facebook Ads")).toBe(true);
    expect(isJunkPromoTitle("RON Agent")).toBe(true);
    expect(isJunkPromoTitle("Higlou Market")).toBe(true);
    expect(isJunkPromoTitle("Selección Higlou")).toBe(true);
    expect(pickProductTitle("Higlou Market", "Anker Power Bank 20K")).toBe(
      "Anker Power Bank 20K",
    );
    expect(pickProductTitle("Facebook Ads", "Anker Power Bank 20K")).toBe(
      "Anker Power Bank 20K",
    );
  });

  it("converts Keepa discount90 / coupon to percent off", () => {
    expect(keepaOffPercent({ discount90: 0.4 })).toBe(40);
    expect(keepaOffPercent({ couponPercent: 25 })).toBe(25);
    expect(keepaOffPercent({ discount90: 0.02 })).toBeNull();
  });

  it("ads copy uses product name and Keepa % OFF, never Facebook Ads", () => {
    const copy = buildFacebookPromoCopy({
      format: "ads",
      titles: ["Anker Power Bank 20000mAh"],
      prices: ["$29.99"],
      discountPercents: [40],
      seed: 1,
    });
    expect(copy.message.toLowerCase()).not.toMatch(/facebook|higlou/);
    expect(copy.message).toMatch(/𝗢𝗙𝗙|OFF/);
    expect(copy.cardName("Facebook Ads")).toMatch(/Anker/i);
    expect(copy.cardDescription("$29.99", 40)).toMatch(/40% OFF/);
    expect(copy.cardDescription("$29.99", 40)).toMatch(/\$29\.99/);
  });

  it("vitrina caption leads with product name, never Higlou Market", () => {
    const copy = buildFacebookPromoCopy({
      format: "vitrina",
      titles: ["Kids Tablet 10 inch Android"],
      niche: "Higlou Market",
      discountPercents: [30],
      seed: 3,
    });
    expect(copy.message.toLowerCase()).not.toMatch(/higlou/);
    expect(copy.collectionTitle.toLowerCase()).toMatch(/kids|tablet/);
    expect(copy.collectionTitle.toLowerCase()).not.toMatch(/higlou/);
  });
});

describe("strict related vitrinas", () => {
  it("does not glue tablets with pills when price-band fallback is off", () => {
    const cards = [
      {
        id: "1",
        title: "Kids Tablet 10 inch Android Case",
        brand: "Yosa",
        priceLabel: "$49.99",
        asin: "B0TAB00001",
        imageUrl: "https://cdn.example.com/t1.jpg",
      },
      {
        id: "2",
        title: "Kids Tablet 8 inch Educational",
        brand: "Yosa",
        priceLabel: "$39.99",
        asin: "B0TAB00002",
        imageUrl: "https://cdn.example.com/t2.jpg",
      },
      {
        id: "3",
        title: "Kidney Support Supplement Capsules",
        brand: "AminAvast",
        priceLabel: "$52.99",
        asin: "B0PILL0001",
        imageUrl: "https://cdn.example.com/p1.jpg",
      },
      {
        id: "4",
        title: "Tablet Screen Protector Glass",
        brand: "Yosa",
        priceLabel: "$12.99",
        asin: "B0TAB00003",
        imageUrl: "https://cdn.example.com/t3.jpg",
      },
    ];
    const packs = suggestPromoPacks(cards, {
      limit: 4,
      preferVitrina: true,
      minRelated: 0.48,
      disallowPriceBandFallback: true,
      strict: true,
    });
    expect(packs.length).toBeGreaterThan(0);
    for (const pack of packs) {
      const titles = pack.titles.join(" ").toLowerCase();
      expect(titles).toMatch(/tablet/);
      expect(titles).not.toMatch(/kidney|supplement|capsule|pill/);
    }
  });

  it("rejects tablet + capsule even with shared brand chrome", () => {
    const cards = [
      {
        id: "a",
        title: "Fire HD 10 Tablet Kids Edition",
        brand: "Generic",
        priceLabel: "$79.99",
        asin: "B0TABAAA01",
        imageUrl: "https://cdn.example.com/a.jpg",
      },
      {
        id: "b",
        title: "Vitamin D3 Softgel Capsules 5000IU",
        brand: "Generic",
        priceLabel: "$19.99",
        asin: "B0PILLBB01",
        imageUrl: "https://cdn.example.com/b.jpg",
      },
      {
        id: "c",
        title: "Multivitamin Gummies for Adults",
        brand: "Generic",
        priceLabel: "$22.00",
        asin: "B0PILLBB02",
        imageUrl: "https://cdn.example.com/c.jpg",
      },
    ];
    const packs = suggestPromoPacks(cards, {
      limit: 4,
      preferVitrina: true,
      strict: true,
      disallowPriceBandFallback: true,
    });
    for (const pack of packs) {
      const blob = pack.titles.join(" ").toLowerCase();
      const hasTab = /tablet/.test(blob);
      const hasSupp = /vitamin|softgel|gummies|capsule/.test(blob);
      expect(hasTab && hasSupp).toBe(false);
    }
  });
});

describe("RON anti-duplicate memory — never republish", () => {
  it("blocks overlapping vitrinas forever within cooldown", () => {
    const learned = rememberPublish(RON_DEFAULT_LEARNING, {
      format: "vitrina",
      niche: "Tablet",
      asins: ["B0TAB00001", "B0TAB00002", "B0TAB00003"],
      clicksByAsin: {
        B0TAB00001: 10,
        B0TAB00002: 5,
        B0TAB00003: 2,
      },
    });
    expect(
      isRecentOverlappingPack(
        learned,
        ["B0TAB00001", "B0TAB00002", "B0NEW00001"],
        168,
      ),
    ).toBe(true);
    expect(
      shouldSkipPackForCooldown(
        learned,
        ["B0TAB00001", "B0TAB00002", "B0TAB00003"],
        168,
        { B0TAB00001: 99, B0TAB00002: 99, B0TAB00003: 99 },
      ).skip,
    ).toBe(true);
  });

  it("never republishes even when clicks grew — only fresh ASINs", () => {
    const learned = rememberPublish(RON_DEFAULT_LEARNING, {
      format: "vitrina",
      niche: "Tablet",
      asins: ["B0TAB00001", "B0TAB00002", "B0TAB00003"],
      clicksByAsin: {
        B0TAB00001: 10,
        B0TAB00002: 5,
        B0TAB00003: 2,
      },
    });
    const nowClicks = {
      B0TAB00001: 14,
      B0TAB00002: 6,
      B0TAB00003: 3,
    };
    expect(
      packHasInterest(
        learned,
        ["B0TAB00001", "B0TAB00002", "B0TAB00003"],
        nowClicks,
      ),
    ).toBe(false);
    const gate = shouldSkipPackForCooldown(
      learned,
      ["B0TAB00001", "B0TAB00002", "B0TAB00003"],
      168,
      nowClicks,
    );
    expect(gate.skip).toBe(true);
    expect(gate.reason).toBe("cooldown");

    const fresh = filterFreshCatalogAsins(
      [{ asin: "B0TAB00001" }, { asin: "B0NEW00001" }],
      learned,
      72,
      { currentClicks: nowClicks, keepInterest: true },
    );
    expect(fresh.map((c) => c.asin)).toEqual(["B0NEW00001"]);
  });

  it("caption includes product name + source platform", () => {
    const copy = buildFacebookPromoCopy({
      format: "ads",
      titles: ["Anker Power Bank 20000mAh"],
      platforms: ["walmart"],
      discountPercents: [25],
      seed: 1,
    });
    expect(copy.message).toMatch(/Walmart/);
    expect(copy.message.toLowerCase()).not.toMatch(/higlou/);
    expect(copy.cardDescription("$29.99", 25, "ebay")).toMatch(/eBay/);
    expect(copy.cardDescription("$29.99", 25, "homedepot")).toMatch(
      /Home Depot/,
    );
  });
});
