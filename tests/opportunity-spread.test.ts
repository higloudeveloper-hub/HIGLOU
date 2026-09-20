import { describe, expect, it } from "vitest";
import {
  askBasedSalePrice,
  isActionableAskSpread,
  MIN_ACTIONABLE_ASK_KEEP,
} from "@/lib/opportunity/spread";
import { buildEbaySearchQuery } from "@/lib/ebay/live-prices";

describe("ask-based spread logic", () => {
  it("prefers the live low BIN over the median", () => {
    expect(askBasedSalePrice({ low: 29.99, median: 39.99 })).toBe(29.99);
    expect(askBasedSalePrice({ low: null, median: 40 })).toBe(36.8);
  });

  it("rejects skinny spreads that die after fees and ship", () => {
    expect(
      isActionableAskSpread({
        amazonPrice: 28,
        ebayActiveLow: 32,
        ebayActiveMedian: 34,
        hypotheticalKeep: 1.5,
      }),
    ).toBe(false);
  });

  it("keeps fat Amazon→eBay ask spreads", () => {
    expect(
      isActionableAskSpread({
        amazonPrice: 18,
        ebayActiveLow: 38,
        ebayActiveMedian: 42,
        hypotheticalKeep: 12,
        packageLb: 1.2,
      }),
    ).toBe(true);
    expect(MIN_ACTIONABLE_ASK_KEEP).toBeGreaterThanOrEqual(6);
  });
});

describe("buildEbaySearchQuery", () => {
  it("leads with brand and drops filler words", () => {
    const q = buildEbaySearchQuery(
      "The New Bamboo Drawer Organizer Pack for Kitchen with Free Shipping",
      "Acme",
    );
    expect(q.toLowerCase()).toContain("acme");
    expect(q.toLowerCase()).toContain("bamboo");
    expect(q.toLowerCase()).not.toContain("free");
    expect(q.toLowerCase()).not.toContain("shipping");
  });
});
