import { describe, expect, it } from "vitest";
import { runAutopilotOnOpportunities } from "@/lib/monetization/autopilot";
import type { OpportunityProduct } from "@/lib/opportunity/types";

function hit(over: Partial<OpportunityProduct> = {}): OpportunityProduct {
  return {
    asin: "B012345678",
    title: "Cash Widget",
    brand: "Acme",
    imageUrl: "",
    upc: "",
    salesRank: 9000,
    salesRankLabel: "Home",
    browseNodeId: "",
    browseNodeName: "",
    rating: 4.4,
    reviewCount: 20,
    amazonPrice: 16,
    ebayPrice: 42,
    ebayCount: 5,
    opportunity: "now",
    mode: "amazon_to_ebay",
    eligibility: "APPROVAL_REQUIRED",
    eligibilityMessage: "Approval required",
    score: 80,
    grade: "good",
    reasons: [],
    demandScore: 12,
    sellerCount: 5,
    amazonRetail: false,
    buyBoxPrice: 16,
    avgSalesRank90: 9000,
    bsrDrops90: 4,
    priceVariation90: 0.08,
    cost: 16,
    salePrice: 42,
    amazonFees: null,
    ebayFees: 6,
    shipping: 6,
    packing: 0.75,
    returnsReserve: 1.26,
    netProfit: 12,
    roi: 0.75,
    margin: 0.28,
    ebayActiveMedian: 42,
    ebayActiveLow: 38,
    ebayActiveCount: 5,
    ebayListingsAreSold: false,
    keepa: true,
    mpn: "",
    ebayTitle: "",
    ebayMatchedByGtin: false,
    packQty: 1,
    packageLb: 2,
    avgAmazon90: 20,
    discount90: 0.2,
    soldVerified: true,
    sold30d: 6,
    sold90d: 18,
    medianSoldPrice: 42,
    p25Sold90: 38,
    sellThrough90: 0.35,
    daysToSell: 22,
    identityConfidence: 98,
    identityBasis: "gtin",
    verdict: "winner",
    expectedSalePrice: 42,
    hypotheticalKeep: 12,
    landedCost: 16,
    priceDropReserve: 1,
    promotedFee: 0,
    returnRisk: "low",
    policyRisk: "low",
    ...over,
  };
}

describe("autopilot cycle", () => {
  it("ranks sellable money actions without inventing hits", () => {
    const cycle = runAutopilotOnOpportunities([hit(), hit({ asin: "B0WEAK0001", netProfit: 1, cost: 40, ebayPrice: 42, expectedSalePrice: 42, ebayActiveMedian: 42, roi: 0.02 })], {
      limit: 10,
    });
    expect(cycle.scanned).toBe(2);
    expect(cycle.queued).toBeGreaterThan(0);
    expect(cycle.actions[0]?.recommendation).toMatch(/SELL|BOTH|WATCH|AFFILIATE/);
    expect(cycle.safeGuards.some((s) => /publish/i.test(s))).toBe(true);
  });
});
