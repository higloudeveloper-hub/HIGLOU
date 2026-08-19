import { describe, expect, it } from "vitest";
import { classifyAmazonRestrictions } from "@/lib/amazon/eligibility";
import { parseKeepaProduct } from "@/lib/keepa/parse";
import {
  importActionLabel,
  onlySellableForMode,
} from "@/lib/opportunity/mode-copy";
import { estimateNetProfit } from "@/lib/opportunity/profit";
import {
  opportunityGrade,
  passesMainOpportunityScreen,
  scoreOpportunity,
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

  it("drops Amazon-dominated or crowded listings from the main screen", () => {
    expect(
      passesMainOpportunityScreen({
        eligibility: "SELLABLE",
        netProfit: 14,
        roi: 0.4,
        priceVariation90: 0.1,
        sellerCount: 5,
        amazonRetail: true,
        upc: "123",
        title: "Bin",
      }),
    ).toBe(false);
    expect(
      passesMainOpportunityScreen({
        eligibility: "SELLABLE",
        netProfit: 14,
        roi: 0.4,
        priceVariation90: 0.1,
        sellerCount: 18,
        amazonRetail: false,
        upc: "123",
        title: "Bin",
      }),
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
