import { describe, expect, it } from "vitest";
import {
  CREDIT_ACTIONS,
  CREDIT_PACKS,
  creditCost,
  getCreditPack,
  WELCOME_BONUS_CREDITS,
} from "@/lib/credits/costs";

describe("credits costs", () => {
  it("keeps welcome bonus enough for a first scan + claim", () => {
    expect(WELCOME_BONUS_CREDITS).toBeGreaterThanOrEqual(
      creditCost("winners_scan") + creditCost("market_claim"),
    );
  });

  it("exposes stripe-ready packs with positive credits", () => {
    expect(CREDIT_PACKS.length).toBeGreaterThanOrEqual(3);
    for (const pack of CREDIT_PACKS) {
      expect(pack.credits).toBeGreaterThan(0);
      expect(pack.priceCents).toBe(pack.priceUsd * 100);
    }
    expect(getCreditPack("grow")?.popular).toBe(true);
  });

  it("lists paid actions with costs", () => {
    expect(CREDIT_ACTIONS.winners_scan.cost).toBe(5);
    expect(CREDIT_ACTIONS.facebook_share.cost).toBe(2);
  });
});
