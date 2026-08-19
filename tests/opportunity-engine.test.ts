import { describe, expect, it } from "vitest";
import { classifyAmazonRestrictions } from "@/lib/amazon/eligibility";
import { parseKeepaProduct } from "@/lib/keepa/parse";
import {
  importActionLabel,
  onlySellableForMode,
} from "@/lib/opportunity/mode-copy";
import { estimateNetProfit } from "@/lib/opportunity/profit";
import {
  isConfirmedOpportunity,
  opportunityGrade,
  passesMainOpportunityScreen,
  scoreOpportunity,
  sortByRealMoney,
} from "@/lib/opportunity/score";

describe("opportunity profit", () => {
  it("matches the $39.99 sale example after fees and reserves", () => {
    const profit = estimateNetProfit({
      salePrice: 39.99,
      cost: 15,
      marketplaceFee: 6,
      shipping: 7.5,
      packing: 0.75,
    });
    expect(profit.returnsReserve).toBe(1.2);
    expect(profit.netProfit).toBe(9.54);
    expect(profit.roi).toBe(0.636);
    expect(profit.margin).toBe(0.239);
  });

  it("never treats the eBay ask as what you keep", async () => {
    const { estimatedKeepAmount } = await import("@/lib/opportunity/profit");
    const keep = estimatedKeepAmount({
      mode: "amazon_to_ebay",
      amazonPrice: 18.4,
      ebayPrice: 38.46,
    });
    expect(keep).not.toBe(38.46);
    expect(keep).toBeGreaterThan(0);
    expect(keep).toBeLessThan(20);
    expect(
      estimatedKeepAmount({
        mode: "amazon_to_ebay",
        netProfit: 6.43,
        ebayPrice: 38.46,
      }),
    ).toBe(6.43);
  });
});

describe("opportunity score", () => {
  it("disqualifies a restricted ASIN", () => {
    const scored = scoreOpportunity({
      eligibility: "RESTRICTED",
      netProfit: 20,
      roi: 0.8,
      margin: 0.3,
      salesRank: 2000,
      avgSalesRank90: 2500,
      bsrDrops90: 12,
      rating: 4.6,
      reviewCount: 200,
      sellerCount: 5,
      amazonRetail: false,
      priceVariation90: 0.1,
      brand: "Generic",
      title: "Tool organizer",
    });
    expect(scored.score).toBe(0);
    expect(scored.grade).toBe("discard");
  });

  it("scores a sellable stable listing in the excellent band", () => {
    const scored = scoreOpportunity({
      eligibility: "SELLABLE",
      netProfit: 14.2,
      roi: 0.51,
      margin: 0.28,
      salesRank: 4000,
      avgSalesRank90: 5000,
      bsrDrops90: 10,
      rating: 4.6,
      reviewCount: 80,
      sellerCount: 5,
      amazonRetail: false,
      priceVariation90: 0.08,
      brand: "Acme",
      title: "Tool organizer",
    });
    expect(scored.score).toBeGreaterThanOrEqual(85);
    expect(opportunityGrade(scored.score)).toBe("excellent");
  });

  it("ranks a bigger payday ahead of a higher vanity score", () => {
    const ranked = sortByRealMoney([
      { asin: "B0LOWPAY01", score: 90, netProfit: 4 },
      { asin: "B0CASH0001", score: 61, netProfit: 18.4 },
      { asin: "B0UNKNOWN1", score: 80, netProfit: null },
    ]);
    expect(ranked.map((row) => row.asin)).toEqual([
      "B0CASH0001",
      "B0LOWPAY01",
      "B0UNKNOWN1",
    ]);
  });

  it("drops Amazon-dominated listings only when selling on Amazon", () => {
    const crowded = {
      eligibility: "SELLABLE" as const,
      netProfit: 14,
      roi: 0.4,
      priceVariation90: 0.1,
      sellerCount: 5,
      amazonRetail: true,
      upc: "123",
      title: "Bin",
    };
    expect(passesMainOpportunityScreen(crowded, { mode: "amazon" })).toBe(false);
    expect(
      passesMainOpportunityScreen(crowded, { mode: "amazon_to_ebay" }),
    ).toBe(true);
    expect(
      passesMainOpportunityScreen({
        ...crowded,
        amazonRetail: false,
        sellerCount: 18,
      }, { mode: "amazon" }),
    ).toBe(false);
  });

  it("keeps priced Amazon and eBay candidates even without verified sold profit", () => {
    expect(
      isConfirmedOpportunity(
        {
          amazonPrice: 18,
          ebayActiveMedian: 42,
          netProfit: null,
          eligibility: "UNKNOWN",
          title: "Bamboo organizer",
        },
        "amazon_to_ebay",
      ),
    ).toBe(true);
    expect(
      isConfirmedOpportunity(
        {
          amazonPrice: 18,
          ebayActiveMedian: null,
          netProfit: null,
          eligibility: "UNKNOWN",
          title: "Pretty Amazon bestseller",
        },
        "amazon_to_ebay",
      ),
    ).toBe(false);
  });
});

describe("Amazon eligibility", () => {
  it("marks empty restrictions as sellable and approval as approval", () => {
    expect(classifyAmazonRestrictions([])).toEqual({
      status: "SELLABLE",
      message: "You can sell it",
    });
    expect(
      classifyAmazonRestrictions(
        [
          {
            marketplaceId: "ATVPDKIKX0DER",
            conditionType: "new_new",
            reasons: [
              {
                reasonCode: "APPROVAL_REQUIRED",
                message: "Need approval",
                approvalUrl: "https://sellercentral.amazon.com/hz/approvalrequest",
              },
            ],
          },
        ],
        "B0TESTASIN",
        "Conbraco",
      ).status,
    ).toBe("APPROVAL_REQUIRED");
  });
});

