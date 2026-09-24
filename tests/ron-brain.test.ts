import { describe, expect, it } from "vitest";
import { isRecentSamePack, rememberPublish } from "@/lib/ron/learn";
import { RON_DEFAULT_LEARNING } from "@/lib/ron/types";
import {
  buildRonCatalog,
  decideRonPublish,
} from "@/lib/ron/brain";
import { normalizeRonHit } from "@/lib/ron/normalize-hit";
import type { OpportunityProduct } from "@/lib/opportunity/types";

function hit(
  asin: string,
  title: string,
  brand: string,
  imageUrl?: string,
): OpportunityProduct {
  return {
    asin,
    title,
    brand,
    imageUrl: imageUrl ?? `https://m.media-amazon.com/images/I/${asin}.jpg`,
    upc: "",
    salesRank: 1000,
    salesRankLabel: "",
    browseNodeId: "",
    browseNodeName: "",
    rating: 4.5,
    reviewCount: 100,
    amazonPrice: 29.99,
    ebayPrice: null,
    ebayCount: null,
    opportunity: "now",
    mode: "amazon",
    sourceMarket: "amazon",
    sourceId: asin,
    destMarket: "ebay",
    eligibility: "SELLABLE",
    eligibilityMessage: "",
    score: 80,
    grade: "good",
    reasons: [],
    demandScore: 70,
    sellerCount: 5,
    amazonRetail: false,
    buyBoxPrice: 29.99,
    avgSalesRank90: 1000,
    bsrDrops90: 20,
    priceVariation90: 5,
    cost: null,
    salePrice: null,
    amazonFees: null,
    ebayFees: null,
    shipping: null,
    packing: null,
    returnsReserve: null,
    netProfit: 10,
    roi: 20,
    margin: 15,
    ebayActiveMedian: null,
    ebayActiveLow: null,
    ebayActiveCount: null,
    ebayListingsAreSold: false,
    keepa: true,
    mpn: "",
    ebayTitle: title,
    ebayMatchedByGtin: false,
    packQty: null,
    packageLb: null,
    avgAmazon90: null,
  } as OpportunityProduct;
}

