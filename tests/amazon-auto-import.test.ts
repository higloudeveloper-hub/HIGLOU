import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  amazonWinnerKeywords,
  isWeakAmazonReview,
  pickAmazonWinners,
  sortAmazonWinners,
  winnerHitsFromCatalogPayload,
} from "@/lib/amazon/winner-rank";

function readRepo(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), "utf8");
}

describe("Amazon auto-import ranking", () => {
  it("builds keywords from a model and category without the seed ASIN", () => {
    expect(
      amazonWinnerKeywords("B0BVHK7GTF", "network testers", "Klein ET450 Toner Probe Kit"),
    ).toMatch(/network testers Klein ET450 Toner Probe/i);
    expect(
      amazonWinnerKeywords("B0BVHK7GTF", "network testers", "Klein ET450 Toner Probe Kit"),
    ).not.toMatch(/B0BVHK7GTF/);
  });

  it("ranks best-selling and well-reviewed products first", () => {
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
});

describe("Amazon auto-import stays an eBay draft flow", () => {
  it("lets the seller set an eBay price and does not publish to Amazon", () => {
    const dock = readRepo("components/listing/wizard/catalog-import-dock.tsx");
    const panel = readRepo("components/listing/wizard/amazon-auto-import.tsx");
    const workspace = readRepo("components/listing/new-listing-workspace.tsx");
    const search = readRepo("app/api/amazon/auto-import/search/route.ts");
    const importRoute = readRepo("app/api/amazon/auto-import/route.ts");
    expect(dock).toMatch(/Find Amazon bestsellers/);
    expect(panel).toMatch(/Your price/);
    expect(panel).toMatch(/Import \$\{selected\.length\} for eBay/);
    expect(workspace).toMatch(/importAmazonWinners/);
    expect(workspace).toMatch(/price: ebayPrice/);
    expect(search).toMatch(/findAmazonWinners/);
    expect(importRoute).toMatch(/ebayPrice/);
    expect(importRoute).toMatch(/status: "Uploaded"/);
    expect(importRoute).not.toMatch(/publishAmazonOffer/);
    expect(importRoute).not.toMatch(/\/listings\/2021-08-01/);
    expect(search).not.toMatch(/putAmazonListingOffer/);
  });
});
