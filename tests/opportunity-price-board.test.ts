import { describe, expect, it } from "vitest";
import { buildOpportunityPriceBoard } from "@/lib/opportunity/price-board";
import type { OpportunityProduct } from "@/lib/opportunity/types";

function hit(partial: Partial<OpportunityProduct> = {}): OpportunityProduct {
  return {
    asin: "B0BOARD001",
    title: "Cable organizer desk kit",
    brand: "Higlou",
    imageUrl: "https://m.media-amazon.com/images/I/01RmK+J4pJL._AC_SL1500_.jpg",
    amazonPrice: 18,
    buyBoxPrice: 18,
    cost: 18,
    ebayActiveLow: 42,
    ebayActiveMedian: 48,
    ebayPrice: 42,
    ebayFees: 6,
    ebayActiveCount: 9,
    hypotheticalKeep: 14.2,
    score: 78,
    verdict: "watch",
    identityConfidence: 60,
    mode: "amazon_to_ebay",
    sourceMarket: "amazon",
    sourceId: "",
    destMarket: "ebay",
    keepa: true,
    bsrDrops90: 22,
    ...partial,
  } as OpportunityProduct;
}

describe("buildOpportunityPriceBoard", () => {
  it("shows Amazon and eBay prices plus profit for the active route", () => {
    const board = buildOpportunityPriceBoard(hit());
    const amazon = board.platforms.find((p) => p.platform === "amazon");
    const ebay = board.platforms.find((p) => p.platform === "ebay");
    expect(amazon?.price).toBe(18);
    expect(amazon?.role).toBe("buy");
    expect(ebay?.price).toBe(42);
    expect(ebay?.role).toBe("sell");
    expect(board.activeKeep).toBe(14.2);
    expect(board.activeBuy).toBe(18);
    expect(board.activeSell).toBe(42);
    expect(board.routes.some((r) => r.mode === "amazon_to_ebay" && r.keep > 0)).toBe(
      true,
    );
  });

  it("merges overlay quotes from other platforms", () => {
    const board = buildOpportunityPriceBoard(hit(), {
      quotes: [
        { platform: "walmart", price: 15.5 },
        { platform: "homedepot", price: 16 },
        { platform: "amazon", price: 18 },
        { platform: "ebay", price: 40 },
      ],
      routes: [
        {
          mode: "walmart_to_ebay",
          buy: 15.5,
          sell: 40,
          keep: 12.4,
          label: "Walmart → eBay",
        },
        {
          mode: "amazon_to_ebay",
          buy: 18,
          sell: 40,
          keep: 10.1,
          label: "Amazon → eBay",
        },
      ],
    });
    expect(board.platforms.find((p) => p.platform === "walmart")?.price).toBe(
      15.5,
    );
    expect(board.platforms.find((p) => p.platform === "homedepot")?.price).toBe(
      16,
    );
    expect(board.routes[0]?.mode).toBe("walmart_to_ebay");
  });

  it("attaches openable product urls per platform", () => {
    const board = buildOpportunityPriceBoard(hit(), {
      quotes: [
        {
          platform: "walmart",
          price: 15.5,
          url: "https://www.walmart.com/ip/555",
        },
        {
          platform: "ebay",
          price: 40,
          url: "https://www.ebay.com/itm/123456789012",
        },
      ],
    });
    expect(board.platforms.find((p) => p.platform === "amazon")?.url).toBe(
      "https://www.amazon.com/dp/B0BOARD001",
    );
    expect(board.platforms.find((p) => p.platform === "ebay")?.url).toBe(
      "https://www.ebay.com/itm/123456789012",
    );
    expect(board.platforms.find((p) => p.platform === "walmart")?.url).toBe(
      "https://www.walmart.com/ip/555",
    );
  });
});
