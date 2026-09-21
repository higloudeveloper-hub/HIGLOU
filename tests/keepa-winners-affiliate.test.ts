import { describe, expect, it } from "vitest";
import { isKeepaAmazonAffiliateCandidate } from "@/lib/monetization/affiliate/from-keepa-winners";
import type { OpportunityProduct } from "@/lib/opportunity/types";

function baseHit(
  partial: Partial<OpportunityProduct> & { asin: string },
): OpportunityProduct {
  return {
    asin: partial.asin,
    title: partial.title ?? "Keepa widget",
    brand: partial.brand ?? "Brand",
    imageUrl: partial.imageUrl ?? "https://cdn.example.com/a.jpg",
    upc: "",
    mpn: "",
    ebayTitle: "",
    ebayMatchedByGtin: false,
    salesRank: partial.salesRank ?? 12_000,
    salesRankLabel: "",
    browseNodeId: "",
    browseNodeName: "",
    rating: 4.4,
    reviewCount: 100,
    packageLb: 1,
    lengthIn: null,
    widthIn: null,
    heightIn: null,
    amazonPrice: partial.amazonPrice ?? 24,
    ebayPrice: null,
    ebayActiveMedian: null,
    ebayActiveLow: null,
    ebayActiveCount: null,
    ebaySoldMedian: null,
    ebaySoldCount: null,
    ebayFees: null,
    fbaFee: null,
    referralFee: null,
    netProfit: null,
    roi: null,
    margin: null,
    score: 70,
    verdict: "good",
    reasons: [],
    risks: [],
    identityConfidence: 90,
    competition: "low",
    demand: "high",
    policyRisk: "low",
    returnRisk: "low",
    buyBoxPrice: partial.buyBoxPrice ?? 24,
    newPrice: 24,
    sellerCount: 4,
    amazonRetail: false,
    avgSalesRank90: partial.avgSalesRank90 ?? 12_000,
    avgNew90: null,
    discount90: 0.1,
    bsrDrops90: partial.bsrDrops90 ?? 20,
    priceVariation90: 0.08,
    keepa: partial.keepa ?? true,
    mode: partial.mode ?? "amazon",
    sourceMarket: "amazon",
    sourceId: partial.asin,
    destMarket: "amazon",
    salePrice: null,
    cost: null,
    hypotheticalKeep: null,
    ...partial,
  } as OpportunityProduct;
}

describe("Keepa winners → affiliate candidates", () => {
  it("accepts Keepa-flagged Amazon ASINs", () => {
    expect(
      isKeepaAmazonAffiliateCandidate(
        baseHit({ asin: "B0CHS1BVBC", keepa: true, bsrDrops90: 18 }),
      ),
    ).toBe(true);
  });

  it("rejects rows without a valid ASIN", () => {
    expect(
      isKeepaAmazonAffiliateCandidate(
        baseHit({ asin: "bad", keepa: true }),
      ),
    ).toBe(false);
  });

  it("rejects plain arbitrage without Keepa demand signals", () => {
    expect(
      isKeepaAmazonAffiliateCandidate(
        baseHit({
          asin: "B0CHS1BVBC",
          keepa: false,
          bsrDrops90: 0,
          mode: "amazon_to_ebay",
          amazonRetail: true,
        }),
      ),
    ).toBe(false);
  });
});
