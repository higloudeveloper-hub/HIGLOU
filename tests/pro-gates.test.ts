import { describe, expect, it } from "vitest";
import {
  PRO_FEATURES,
  PRO_PLAN,
  actionCostCopy,
  hasProAccess,
} from "@/lib/credits/pro";
import { creditCost } from "@/lib/credits/costs";

describe("pro soft locks", () => {
  it("prices feature unlocks and full Pro plan", () => {
    expect(PRO_FEATURES.facebook_carousel.unlockCredits).toBeGreaterThan(0);
    expect(PRO_FEATURES.cheap_source.unlockCredits).toBeGreaterThan(0);
    expect(PRO_PLAN.unlockCredits).toBeGreaterThan(
      PRO_FEATURES.facebook_carousel.unlockCredits,
    );
    expect(PRO_PLAN.benefits.length).toBeGreaterThanOrEqual(3);
  });

  it("grants access with plan pro or feature unlock", () => {
    expect(
      hasProAccess({ plan: "pro", unlockedFeatures: [] }, "batch_import"),
    ).toBe(true);
    expect(
      hasProAccess(
        { plan: "free", unlockedFeatures: ["cheap_source"] },
        "cheap_source",
      ),
    ).toBe(true);
    expect(
      hasProAccess({ plan: "free", unlockedFeatures: [] }, "ai_analyze"),
    ).toBe(false);
  });

  it("formats credit cost copy for spend confirms", () => {
    expect(actionCostCopy("winners_scan")).toContain(
      String(creditCost("winners_scan")),
    );
    expect(actionCostCopy("affiliate_link")).toMatch(/1 crédito/);
  });
});