describe("RON brain", () => {
  it("builds catalog only for ASINs with affiliate + image", () => {
    const hits = [
      hit("B0TEST0001", "Anker Power Bank 20000", "Anker"),
      hit("B0TEST0002", "Anker Cable USB C", "Anker"),
    ];
    const map = new Map([
      [
        "B0TEST0001",
        {
          linkUrl: "https://higlou.vercel.app/go/abc",
          imageUrl: "https://cdn.example.com/1.jpg",
        },
      ],
    ]);
    const catalog = buildRonCatalog({
      hits,
      affiliateByAsin: map,
      appOrigin: "https://higlou.vercel.app",
    });
    expect(catalog).toHaveLength(1);
    expect(catalog[0]!.asin).toBe("B0TEST0001");
    expect(catalog[0]!.linkUrl).toContain("/go/");
  });

  it("fills Amazon ASIN image when ledger hit has no image", () => {
    const hits = [hit("B0NOIMG001", "Gadget Sin Foto", "Solo", "")];
    const map = new Map([
      [
        "B0NOIMG001",
        { linkUrl: "https://higlou.vercel.app/go/nofoto" },
      ],
    ]);
    const catalog = buildRonCatalog({
      hits,
      affiliateByAsin: map,
      appOrigin: "https://higlou.vercel.app",
    });
    expect(catalog).toHaveLength(1);
    expect(catalog[0]!.imageUrl).toMatch(/^https?:\/\//);
    expect(catalog[0]!.imageFallbacks?.length).toBeGreaterThan(0);
  });

  it("prefers a multi-card pack when related products exist", () => {
    const hits = [
      hit("B0TEST0001", "Anker Power Bank 20000mAh", "Anker"),
      hit("B0TEST0002", "Anker Power Bank Mini", "Anker"),
      hit("B0TEST0003", "Anker Charger Wall", "Anker"),
    ];
    const map = new Map(
      hits.map((h) => [
        h.asin,
        {
          linkUrl: `https://higlou.vercel.app/go/${h.asin.slice(-4)}`,
          imageUrl: h.imageUrl,
          title: h.title,
        },
      ]),
    );
    const catalog = buildRonCatalog({
      hits,
      affiliateByAsin: map,
      appOrigin: "https://higlou.vercel.app",
    });
    const decision = decideRonPublish({
      catalog,
      learning: RON_DEFAULT_LEARNING,
      seed: 1,
    });
    expect(decision.action).toBe("publish");
    if (decision.action === "publish") {
      expect(["vitrina", "carousel"]).toContain(decision.format);
      expect(decision.cards.length).toBeGreaterThanOrEqual(2);
      expect(decision.message.length).toBeGreaterThan(0);
    }
  });

  it("skips solo products — never publishes a single loose card", () => {
    const hits = [hit("B0SOLO0001", "Solo Gadget Pro", "Solo")];
    const map = new Map([
      [
        "B0SOLO0001",
        {
          linkUrl: "https://higlou.vercel.app/go/solo",
          imageUrl: "https://cdn.example.com/solo.jpg",
        },
      ],
    ]);
    const catalog = buildRonCatalog({
      hits,
      affiliateByAsin: map,
      appOrigin: "https://higlou.vercel.app",
    });
    const decision = decideRonPublish({
      catalog,
      learning: RON_DEFAULT_LEARNING,
      seed: 2,
    });
    expect(decision.action).toBe("skip");
    if (decision.action === "skip") {
      expect(decision.reason.toLowerCase()).toMatch(/relacionad|sueltos|≥2|>=2/);
    }
  });

  it("builds catalog from affiliates alone (no Keepa hit required)", () => {
    const map = new Map([
      [
        "B0AFFONLY1",
        {
          linkUrl: "https://higlou.vercel.app/go/aff1",
          title: "Best Seller Cable USB C",
          clickCount: 40,
        },
      ],
      [
        "B0AFFONLY2",
        {
          linkUrl: "https://www.amazon.com/dp/B0AFFONLY2?tag=higlou-20",
          title: "USB C Cable Fast Charge",
          clickCount: 12,
        },
      ],
    ]);
    const catalog = buildRonCatalog({
      hits: [],
      affiliateByAsin: map,
      appOrigin: "https://higlou.vercel.app",
    });
    expect(catalog.length).toBe(2);
    expect(catalog[0]!.asin).toBe("B0AFFONLY1");
    expect(catalog[0]!.imageUrl).toMatch(/^https?:\/\//);
    const decision = decideRonPublish({
      catalog,
      learning: RON_DEFAULT_LEARNING,
      seed: 9,
    });
    // Two related cables → pack, or skip if not related enough — never 1 solo
    if (decision.action === "publish") {
      expect(decision.cards.length).toBeGreaterThanOrEqual(2);
      expect(decision.format).not.toBe("ads");
    }
  });

  it("never packs a tablet with a supplement — tablet pack or skip", () => {
    const hits = [
      hit("B0TABMIX01", "Kids Tablet 10 inch Android", "Yosa"),
      hit("B0TABMIX02", "Kids Tablet 8 inch WiFi", "Yosa"),
      hit("B0PILLMX01", "Kidney Support Supplement Capsules", "AminAvast"),
      hit("B0PILLMX02", "Vitamin D3 Softgel Pills 5000IU", "NatureMade"),
    ];
    const map = new Map(
      hits.map((h) => [
        h.asin,
        {
          linkUrl: `https://higlou.vercel.app/go/${h.asin.slice(-4)}`,
          imageUrl: h.imageUrl,
          title: h.title,
        },
      ]),
    );
    const catalog = buildRonCatalog({
      hits,
      affiliateByAsin: map,
      appOrigin: "https://higlou.vercel.app",
    });
    const decision = decideRonPublish({
      catalog,
      learning: RON_DEFAULT_LEARNING,
      seed: 42,
    });
    expect(["publish", "skip"]).toContain(decision.action);
    if (decision.action === "publish") {
      expect(decision.cards.length).toBeGreaterThanOrEqual(2);
      expect(decision.format).not.toBe("ads");
      const blob = decision.cards.map((c) => c.title).join(" ").toLowerCase();
      const hasTab = /tablet/.test(blob);
      const hasPill = /kidney|supplement|capsule|vitamin|softgel|pill/.test(
        blob,
      );
      expect(hasTab && hasPill).toBe(false);
    }
  });

  it("skip reason does not send the user to Find Winners", () => {
    const decision = decideRonPublish({
      catalog: [],
      learning: RON_DEFAULT_LEARNING,
    });
    expect(decision.action).toBe("skip");
    if (decision.action === "skip") {
      expect(decision.reason.toLowerCase()).not.toMatch(/find winners/);
    }
  });

  it("rememberPublish tracks pack fingerprints for opportunity gating", () => {
    const next = rememberPublish(RON_DEFAULT_LEARNING, {
      format: "vitrina",
      niche: "Anker",
      asins: ["B0TEST0001", "B0TEST0002"],
    });
    expect(isRecentSamePack(next, ["B0TEST0002", "B0TEST0001"], 4)).toBe(
      true,
    );
    expect(isRecentSamePack(next, ["B0NEW00001"], 4)).toBe(false);
  });

  it("normalizeRonHit recovers ASIN from ledger columns when payload is thin", () => {
    const n = normalizeRonHit({
      asin: "b0ledger01",
      title: "Ledger Deal",
      image_url: "",
      mode: "amazon",
    });
    expect(n).not.toBeNull();
    expect(n!.asin).toBe("B0LEDGER01");
    expect(n!.keepa).toBe(true);
    expect(n!.imageUrl).toMatch(/^https?:\/\//);
  });
});