describe("Keepa parse", () => {
  it("reads buy box, BSR, seller count, and Amazon retail from a product", () => {
    const snap = parseKeepaProduct({
      asin: "B0TESTASIN",
      title: "Tool organizer",
      brand: "Acme",
      imagesCSV: "71main",
      upcList: ["012345678905"],
      salesRankDrops90: 9,
      csv: [],
      stats: {
        current: [
          -1, 2499, -1, 4200, -1, -1, -1, -1, -1, -1, -1, 5, -1, -1, -1, -1,
          46, 120, 2599,
        ],
        avg90: [
          -1, 2400, -1, 5100, -1, -1, -1, -1, -1, -1, -1, 4, -1, -1, -1, -1,
          46, 100, 2500,
        ],
        min90: [
          -1, 2200, -1, 3000, -1, -1, -1, -1, -1, -1, -1, 3, -1, -1, -1, -1,
          40, 80, 2300,
        ],
        max90: [
          -1, 2700, -1, 8000, -1, -1, -1, -1, -1, -1, -1, 7, -1, -1, -1, -1,
          48, 140, 2800,
        ],
      },
    });
    expect(snap).toMatchObject({
      asin: "B0TESTASIN",
      amazonRetail: false,
      buyBoxPrice: 25.99,
      newPrice: 24.99,
      sellerCount: 5,
      salesRank: 4200,
      avgSalesRank90: 5100,
      bsrDrops90: 9,
      rating: 4.6,
      reviewCount: 120,
      upc: "012345678905",
    });
    expect(snap?.imageUrl).toMatch(/71main/);
    expect(snap?.priceVariation90).toBeCloseTo((27 - 22) / 24, 1);
  });
});

describe("verified-sales gates", () => {
  it("never treats active eBay asks as session cash", async () => {
    const { sessionKeepAmount } = await import("@/lib/opportunity/profit");
    expect(
      sessionKeepAmount({
        mode: "amazon_to_ebay",
        amazonPrice: 18.4,
        ebayPrice: 38.46,
        soldVerified: false,
      }),
    ).toBeNull();
  });

  it("caps unverified Amazon-to-eBay cards as candidates", async () => {
    const { judgeOpportunity } = await import("@/lib/opportunity/gates");
    const judged = judgeOpportunity(
      {
        asin: "B0TESTASIN",
        title: "Bamboo drawer organizer 1 pack",
        brand: "Acme",
        imageUrl: "",
        upc: "012345678905",
        mpn: "ORG-1",
        ebayTitle: "Bamboo drawer organizer 1 pack",
        ebayMatchedByGtin: true,
        salesRank: 4000,
        salesRankLabel: "Keepa BSR",
        browseNodeId: "",
        browseNodeName: "",
        rating: 4.6,
        reviewCount: 80,
        amazonPrice: 18,
        ebayPrice: 42,
        ebayCount: 8,
        opportunity: "thin",
        mode: "amazon_to_ebay",
        eligibility: "UNKNOWN",
        eligibilityMessage: "",
        score: 0,
        grade: "discard",
        reasons: [],
        demandScore: 0,
        sellerCount: 5,
        amazonRetail: true,
        buyBoxPrice: 18,
        avgSalesRank90: 5000,
        bsrDrops90: 8,
        priceVariation90: 0.08,
        cost: 18,
        salePrice: 42,
        amazonFees: null,
        ebayFees: 6,
        shipping: 7.5,
        packing: 0.75,
        returnsReserve: null,
        netProfit: null,
        roi: null,
        margin: null,
        ebayActiveMedian: 42,
        ebayActiveLow: 35,
        ebayActiveCount: 8,
        ebayListingsAreSold: false,
        keepa: true,
        packQty: 1,
        packageLb: 1.2,
        avgAmazon90: 28,
        discount90: 0.35,
        soldVerified: false,
        sold30d: null,
        sold90d: null,
        medianSoldPrice: null,
        p25Sold90: null,
        sellThrough90: null,
        daysToSell: null,
        identityConfidence: 0,
        identityBasis: "",
        verdict: "candidate",
        expectedSalePrice: null,
        hypotheticalKeep: null,
        landedCost: null,
        priceDropReserve: null,
        promotedFee: null,
        returnRisk: "medium",
        policyRisk: "low",
      },
      "amazon_to_ebay",
    );
    expect(judged.soldVerified).toBe(false);
    expect(judged.netProfit).toBeNull();
    expect(judged.score).toBeLessThanOrEqual(49);
    expect(judged.verdict).toBe("candidate");
  });

  it("rejects a 1-pack vs 2-pack match", async () => {
    const { scoreProductIdentity } = await import("@/lib/opportunity/identity");
    const identity = scoreProductIdentity({
      amazonTitle: "Cable clips 1 pack",
      ebayTitle: "Cable clips 2 pack",
      amazonUpc: "012345678905",
      ebayMatchedByGtin: true,
    });
    expect(identity.reject).toBe(true);
    expect(identity.confidence).toBe(0);
  });
});

describe("opportunity channel copy", () => {
  it("never sends Sell on Amazon to an eBay import button", () => {
    expect(importActionLabel("amazon", 2, false)).toBe("Import 2 for Amazon");
    expect(importActionLabel("amazon_to_ebay", 2, false)).toBe(
      "Import 2 ready for eBay",
    );
    expect(importActionLabel("supplier", 2, false)).toBe(
      "Import 2 for Amazon and eBay",
    );
    expect(onlySellableForMode("amazon_to_ebay")).toBe(false);
    expect(onlySellableForMode("amazon")).toBe(true);
  });
});
