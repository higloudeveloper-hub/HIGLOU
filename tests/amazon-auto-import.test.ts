import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  amazonWinnerKeywords,
  ebayProfitPrice,
  isWeakAmazonReview,
  pickAmazonWinners,
  pickReviewedWinners,
  sortAmazonWinners,
  winnerHitsFromCatalogPayload,
} from "@/lib/amazon/winner-rank";
import {
  amazonWinnerSearchText,
  AMAZON_WINNER_CATEGORIES,
} from "@/lib/amazon/winner-categories";
import {
  parseAmazonSearchHtml,
  parseAmazonSearchMarkdown,
} from "@/lib/amazon/parse-search";
import {
  scoreAmazonOpportunity,
  sortByOpportunity,
} from "@/lib/amazon/opportunity";

function readRepo(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), "utf8");
}

describe("Amazon auto-import ranking", () => {
  it("maps a ready category to Amazon search text", () => {
    expect(AMAZON_WINNER_CATEGORIES.some((row) => row.id === "home")).toBe(
      true,
    );
    expect(amazonWinnerSearchText("home", "organizer")).toEqual({
      query: "organizer",
      category: "home kitchen storage organizer",
    });
  });
  it("builds keywords from a model and category without the seed ASIN", () => {
    expect(
      amazonWinnerKeywords("B0BVHK7GTF", "network testers", "Klein ET450 Toner Probe Kit"),
    ).toMatch(/network testers Klein ET450 Toner Probe/i);
    expect(
      amazonWinnerKeywords("B0BVHK7GTF", "network testers", "Klein ET450 Toner Probe Kit"),
    ).not.toMatch(/B0BVHK7GTF/);
  });

  it("ranks best-reviewed winners ahead of weak reviews", () => {
    const ranked = sortAmazonWinners([
      {
        asin: "B0LOWREV01",
        salesRank: 20,
        rating: 3.1,
        reviewCount: 400,
      },
      {
        asin: "B0WINNER01",
        salesRank: 8,
        rating: 4.8,
        reviewCount: 2100,
      },
      {
        asin: "B0SLOW0010",
        salesRank: 80000,
        rating: 4.9,
        reviewCount: 12,
      },
    ]);
    expect(ranked[0].asin).toBe("B0WINNER01");
  });

  it("drops weak reviews when enough strong products remain", () => {
    expect(
      isWeakAmazonReview({ rating: 3.2, reviewCount: 80 }),
    ).toBe(true);
    const picked = pickAmazonWinners(
      [
        { asin: "B0WEAK0001", salesRank: 5, rating: 3.2, reviewCount: 80 },
        { asin: "B0GOOD0001", salesRank: 12, rating: 4.6, reviewCount: 400 },
        { asin: "B0GOOD0002", salesRank: 18, rating: 4.5, reviewCount: 220 },
        { asin: "B0GOOD0003", salesRank: 30, rating: 4.4, reviewCount: 90 },
      ],
      3,
    );
    expect(picked.map((row) => row.asin)).not.toContain("B0WEAK0001");
    expect(picked).toHaveLength(3);
  });

  it("one-click pick keeps only 4-star winners with real review volume", () => {
    const picked = pickReviewedWinners(
      [
        { asin: "B0WEAK0001", salesRank: 2, rating: 3.8, reviewCount: 900 },
        { asin: "B0GOOD0001", salesRank: 40, rating: 4.7, reviewCount: 300 },
        { asin: "B0GOOD0002", salesRank: 55, rating: 4.5, reviewCount: 80 },
        { asin: "B0THIN0001", salesRank: 8, rating: 4.9, reviewCount: 3 },
      ],
      3,
    );
    expect(picked.map((row) => row.asin)).toEqual(["B0GOOD0001", "B0GOOD0002"]);
  });

  it("marks Now when Amazon is selling and eBay pays more", () => {
    expect(
      scoreAmazonOpportunity({
        salesRank: 1200,
        salesRankLabel: "Beauty",
        rating: 4.6,
        reviewCount: 400,
        amazonPrice: 20,
        ebayPrice: 32,
      }).label,
    ).toBe("now");
    expect(
      scoreAmazonOpportunity({
        salesRank: 1,
        salesRankLabel: "Amazon search",
        rating: 4.6,
        reviewCount: 400,
        amazonPrice: 20,
        ebayPrice: 32,
      }).label,
    ).toBe("watch");
    expect(
      sortByOpportunity([
        {
          asin: "B0THIN0001",
          opportunity: "thin" as const,
          salesRank: 2,
          rating: 4,
          reviewCount: 10,
        },
        {
          asin: "B0NOW00001",
          opportunity: "now" as const,
          salesRank: 90,
          rating: 4.5,
          reviewCount: 80,
        },
        {
          asin: "B0WATCH001",
          opportunity: "watch" as const,
          salesRank: 8,
          rating: 4.4,
          reviewCount: 40,
        },
      ]).map((row) => row.asin),
    ).toEqual(["B0NOW00001", "B0WATCH001", "B0THIN0001"]);
  });

  it("sets an eBay price above Amazon so there is margin", () => {
    expect(ebayProfitPrice(20)).toBe(25.99);
    expect(ebayProfitPrice(10, 18)).toBe(18);
    expect(ebayProfitPrice(null)).toBeNull();
  });

  it("reads sales rank and main image from catalog payload", () => {
    const hits = winnerHitsFromCatalogPayload({
      items: [
        {
          asin: "B0TESTASIN",
          summaries: [
            {
              itemName: "Klein toner probe",
              brand: "Klein Tools",
              browseClassification: {
                classificationId: "123",
                displayName: "Network Testers",
              },
            },
          ],
          images: [
            {
              marketplaceId: "ATVPDKIKX0DER",
              images: [
                {
                  variant: "MAIN",
                  link: "https://m.media-amazon.com/images/I/71main.jpg",
                },
              ],
            },
          ],
          salesRanks: [
            {
              marketplaceId: "ATVPDKIKX0DER",
              classificationRanks: [
                { title: "Network Testers", rank: 14 },
              ],
              displayGroupRanks: [{ title: "Tools", rank: 90 }],
            },
          ],
        },
      ],
    });
    expect(hits[0]).toMatchObject({
      asin: "B0TESTASIN",
      brand: "Klein Tools",
      salesRank: 14,
      salesRankLabel: "Network Testers",
      imageUrl: "https://m.media-amazon.com/images/I/71main.jpg",
    });
  });

  it("reads winners from a public Amazon search page without seller API", () => {
    const html = `
      <div data-component-type="s-search-result" data-asin="B0WINNER01">
        <h2><a href="/dp/B0WINNER01"><span>Olaplex No. 3 Hair Perfector</span></a></h2>
        <span class="a-icon-alt">4.6 out of 5 stars</span>
        <span>32,104 ratings</span>
        <span class="a-price-whole">28</span><span class="a-price-fraction">00</span>
        <img src="https://m.media-amazon.com/images/I/71beauty.jpg" />
      </div>
      <div class="AdHolder" data-component-type="s-search-result" data-asin="B0SPONSOR1">
        <h2><span>Sponsored cream</span></h2>
        <span class="a-icon-alt">3.2 out of 5 stars</span>
      </div>
      <div data-component-type="s-search-result" data-asin="B0WINNER02">
        <h2><span>CeraVe Moisturizing Cream</span></h2>
        <span class="a-icon-alt">4.8 out of 5 stars</span>
        <span>90,221 ratings</span>
        <span>$16.99</span>
      </div>
    `;
    const hits = parseAmazonSearchHtml(html);
    expect(hits.map((row) => row.asin)).toEqual(["B0WINNER01", "B0WINNER02"]);
    expect(hits[0].rating).toBe(4.6);
    expect(hits[0].reviewCount).toBe(32104);
    expect(hits[0].amazonPrice).toBe(28);
    expect(hits[1].amazonPrice).toBe(16.99);
  });

  it("reads ASINs from a Jina Amazon search page", () => {
    const hits = parseAmazonSearchMarkdown(`
      [Olaplex No. 3](https://www.amazon.com/dp/B0WINNER01)
      4.6 out of 5 stars 32,104 ratings
      $28.00
    `);
    expect(hits[0]).toMatchObject({
      asin: "B0WINNER01",
      rating: 4.6,
      reviewCount: 32104,
      amazonPrice: 28,
    });
  });
});

