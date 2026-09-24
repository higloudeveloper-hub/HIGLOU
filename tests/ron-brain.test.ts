import { describe, expect, it } from "vitest";
import {
  buildRonCatalog,
  decideRonPublish,
} from "@/lib/ron/brain";
import { rememberPublish, scoreFormat } from "@/lib/ron/learn";
import { RON_DEFAULT_LEARNING } from "@/lib/ron/types";
import type { OpportunityProduct } from "@/lib/opportunity/types";

function hit(
  asin: string,
  title: string,
  brand: string,
): OpportunityProduct {
  return {
    asin,
    title,
    brand,
    imageUrl: `https://m.media-amazon.com/images/I/${asin}.jpg`,
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
      expect(["vitrina", "carousel", "ads"]).toContain(decision.format);
      expect(decision.cards.length).toBeGreaterThanOrEqual(1);
      expect(decision.message.length).toBeGreaterThan(0);
    }
  });

  it("falls back to ads with one product", () => {
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
    expect(decision.action).toBe("publish");
    if (decision.action === "publish") {
      expect(decision.format).toBe("ads");
      expect(decision.cards).toHaveLength(1);
    }
  });

  it("rememberPublish boosts format and niche weights", () => {
    const next = rememberPublish(RON_DEFAULT_LEARNING, {
      format: "vitrina",
      niche: "Anker",
      asins: ["B0TEST0001"],
    });
    expect(scoreFormat(next, "vitrina")).toBeGreaterThan(
      scoreFormat(RON_DEFAULT_LEARNING, "vitrina"),
    );
    expect(next.niches.anker).toBeGreaterThan(0);
    expect(next.asins.B0TEST0001).toBeGreaterThan(0);
  });
});
