import { describe, expect, it } from "vitest";
import { getMonetizationRecommendation } from "@/lib/monetization/decision-engine";

describe("monetization data honesty", () => {
  it("labels missing economics without inventing numbers", () => {
    const d = getMonetizationRecommendation({
      title: "Unknown widget",
      asin: "B0ABCDEF12",
      moneyScoreEnabled: true,
    });
    expect(d.moneyScore).toBeNull();
    expect(d.moneyScoreAvailability).toBe("insufficient");
    expect(d.channels.ebaySeller.netProfit.value).toBeNull();
    expect(d.channels.amazonAffiliate.estimatedCommission.value).toBeNull();
    expect(
      d.reasons.some((r) => /insufficient data/i.test(r.text)),
    ).toBe(true);
  });
});
