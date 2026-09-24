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
  it("rejects Facebook Ads as a product title", () => {
    expect(isJunkPromoTitle("Facebook Ads")).toBe(true);
    expect(isJunkPromoTitle("RON Agent")).toBe(true);
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
    expect(copy.message.toLowerCase()).not.toMatch(/facebook/);
    expect(copy.message).toMatch(/𝗢𝗙𝗙|OFF/);
    expect(copy.cardName("Facebook Ads")).toMatch(/Anker/i);
    expect(copy.cardDescription("$29.99", 40)).toBe("40% OFF · $29.99");
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
      minRelated: 0.36,
      disallowPriceBandFallback: true,
    });
    for (const pack of packs) {
      const titles = pack.titles.join(" ").toLowerCase();
      if (/tablet/.test(titles)) {
        expect(titles).not.toMatch(/kidney|supplement|capsule|pill/);
      }
    }
  });
});

describe("RON anti-duplicate + interest republish", () => {
  it("blocks overlapping vitrinas without interest", () => {
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
        24,
      ),
    ).toBe(true);
    expect(
      shouldSkipPackForCooldown(
        learned,
        ["B0TAB00001", "B0TAB00002", "B0TAB00003"],
        24,
        { B0TAB00001: 10, B0TAB00002: 5, B0TAB00003: 2 },
      ).skip,
    ).toBe(true);
  });

  it("allows republish when the published pack gained real clicks", () => {
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
    ).toBe(true);
    const gate = shouldSkipPackForCooldown(
      learned,
      ["B0TAB00001", "B0TAB00002", "B0TAB00003"],
      24,
      nowClicks,
    );
    expect(gate.skip).toBe(false);
    expect(gate.reason).toBe("interest");

    const fresh = filterFreshCatalogAsins(
      [{ asin: "B0TAB00001" }, { asin: "B0NEW00001" }],
      learned,
      18,
      { currentClicks: nowClicks, keepInterest: true },
    );
    expect(fresh.map((c) => c.asin).sort()).toEqual([
      "B0NEW00001",
      "B0TAB00001",
    ]);
  });
});