describe("Amazon auto-import stays an eBay draft flow", () => {
  it("lets the seller pick a category, count, and which winners to import", () => {
    const dock = readRepo("components/listing/wizard/catalog-import-dock.tsx");
    const panel = readRepo("components/listing/wizard/amazon-auto-import.tsx");
    const workspace = readRepo("components/listing/new-listing-workspace.tsx");
    const importRoute = readRepo("app/api/amazon/auto-import/route.ts");
    const search = readRepo("app/api/amazon/auto-import/search/route.ts");
    const categories = readRepo("lib/opportunity/categories.ts");
    expect(dock).toMatch(/Find winners/);
    expect(panel).toMatch(/Find opportunities/);
    expect(panel).toMatch(/Only show products I can sell/);
    expect(panel).toMatch(/Choose a category/);
    expect(panel).toMatch(/How many/);
    expect(panel).toMatch(/type="checkbox"/);
    expect(panel).toMatch(/Import \$\{selected\.length\} for eBay/);
    expect(panel).toMatch(/settings#amazon-store/);
    expect(panel).toMatch(/settings#ebay-store/);
    expect(panel).toMatch(/active listings, not sold/);
    expect(categories).toMatch(/Home & Kitchen/);
    expect(categories).toMatch(/Tools & Home/);
    expect(workspace).toMatch(/importAmazonWinners/);
    expect(workspace).toMatch(/JSON\.stringify\(\{ asins: next \}\)/);
    expect(search).toMatch(/loadWinnerMarketTokens/);
    expect(search).toMatch(/limit: body\.limit/);
    expect(search).toMatch(/onlySellable/);
    expect(search).not.toMatch(/status: 409/);
    expect(importRoute).toMatch(/ebayProfitPrice/);
    expect(importRoute).toMatch(/status: "Uploaded"/);
    expect(importRoute).not.toMatch(/publishAmazonOffer/);
    expect(importRoute).not.toMatch(/AMAZON_NOT_CONNECTED/);
    const engine = readRepo("lib/opportunity/engine.ts");
    expect(engine).toMatch(/searchAmazonWinnersPage/);
    expect(engine).toMatch(/keepaFindAsins/);
    expect(engine).toMatch(/checkAmazonEligibility/);
    expect(engine).toMatch(/getAmazonFeesEstimate/);
    expect(engine).toMatch(/searchEbayLivePrices/);
    const tokens = readRepo("lib/amazon/winner-tokens.ts");
    expect(tokens).toMatch(/getValidAmazonAccessToken/);
    expect(tokens).toMatch(/sellingPartnerId/);
    expect(tokens).toMatch(/getValidAccessToken/);
  });
});
