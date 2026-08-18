import { parseAmazonLink } from "@/lib/amazon/asin";
import { searchAmazonWinnersPage } from "@/lib/amazon/fetch-search";
import {
  amazonWinnerKeywords,
  pickReviewedWinners,
  type AmazonWinnerHit,
} from "@/lib/amazon/winner-rank";

function seedHit(asin: string): AmazonWinnerHit {
  return {
    asin,
    title: "",
    brand: "",
    imageUrl: "",
    salesRank: null,
    salesRankLabel: "",
    browseNodeId: "",
    browseNodeName: "",
    rating: null,
    reviewCount: null,
    amazonPrice: null,
  };
}

export async function findAmazonWinners(opts: {
  query: string;
  category?: string;
  limit?: number;
  pageOrigin?: string;
}): Promise<AmazonWinnerHit[]> {
  const query = String(opts.query || "").trim();
  const category = String(opts.category || "").trim();
  if (!query && !category) {
    throw new Error("Type the product you want Higlou to find.");
  }

  const asin = parseAmazonLink(query)?.asin || "";
  if (asin && !category) return [seedHit(asin)];

  const keywords =
    amazonWinnerKeywords(asin ? "" : query, category) || category || query;
  const hits = await searchAmazonWinnersPage({
    keywords,
    pageOrigin: opts.pageOrigin,
  });
  if (asin) hits.unshift(seedHit(asin));
  if (!hits.length) {
    throw new Error(
      "Amazon found no products for that. Try a clearer name, like nailer or toner probe.",
    );
  }
  return pickReviewedWinners(hits, opts.limit ?? 5);
}
