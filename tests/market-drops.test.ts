import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  amazonProductScore,
  isAmazonProductWinner,
} from "@/lib/opportunity/amazon-product-winner";
import {
  isPlatformWinner,
  platformKeep,
  sortPlatformWinners,
} from "@/lib/opportunity/platform-winner";
import {
  mergeMarketFeed,
  opportunityToMarketDrop,
} from "@/lib/market/from-opportunity";
import type { OpportunityProduct } from "@/lib/opportunity/types";

function readRepo(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function winner(partial: Partial<OpportunityProduct> = {}): OpportunityProduct {
  return {
    asin: "B0TESTWIN1",
    title: "Cable organizer kit",
    brand: "Higlou",
    imageUrl: "https://m.media-amazon.com/images/I/01RmK+J4pJL._AC_SL1500_.jpg",
    amazonPrice: 18,
    cost: 18,
    ebayActiveLow: 42,
    ebayActiveMedian: 48,
    ebayPrice: 42,
    ebayActiveCount: 12,
    hypotheticalKeep: 16.5,
    score: 78,
    verdict: "keep",
    identityConfidence: 60,
    mode: "amazon_to_ebay",
    ...partial,
  } as OpportunityProduct;
}

function amazonKeepaWinner(
  partial: Partial<OpportunityProduct> = {},
): OpportunityProduct {
  return winner({
    asin: "B0AMZWIN01",
    mode: "amazon",
    buyBoxPrice: 24,
    amazonPrice: 24,
    cost: null,
    ebayActiveLow: null,
    ebayActiveMedian: null,
    ebayPrice: null,
    hypotheticalKeep: null,
    netProfit: null,
    salesRank: 12000,
    avgSalesRank90: 14000,
    bsrDrops90: 28,
    sellerCount: 5,
    amazonRetail: false,
    rating: 4.5,
    reviewCount: 120,
    priceVariation90: 0.1,
    packageLb: 1.2,
    keepa: true,
    verdict: "good",
    ...partial,
  });
}

describe("platform winners", () => {
  it("accepts real ask keep and rejects losers", () => {
    expect(isPlatformWinner(winner())).toBe(true);
    expect(platformKeep(winner())).toBe(16.5);
    expect(
      isPlatformWinner(winner({ hypotheticalKeep: 2, netProfit: 2 })),
    ).toBe(false);
    expect(isPlatformWinner(winner({ verdict: "reject" }))).toBe(false);
    expect(isPlatformWinner(winner({ asin: "BAD" }))).toBe(false);
  });

  it("accepts Keepa Amazon product winners without eBay keep", () => {
    const hit = amazonKeepaWinner();
    expect(amazonProductScore(hit)).toBeGreaterThanOrEqual(55);
    expect(isAmazonProductWinner(hit)).toBe(true);
    expect(isPlatformWinner(hit, "amazon")).toBe(true);
    expect(
      isAmazonProductWinner(amazonKeepaWinner({ amazonRetail: true })),
    ).toBe(false);
    expect(
      isAmazonProductWinner(amazonKeepaWinner({ bsrDrops90: 2 })),
    ).toBe(false);
  });

  it("accepts Keepa buy-velocity hits for Amazon→eBay even with Amazon retail", () => {
    const hit = amazonKeepaWinner({
      mode: "amazon_to_ebay",
      amazonRetail: true,
      bsrDrops90: 40,
      sellerCount: 8,
      hypotheticalKeep: null,
      netProfit: null,
      ebayActiveLow: null,
      ebayPrice: null,
    });
    expect(isPlatformWinner(hit, "amazon_to_ebay")).toBe(true);
  });

  it("rejects money-losing ask spreads even with Keepa velocity", () => {
    const hit = amazonKeepaWinner({
      mode: "amazon_to_ebay",
      amazonRetail: true,
      bsrDrops90: 40,
      cost: 10,
      amazonPrice: 10,
      ebayActiveLow: 23,
      ebayPrice: 23,
      hypotheticalKeep: -2.44,
      netProfit: -2.44,
    });
    expect(isPlatformWinner(hit, "amazon_to_ebay")).toBe(false);
  });

  it("stocks market with both arbitrage and Amazon Keepa winners", () => {
    const junk = winner({
      asin: "B0JUNK0001",
      hypotheticalKeep: 1,
      ebayActiveLow: 19,
    });
    const arb = winner({ asin: "B0GOOD0001" });
    const amz = amazonKeepaWinner({ asin: "B0AMZGOOD1" });
    const merged = mergeMarketFeed({
      ledgerHits: [junk, arb, amz],
      limit: 10,
    });
    expect(merged.curatedCount).toBe(0);
    expect(merged.ledgerCount).toBe(2);
    const lanes = merged.drops.map((d) => d.lane).sort();
    expect(lanes).toEqual(["amazon", "arbitrage"]);
    expect(opportunityToMarketDrop(amz)?.lane).toBe("amazon");
    expect(opportunityToMarketDrop(amz)?.demandScore).toBeGreaterThan(0);
    expect(opportunityToMarketDrop(junk)).toBeNull();
    const arbDrop = opportunityToMarketDrop(arb);
    expect(arbDrop?.platformUrls.amazon).toBe(
      "https://www.amazon.com/dp/B0GOOD0001",
    );
    expect(arbDrop?.platformUrls.ebay).toMatch(/ebay\.com/);
    const tagged = opportunityToMarketDrop(arb, "higlou-20");
    expect(tagged?.affiliateUrl).toContain("tag=higlou-20");
    expect(tagged?.platformUrls.amazon).toContain("tag=higlou-20");
  });

  it("sorts by keep", () => {
    const a = winner({ asin: "B0AAAAAAA1", hypotheticalKeep: 12 });
    const b = winner({ asin: "B0BBBBBBB1", hypotheticalKeep: 28 });
    expect(sortPlatformWinners([a, b])[0]?.asin).toBe("B0BBBBBBB1");
  });
});

describe("higlou market + find winners wiring", () => {
  it("wires verified-only market and dual-lane find winners", () => {
    expect(readRepo("app/market/page.tsx")).toMatch(/DropMarketStudio/);
    expect(readRepo("app/api/market/claim/route.ts")).toMatch(/market_drop_claimed/);
    expect(readRepo("app/api/market/claim/route.ts")).not.toMatch(/getMarketDrop/);
    expect(readRepo("app/api/market/feed/route.ts")).toMatch(/Keepa Amazon/);
    expect(readRepo("components/market/drop-market.tsx")).toMatch(
      /Higlou · Floor verificado|Market/,
    );
    expect(readRepo("components/market/drop-market.tsx")).toMatch(
      /MarketProductTile|MarketDetailPanel|MarketEarnGuide/,
    );
    expect(readRepo("components/market/market-live-pulse.tsx")).toMatch(
      /Live|Escaneando Keepa/,
    );
    expect(readRepo("lib/market/route-intent.ts")).toMatch(
      /Vender en Amazon|marketTilePricing/,
    );
    expect(readRepo("components/market/market-product-tile.tsx")).toMatch(
      /Buy Box Amazon|Tendencia|Vender en Amazon/,
    );
    expect(readRepo("components/market/market-earn-guide.tsx")).toMatch(
      /Ganar|Associate tag|Settings/,
    );
    expect(readRepo("lib/market/home-winners.ts")).toMatch(
      /marketDropsToReadyListings/,
    );
    expect(readRepo("components/studio/money-machine-home.tsx")).toMatch(
      /marketDropsToReadyListings|\/market\?drop=/,
    );
    expect(readRepo("lib/market/from-opportunity.ts")).toMatch(
      /withAffiliateAmazonLink/,
    );
    expect(readRepo("components/market/market-detail-panel.tsx")).toMatch(
      /Comparar precios|CheapSourcePanel|Buscar más winners/,
    );
    expect(readRepo("components/market/amazon-price.tsx")).toMatch(
      /AmazonPrice/,
    );
    expect(readRepo("app/api/market/claim/route.ts")).toMatch(
      /dropFromLoose|extractAsin/,
    );
    expect(readRepo("app/api/market/claim/route.ts")).toMatch(
      /ebayReadyImportFields|categoryId/,
    );
    expect(readRepo("components/layout/app-shell.tsx")).toMatch(
      /h-dvh min-h-0 overflow-hidden/,
    );
    expect(readRepo("app/home/page.tsx")).toMatch(/flush/);
    expect(readRepo("app/market/page.tsx")).not.toMatch(/flush/);
    expect(readRepo("app/winners/page.tsx")).not.toMatch(/flush/);
    expect(readRepo("components/winners/find-winners-board.tsx")).toMatch(
      /Ver oportunidades|Find winners/,
    );
    expect(readRepo("components/market/drop-market.tsx")).not.toMatch(
      /Opening the floor/,
    );
    expect(readRepo("components/studio/find-winners-studio.tsx")).toMatch(
      /FindWinnersBoard/,
    );
    expect(readRepo("components/winners/find-winners-board.tsx")).toMatch(
      /WinnerProductTile|WinnerDetailPanel|Arbitraje/,
    );
    expect(readRepo("components/winners/winner-detail-panel.tsx")).toMatch(
      /Importar listing|Precios verificados/,
    );
    expect(readRepo("components/winners/winner-product-tile.tsx")).toMatch(
      /Keep|Demand/,
    );
    expect(readRepo("lib/opportunity/price-board.ts")).toMatch(
      /buildOpportunityPriceBoard/,
    );
    expect(readRepo("lib/opportunity/attach-boards.ts")).toMatch(
      /attachOpportunityBoards/,
    );
    expect(readRepo("app/api/winners/scan/route.ts")).toMatch(
      /attachOpportunityBoards/,
    );
    expect(readRepo("app/api/winners/scan/route.ts")).toMatch(
      /no_results|refundCredits/,
    );
    expect(readRepo("app/api/winners/scan/route.ts")).toMatch(
      /z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(12\)/,
    );
    expect(readRepo("lib/keepa/finder.ts")).toMatch(/KEEPA_SCAN_ROOTS/);
    expect(readRepo("lib/opportunity/amazon-product-winner.ts")).toMatch(
      /isKeepaBuyVelocityWinner/,
    );
    expect(readRepo("components/winners/find-winners-board.tsx")).toMatch(
      /Amazon → eBay|solo cobramos si hay winners/,
    );
    expect(readRepo("lib/opportunity/winner-routes.ts")).toMatch(
      /walmart_to_amazon/,
    );
    expect(readRepo("lib/opportunity/winner-routes.ts")).toMatch(
      /ui: false/,
    );
    expect(readRepo("lib/opportunity/cross-platform.ts")).toMatch(
      /analyzeCrossPlatform/,
    );
    expect(readRepo("app/api/winners/import/route.ts")).toMatch(
      /analyzeCrossPlatform/,
    );
    expect(readRepo("lib/keepa/finder.ts")).toMatch(/keepaFindHotWinners/);
    expect(readRepo("lib/opportunity/categories.ts")).toMatch(
      /All Amazon · hot now/,
    );
    expect(readRepo("lib/opportunity/amazon-product-winner.ts")).toMatch(
      /amazonProductScore/,
    );
    expect(readRepo("lib/market/from-opportunity.ts")).toMatch(
      /No invented catalog/,
    );
  });
});
