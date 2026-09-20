import { describe, expect, it } from "vitest";
import { marketDropsToReadyListings } from "@/lib/market/home-winners";
import { resolveHomeCatalog } from "@/components/studio/money-machine-home";
import { READY_LISTINGS } from "@/components/studio/ready-catalog";
import type { MarketDropPublic } from "@/lib/market/from-opportunity";

function drop(
  partial: Partial<MarketDropPublic> & Pick<MarketDropPublic, "id" | "asin">,
): MarketDropPublic {
  return {
    name: "Brand",
    title: "Product",
    blurb: "blurb",
    photo: "https://example.com/a.jpg",
    photos: ["https://example.com/a.jpg"],
    buy: 10,
    sell: 40,
    comps: 45,
    supplier: "Amazon → eBay",
    ships: "2–4 day",
    heat: "hot",
    source: "ledger",
    real: true,
    affiliateUrl: "https://www.amazon.com/dp/B0TESTWIN1?tag=higlou-20",
    netProfit: 18,
    score: 70,
    note: "ok",
    lane: "arbitrage",
    demandScore: null,
    bsrDrops90: null,
    salesRank: null,
    amazonPrice: 10,
    ebayPrice: 40,
    walmartPrice: null,
    homedepotPrice: null,
    platformUrls: {
      amazon: "https://www.amazon.com/dp/B0TESTWIN1?tag=higlou-20",
      ebay: null,
      walmart: null,
      homedepot: null,
    },
    ...partial,
  };
}

describe("home winners from market", () => {
  it("dedupes by ASIN and keeps affiliate + marketId", () => {
    const list = marketDropsToReadyListings(
      [
        drop({ id: "win-B0TESTWIN1", asin: "B0TESTWIN1", title: "First" }),
        drop({ id: "win-B0TESTWIN1-b", asin: "B0TESTWIN1", title: "Dup" }),
        drop({
          id: "win-B0OTHER001",
          asin: "B0OTHER001",
          title: "Second",
          photo: "https://example.com/b.jpg",
        }),
      ],
      8,
    );
    expect(list).toHaveLength(2);
    expect(list[0]?.title).toBe("First");
    expect(list[0]?.marketId).toBe("win-B0TESTWIN1");
    expect(list[0]?.affiliateUrl).toContain("tag=higlou-20");
    expect(list[1]?.asin).toBe("B0OTHER001");
  });

  it("skips drops without photos", () => {
    const list = marketDropsToReadyListings([
      drop({ id: "win-B0NOPHOTO1", asin: "B0NOPHOTO1", photo: "", photos: [] }),
    ]);
    expect(list).toHaveLength(0);
  });
});

describe("resolveHomeCatalog", () => {
  it("prefers live Market winners when present", () => {
    const live = [
      {
        ...READY_LISTINGS[0],
        marketId: "win-1",
        title: "Live Winner",
      },
    ];
    const result = resolveHomeCatalog({
      floorListings: live,
      readyListings: [READY_LISTINGS[1]],
    });
    expect(result.source).toBe("live");
    expect(result.listings[0]?.title).toBe("Live Winner");
  });

  it("falls back to account ready listings, then demo — never blank", () => {
    const account = [{ ...READY_LISTINGS[1], title: "Account Ready" }];
    expect(
      resolveHomeCatalog({ floorListings: [], readyListings: account }).source,
    ).toBe("account");
    expect(
      resolveHomeCatalog({ floorListings: null, readyListings: undefined })
        .source,
    ).toBe("demo");
    expect(
      resolveHomeCatalog({ floorListings: [], readyListings: [] }).listings
        .length,
    ).toBeGreaterThan(0);
  });
});
