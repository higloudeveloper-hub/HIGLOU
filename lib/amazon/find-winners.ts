import { parseAmazonLink } from "@/lib/amazon/asin";
import { parseAmazonReviews } from "@/lib/amazon/parse-product";
import { searchAmazonCatalogWinners } from "@/lib/amazon/sp-api";
import {
  amazonWinnerKeywords,
  pickAmazonWinners,
  sortAmazonWinners,
  type AmazonWinnerHit,
} from "@/lib/amazon/winner-rank";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

function looksLikeUpc(value: string): string {
  const digits = String(value || "").replace(/\D/g, "");
  const compact = String(value || "").replace(/\s+/g, "");
  if (!/^\d{8,14}$/.test(digits)) return "";
  if (digits !== compact) return "";
  return digits;
}

function mergeHits(
  current: AmazonWinnerHit[],
  next: AmazonWinnerHit[],
): AmazonWinnerHit[] {
  const seen = new Set(current.map((hit) => hit.asin));
  const out = [...current];
  for (const hit of next) {
    if (seen.has(hit.asin)) continue;
    seen.add(hit.asin);
    out.push(hit);
  }
  return out;
}

async function enrichWinnerReviews(
  hits: AmazonWinnerHit[],
): Promise<AmazonWinnerHit[]> {
  const top = hits.slice(0, 10);
  const rest = hits.slice(10);
  const enriched = await Promise.all(
    top.map(async (hit) => {
      try {
        const res = await fetch(`https://www.amazon.com/dp/${hit.asin}`, {
          headers: {
            "User-Agent": IPHONE_UA,
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "no-cache",
          },
          redirect: "follow",
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
        });
        const html = await res.text();
        const reviews = parseAmazonReviews(html);
        return {
          ...hit,
          rating: reviews.rating,
          reviewCount: reviews.reviewCount,
        };
      } catch {
        return hit;
      }
    }),
  );
  return [...enriched, ...rest];
}

export async function findAmazonWinners(opts: {
  accessToken: string;
  marketplaceId: string;
  query: string;
  category?: string;
}): Promise<AmazonWinnerHit[]> {
  const query = String(opts.query || "").trim();
  const category = String(opts.category || "").trim();
  if (!query && !category) {
    throw new Error("Enter a product number or a category.");
  }

  const parsed = parseAmazonLink(query);
  const asin = parsed?.asin || "";
  const upc = looksLikeUpc(query);
  let hits: AmazonWinnerHit[] = [];
  let seedTitle = "";
  let classificationId = "";

  if (asin) {
    const seed = await searchAmazonCatalogWinners({
      accessToken: opts.accessToken,
      marketplaceId: opts.marketplaceId,
      identifiers: asin,
      identifiersType: "ASIN",
    });
    hits = mergeHits(hits, seed);
    seedTitle = seed[0]?.title || "";
    classificationId = seed[0]?.browseNodeId || "";
  } else if (upc) {
    const byUpc = await searchAmazonCatalogWinners({
      accessToken: opts.accessToken,
      marketplaceId: opts.marketplaceId,
      identifiers: upc,
      identifiersType: upc.length === 13 ? "EAN" : "UPC",
    });
    hits = mergeHits(hits, byUpc);
    seedTitle = byUpc[0]?.title || "";
    classificationId = byUpc[0]?.browseNodeId || "";
  }

  const keywords =
    amazonWinnerKeywords(asin || upc ? "" : query, category, seedTitle) ||
    category ||
    query;
  if (keywords) {
    const classified = classificationId
      ? await searchAmazonCatalogWinners({
          accessToken: opts.accessToken,
          marketplaceId: opts.marketplaceId,
          keywords,
          classificationIds: classificationId,
        }).catch(() => [] as AmazonWinnerHit[])
      : [];
    hits = mergeHits(hits, classified);
    if (hits.length < 8) {
      const open = await searchAmazonCatalogWinners({
        accessToken: opts.accessToken,
        marketplaceId: opts.marketplaceId,
        keywords,
      });
      hits = mergeHits(hits, open);
    }
  }

  if (!hits.length && query && query !== keywords) {
    hits = await searchAmazonCatalogWinners({
      accessToken: opts.accessToken,
      marketplaceId: opts.marketplaceId,
      keywords: query,
    });
  }

  const ranked = sortAmazonWinners(hits);
  const withReviews = await enrichWinnerReviews(ranked);
  return pickAmazonWinners(withReviews, 12);
}
