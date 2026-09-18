import { afterEach, describe, expect, it } from "vitest";
import { getMonetizationRecommendation } from "@/lib/monetization/decision-engine";
import { calculateMoneyScore } from "@/lib/monetization/money-score";
import { buildAmazonAssociatesUrl } from "@/lib/monetization/channels/affiliate";
import {
  evaluateEbaySellChannel,
  evaluateAmazonSellChannel,
} from "@/lib/monetization/channels/sell";

describe("monetization sell channels", () => {
  it("marks eBay profit insufficient without cost", () => {
    const channel = evaluateEbaySellChannel({
      ebayPrice: 44.99,
      ebayConnected: true,
    });
    expect(channel.available).toBe(true);
    expect(channel.netProfit.value).toBeNull();
    expect(channel.netProfit.availability).toBe("insufficient");
  });

  it("estimates eBay profit when cost and price exist", () => {
    const channel = evaluateEbaySellChannel({
      ebayPrice: 29.99,
      cost: 10,
      ebayConnected: true,
      shipping: 6,
      packing: 0.5,
    });
    expect(channel.fees.value).not.toBeNull();
    expect(channel.netProfit.value).not.toBeNull();
    expect(channel.netProfit.value!).toBeGreaterThan(0);
    expect(channel.roi.value).not.toBeNull();
  });

  it("surfaces Amazon approval without inventing sellability", () => {
    const channel = evaluateAmazonSellChannel({
      amazonEligibility: "APPROVAL_REQUIRED",
      amazonEligibilityMessage: "Approval required",
      amazonSellerConnected: true,
    });
    expect(channel.available).toBe(false);
    expect(channel.status).toBe("APPROVAL_REQUIRED");
  });

  it("asks for ASIN when Amazon is connected but product has none", () => {
    const channel = evaluateAmazonSellChannel({
      amazonSellerConnected: true,
      amazonEligibility: "UNKNOWN",
    });
    expect(channel.status).toBe("UNKNOWN");
    expect(channel.message).toMatch(/ASIN/i);
    expect(channel.message).not.toMatch(/API required/i);
  });
});

describe("money score", () => {
  it("returns insufficient when economics missing", () => {
    const decision = getMonetizationRecommendation({
      title: "Test",
      ebayPrice: 20,
      moneyScoreEnabled: true,
    });
    const score = calculateMoneyScore(
      { ebayPrice: 20, moneyScoreEnabled: true },
      decision.channels,
    );
    expect(score.availability).toBe("insufficient");
    expect(score.score).toBeNull();
  });

  it("scores when cost and sale price are known", () => {
    const decision = getMonetizationRecommendation({
      ebayPrice: 44.99,
      cost: 18,
      shipping: 6,
      packing: 0.75,
      amazonEligibility: "APPROVAL_REQUIRED",
      ebayConnected: true,
      affiliateTagConfigured: true,
      affiliateEngineEnabled: true,
      asin: "B0TESTASIN",
      demandScore: 14,
      sellerCount: 6,
      quantity: 2,
      moneyScoreEnabled: true,
    });
    expect(decision.moneyScoreAvailability).toBe("known");
    expect(decision.moneyScore).toBeGreaterThan(0);
    expect(decision.moneyScore).toBeLessThanOrEqual(100);
  });
});

describe("decision engine", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it("recommends SELL on strong eBay margin", () => {
    const decision = getMonetizationRecommendation({
      ebayPrice: 44.99,
      cost: 18,
      shipping: 6,
      packing: 0.75,
      amazonEligibility: "APPROVAL_REQUIRED",
      ebayConnected: true,
      asin: "B012345678",
      affiliateTagConfigured: false,
      moneyScoreEnabled: true,
    });
    expect(decision.recommendation).toBe("SELL");
    expect(decision.primaryAction).toMatch(/SELL ON EBAY/i);
    expect(decision.reasons.length).toBeGreaterThan(0);
    expect(decision.warnings.some((w) => /estimated/i.test(w))).toBe(true);
  });

  it("recommends BOTH when sell and affiliate are ready", () => {
    const decision = getMonetizationRecommendation({
      ebayPrice: 44.99,
      cost: 18,
      shipping: 6,
      packing: 0.75,
      amazonEligibility: "APPROVAL_REQUIRED",
      ebayConnected: true,
      asin: "B012345678",
      affiliateTagConfigured: true,
      affiliateEngineEnabled: true,
      moneyScoreEnabled: true,
    });
    expect(decision.recommendation).toBe("BOTH");
  });

  it("never invents affiliate commission", () => {
    const decision = getMonetizationRecommendation({
      asin: "B012345678",
      affiliateTagConfigured: true,
      affiliateEngineEnabled: true,
    });
    expect(decision.channels.amazonAffiliate.estimatedCommission.value).toBeNull();
    expect(
      ["unknown", "api_required", "insufficient"].includes(
        decision.channels.amazonAffiliate.estimatedCommission.availability,
      ),
    ).toBe(true);
  });
});

describe("associates url", () => {
  it("builds a standard tagged Amazon URL", () => {
    const url = buildAmazonAssociatesUrl({
      asin: "B012345678",
      associateTag: "higlou-20",
    });
    expect(url).toContain("https://www.amazon.com/dp/B012345678");
    expect(url).toContain("tag=higlou-20");
  });
});
