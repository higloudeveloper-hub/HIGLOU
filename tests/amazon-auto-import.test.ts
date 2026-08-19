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
import { amazonSearchUrl } from "@/lib/amazon/fetch-search";
import {
  isCrowdedBestseller,
  mergeOpportunityHits,
  nextLiveScanTarget,
  opportunityFingerprint,
  pickCategoryQueries,
  CATEGORY_NICHES,
} from "@/lib/opportunity/niches";
import type { OpportunityProduct } from "@/lib/opportunity/types";
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

  it("maps a caulking tool title to an eBay hand-tools leaf", async () => {
    const { resolveEbayCategory } = await import("@/config/ebay-categories");
    const hit = resolveEbayCategory({
      title: "Saker Silicone Caulking Tool 3-in-1 Grout Removal Tool",
      productType: "caulking tool",
    });
    expect(hit.categoryId).toBe("20779");
  });

  it("rotates specific product types instead of the same Amazon bestsellers", () => {
    const first = pickCategoryQueries({ categoryId: "home", seed: 0, count: 3 });
    const next = pickCategoryQueries({ categoryId: "home", seed: 3, count: 3 });
    expect(first[0]).toBe(CATEGORY_NICHES.home[0]);
    expect(first[1]).not.toBe(CATEGORY_NICHES.home[1]);
    expect(new Set(first).size).toBe(3);
    expect(next[0]).not.toBe(first[0]);
    expect(
      pickCategoryQueries({ categoryId: "home", extra: "nailer", seed: 0 }),
    ).toEqual(["nailer"]);
    expect(isCrowdedBestseller(10_000)).toBe(true);
    expect(isCrowdedBestseller(400)).toBe(false);
    expect(amazonSearchUrl("bamboo drawer organizer", "featured")).not.toMatch(
      /review-rank/,
    );
    expect(nextLiveScanTarget(0)).toMatchObject({
      categoryId: "home",
      label: "Home & Kitchen",
      seed: 0,
      query: CATEGORY_NICHES.home[0],
    });
    expect(nextLiveScanTarget(1).categoryId).toBe("office");
    expect(nextLiveScanTarget(1).query).toBe(CATEGORY_NICHES.office[0]);
    expect(nextLiveScanTarget(8)).toMatchObject({
      categoryId: "home",
      seed: 1,
      query: CATEGORY_NICHES.home[1],
    });
    const merged = mergeOpportunityHits(
      [{ asin: "B0OLD00001", score: 40 } as OpportunityProduct],
      [
        { asin: "B0NEW00001", score: 80 } as OpportunityProduct,
        { asin: "B0OLD00001", score: 55 } as OpportunityProduct,
      ],
    );
    expect(merged[0].asin).toBe("B0NEW00001");
    expect(merged.find((hit) => hit.asin === "B0OLD00001")?.score).toBe(55);
    const kept = mergeOpportunityHits(
      [
        {
          asin: "B0KEEP0001",
          score: 40,
          netProfit: 38.46,
          amazonPrice: 12,
          ebayPrice: 49,
        } as OpportunityProduct,
      ],
      [
        {
          asin: "B0KEEP0001",
          score: 50,
          netProfit: null,
          amazonPrice: null,
          ebayPrice: 49,
        } as OpportunityProduct,
      ],
    );
    expect(kept[0].netProfit).toBe(38.46);
    expect(kept[0].amazonPrice).toBe(12);
    expect(
      opportunityFingerprint(
        "ROYAL CRAFT WOOD Luxury Bamboo Kitchen Drawer Organizer Extra Wide",
      ),
    ).toBe(
      opportunityFingerprint("SpaceAid Bamboo Expandable Drawer Organizer"),
    );
    const sameKind = mergeOpportunityHits(
      [
        {
          asin: "B0BAMBOO01",
          score: 40,
          title: "ROYAL CRAFT WOOD Luxury Bamboo Kitchen Drawer Organizer",
        } as OpportunityProduct,
      ],
      [
        {
          asin: "B0BAMBOO02",
          score: 39,
          title: "SpaceAid Bamboo Expandable Drawer Organizer",
        } as OpportunityProduct,
      ],
    );
    expect(sameKind).toHaveLength(1);
    expect(sameKind[0].asin).toBe("B0BAMBOO01");
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
    const sidebar = readRepo("components/layout/app-sidebar.tsx");
    const winnersPage = readRepo("app/winners/page.tsx");
    const winnersStudio = readRepo("components/studio/find-winners-studio.tsx");
    const importRoute = readRepo("app/api/amazon/auto-import/route.ts");
    const search = readRepo("app/api/amazon/auto-import/search/route.ts");
    const categories = readRepo("lib/opportunity/categories.ts");
    const modes = readRepo("lib/opportunity/mode-copy.ts");
    expect(dock).not.toMatch(/Find winners/);
    expect(dock).not.toMatch(/AmazonAutoImportPanel/);
    expect(sidebar).toMatch(/Find winners/);
    expect(sidebar).toMatch(/href: "\/winners"/);
    expect(winnersPage).toMatch(/FindWinnersStudio/);
    expect(winnersStudio).toMatch(/AmazonAutoImportPanel/);
    expect(winnersStudio).toMatch(/JSON\.stringify\(\{ asins: next, mode, cards: cards \|\| \[\] \}\)/);
    expect(importRoute).toMatch(/listingFromCard/);
    expect(importRoute).toMatch(/fast: true/);
    expect(winnersStudio).toMatch(/\/listings\/\$\{body\.id\}/);
    expect(panel).toMatch(/Live scan/);
    expect(panel).toMatch(/Manual search/);
    expect(panel).toMatch(/Start live scan/);
    expect(panel).toMatch(/Stop live scan/);
    expect(panel).toMatch(/Session spread/);
    expect(panel).toMatch(/MoneyTicker/);
    expect(panel).toMatch(/Just found/);
    expect(panel).toMatch(/You keep/);
    expect(panel).toMatch(/estimatedKeepAmount/);
    expect(panel).toMatch(/Scoring/);
    expect(panel).toMatch(/Est\. eBay profit/);
    expect(panel).toMatch(/Analyzing live/);
    expect(panel).toMatch(/Product name, ASIN, or Amazon link/);
    expect(panel).toMatch(/Find opportunities/);
    expect(panel).toMatch(/Keepa is not connected/);
    expect(panel).toMatch(/seed: nextRound - 1/);
    expect(modes).toMatch(/Import \$\{count\} ready for eBay/);
    expect(modes).toMatch(/Import \$\{count\} for Amazon/);
    expect(modes).toMatch(/Import \$\{count\} for Amazon and eBay/);
    expect(panel).toMatch(/Choose a category/);
    expect(panel).toMatch(/How many/);
    expect(panel).toMatch(/type="checkbox"/);
    expect(modes).toMatch(/Buy on Amazon/);
    expect(modes).toMatch(/Publish on Amazon/);
    expect(modes).toMatch(/Checking if your Amazon account can sell them/);
    expect(panel).toMatch(/sm:grid-cols-2/);
    expect(panel).toMatch(/eBay profit/);
    expect(panel).toMatch(/Amazon profit/);
    expect(panel).toMatch(/settings#amazon-store/);
    expect(panel).toMatch(/settings#ebay-store/);
    expect(panel).toMatch(/active listings, not sold/);
    expect(categories).toMatch(/Home & Kitchen/);
    expect(categories).toMatch(/Tools & Home/);
    expect(workspace).not.toMatch(/importAmazonWinners/);
    expect(workspace).not.toMatch(/onAmazonAutoImport/);
    expect(search).toMatch(/loadWinnerMarketTokens/);
    expect(search).toMatch(/limit: body\.limit/);
    expect(search).toMatch(/onlySellable/);
    expect(search).toMatch(/excludeAsins/);
    expect(search).toMatch(/body\.excludeAsins/);
    expect(search).toMatch(/seed: body\.seed/);
    expect(search).not.toMatch(/status: 409/);
    expect(importRoute).toMatch(/toEbayListingTitle/);
    expect(importRoute).toMatch(/ebayReadyImportFields/);
    expect(importRoute).toMatch(/categoryId: ready\.categoryId/);
    expect(importRoute).toMatch(/status: "Needs Review"/);
    expect(importRoute).toMatch(/ebayProfitPrice/);
    expect(importRoute).toMatch(/id: primarySaved\.id/);
    expect(importRoute).not.toMatch(/publishAmazonOffer/);
    expect(importRoute).not.toMatch(/AMAZON_NOT_CONNECTED/);
    const engine = readRepo("lib/opportunity/engine.ts");
    expect(engine).toMatch(/skipAmazonGate/);
    expect(engine).toMatch(/keepaFindAsins/);
    expect(engine).toMatch(/diversifyOpportunityHits/);
    expect(panel).toMatch(/query: target\.query/);
    expect(engine).toMatch(/isCrowdedBestseller/);
    expect(engine).toMatch(/sort: keepaOn \? "review-rank" : "featured"/);
    expect(engine).toMatch(/checkAmazonEligibility/);
    expect(engine).toMatch(/getAmazonFeesEstimate/);
    expect(engine).toMatch(/searchEbayLivePrices/);
    const publish = readRepo("app/api/ebay/publish/route.ts");
    expect(publish).toMatch(/categoryId: z\.string\(\)\.optional\(\)\.default\(""\)/);
    const tokens = readRepo("lib/amazon/winner-tokens.ts");
    expect(tokens).toMatch(/getValidAmazonAccessToken/);
    expect(tokens).toMatch(/sellingPartnerId/);
    expect(tokens).toMatch(/getValidAccessToken/);
  });
});
