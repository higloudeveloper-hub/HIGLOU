import { describe, expect, it } from "vitest";
import { opportunityToMonetizationInput, recommendFromOpportunity } from "@/lib/monetization/from-opportunity";
import type { OpportunityProduct } from "@/lib/opportunity/types";

function baseHit(over: Partial<OpportunityProduct> = {}): OpportunityProduct {
  return {
    asin: "B012345678",
    title: "Test Widget",
    brand: "Acme",
    imageUrl: "",
    upc: "",
    salesRank: 12000,
    salesRankLabel: "Home",
    browseNodeId: "",
    browseNodeName: "",
    rating: 4.5,
    reviewCount: 40,
    amazonPrice: 18,
    ebayPrice: 39.99,
    ebayCount: 8,
    opportunity: "now",
    mode: "amazon_to_ebay",
    eligibility: "APPROVAL_REQUIRED",
    eligibilityMessage: "Approval required",
    score: 78,
    grade: "good",
    reasons: [],
    demandScore: 14,
    sellerCount: 6,
    amazonRetail: false,
    buyBoxPrice: 18,
    avgSalesRank90: 11000,
    bsrDrops90: 5,
    priceVariation90: 0.1,
    cost: 18,
    salePrice: 39.99,
    amazonFees: null,
    ebayFees: 5.76,
    shipping: 6,
    packing: 0.75,
    returnsReserve: 1.2,
    netProfit: 14.7,
    roi: 0.82,
    margin: 0.37,
    ebayActiveMedian: 39.99,
    ebayActiveLow: 35,
    ebayActiveCount: 8,
    ebayListingsAreSold: false,
    keepa: true,
    mpn: "",
    ebayTitle: "",
    ebayMatchedByGtin: false,
    packQty: 1,
    packageLb: 2,
    avgAmazon90: 22,
    discount90: 0.18,
    soldVerified: true,
    sold30d: 8,
    sold90d: 20,
    medianSoldPrice: 39.99,
    p25Sold90: 36,
    sellThrough90: 0.4,
    daysToSell: 20,
    identityConfidence: 98,
    identityBasis: "gtin",
    verdict: "winner",
    expectedSalePrice: 39.99,
    hypotheticalKeep: 14.7,
    landedCost: 18,
    priceDropReserve: 1,
    promotedFee: 0,
    returnRisk: "low",
    policyRisk: "low",
    ...over,
  };
}

describe("opportunity → money bridge", () => {
  it("maps winners economics without inventing fields", () => {
    const input = opportunityToMonetizationInput(baseHit());
    expect(input.asin).toBe("B012345678");
    expect(input.cost).toBe(18);
    expect(input.ebayPrice).toBe(39.99);
    expect(input.amazonEligibility).toBe("APPROVAL_REQUIRED");
    expect(input.soldVerified).toBe(true);
  });

  it("recommends SELL from a strong eBay winners card", () => {
    const decision = recommendFromOpportunity(baseHit(), {
      moneyScoreEnabled: true,
    });
    expect(decision.recommendation).toBe("SELL");
    expect(decision.moneyScore).not.toBeNull();
    expect(decision.primaryAction).toMatch(/SELL ON EBAY/i);
  });
});
