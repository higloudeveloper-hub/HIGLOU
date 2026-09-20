import { describe, expect, it } from "vitest";
import {
  hasArbitrageKeep,
  marketPlay,
  marketTilePricing,
  marketTrend,
} from "@/lib/market/route-intent";
import type { MarketDropPublic } from "@/lib/market/from-opportunity";

function base(
  partial: Partial<MarketDropPublic> &
    Pick<MarketDropPublic, "id" | "lane" | "buy" | "sell">,
): MarketDropPublic {
  return {
    name: "Brand",
    title: "Product",
    blurb: "blurb",
    photo: "https://example.com/a.jpg",
    photos: ["https://example.com/a.jpg"],
    comps: partial.sell,
    supplier: "x",
    ships: "2–4",
    heat: "hot",
    source: "ledger",
    real: true,
    affiliateUrl: null,
    netProfit: null,
    score: 70,
    note: "ok",
    demandScore: 70,
    bsrDrops90: 28,
    salesRank: 12000,
    amazonPrice: partial.buy,
    ebayPrice: partial.lane === "amazon" ? null : partial.sell,
    walmartPrice: null,
    homedepotPrice: null,
    platformUrls: {
      amazon: null,
      ebay: null,
      walmart: null,
      homedepot: null,
    },
    ...partial,
  };
}

describe("market route intent", () => {
  it("labels Amazon demand as sell on Amazon with single Buy Box price", () => {
    const item = base({
      id: "win-B0AMZ00001",
      lane: "amazon",
      buy: 30,
      sell: 30,
      demandScore: 94,
      heat: "hot",
      bsrDrops90: 42,
    });
    expect(marketPlay(item).badge).toBe("Vender en Amazon");
    const pricing = marketTilePricing(item);
    expect(pricing.mode).toBe("single");
    if (pricing.mode === "single") {
      expect(pricing.price).toBe(30);
      expect(pricing.label).toMatch(/Buy Box/i);
    }
    expect(hasArbitrageKeep(item)).toBe(false);
    expect(marketTrend(item).level).toBe("hot");
    expect(marketTrend(item).progress).toBeGreaterThan(70);
  });

  it("shows compra/venta only when real arbitrage keep exists", () => {
    const item = base({
      id: "win-B0ARB00001",
      lane: "arbitrage",
      buy: 18,
      sell: 42,
      netProfit: 16,
      heat: "warm",
      bsrDrops90: 18,
    });
    expect(marketPlay(item).badge).toBe("Vender en eBay");
    expect(hasArbitrageKeep(item)).toBe(true);
    const pricing = marketTilePricing(item);
    expect(pricing.mode).toBe("spread");
    if (pricing.mode === "spread") {
      expect(pricing.buy).toBe(18);
      expect(pricing.sell).toBe(42);
      expect(pricing.keep).toBe(16);
    }
  });

  it("never duplicates compra=venta when prices match", () => {
    const item = base({
      id: "win-B0SAME0001",
      lane: "arbitrage",
      buy: 40,
      sell: 40,
      netProfit: 0,
    });
    const pricing = marketTilePricing(item);
    expect(pricing.mode).toBe("single");
  });

  it("labels retail as supply sourcing", () => {
    const item = base({
      id: "win-r-WM123",
      lane: "retail",
      buy: 22,
      sell: 55,
      netProfit: 18,
    });
    expect(marketPlay(item).play).toBe("source_supply");
    expect(marketPlay(item).badge).toMatch(/suministro/i);
  });
});
