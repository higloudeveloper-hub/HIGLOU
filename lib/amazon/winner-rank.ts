export type AmazonWinnerHit = {
  asin: string;
  title: string;
  brand: string;
  imageUrl: string;
  salesRank: number | null;
  salesRankLabel: string;
  browseNodeId: string;
  browseNodeName: string;
  rating: number | null;
  reviewCount: number | null;
};

const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "kit",
  "set",
  "pack",
  "new",
  "black",
  "white",
  "amazon",
  "official",
  "product",
]);

export function amazonWinnerKeywords(
  query: string,
  category = "",
  seedTitle = "",
): string {
  const parts = [category, query, seedTitle]
    .join(" ")
    .split(/[^a-z0-9]+/i)
    .map((word) => word.trim())
    .filter((word) => {
      if (word.length < 2) return false;
      if (/^[A-Z0-9]{10}$/i.test(word)) return false;
      return !STOP.has(word.toLowerCase());
    });
  const seen = new Set<string>();
  const words: string[] = [];
  for (const word of parts) {
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    words.push(word);
    if (words.length >= 8) break;
  }
  return words.join(" ");
}

export function amazonSalesRankFromItem(item: Record<string, unknown>): {
  rank: number | null;
  label: string;
} {
  const groups = (item.salesRanks as Array<Record<string, unknown>>) || [];
  let best: { rank: number; label: string } | null = null;
  for (const group of groups) {
    const rows = [
      ...(((group.classificationRanks as Array<Record<string, unknown>>) ||
        []) as Array<Record<string, unknown>>),
      ...(((group.displayGroupRanks as Array<Record<string, unknown>>) ||
        []) as Array<Record<string, unknown>>),
    ];
    for (const row of rows) {
      const rank = Number(row.rank);
      if (!Number.isFinite(rank) || rank <= 0) continue;
      const label = String(
        row.title || row.websiteDisplayGroup || "Amazon",
      ).trim();
      if (!best || rank < best.rank) best = { rank, label };
    }
  }
  return best || { rank: null, label: "" };
}

function catalogMainImage(item: Record<string, unknown>): string {
  const groups = (item.images as Array<Record<string, unknown>>) || [];
  const urls: string[] = [];
  let main = "";
  const walk = (value: unknown) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value !== "object") return;
    const row = value as Record<string, unknown>;
    const link = String(row.link || row.url || "");
    if (/^https:\/\//i.test(link)) {
      urls.push(link);
      if (!main && String(row.variant || "").toUpperCase() === "MAIN") {
        main = link;
      }
    }
    Object.values(row).forEach(walk);
  };
  walk(groups);
  return main || urls[0] || "";
}

export function winnerHitsFromCatalogPayload(
  json: Record<string, unknown>,
): AmazonWinnerHit[] {
  const items = (json.items as Array<Record<string, unknown>> | undefined) || [];
  const seen = new Set<string>();
  const hits: AmazonWinnerHit[] = [];
  for (const item of items) {
    const summaries = (item.summaries as Array<Record<string, unknown>>) || [];
    const summary = summaries[0] || {};
    const asin = String(item.asin || summary.asin || "").toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin) || seen.has(asin)) continue;
    seen.add(asin);
    const browse = summary.browseClassification as
      | { classificationId?: string; displayName?: string }
      | undefined;
    const sales = amazonSalesRankFromItem(item);
    hits.push({
      asin,
      title: String(summary.itemName || "").trim(),
      brand: String(summary.brand || summary.brandName || "").trim(),
      imageUrl: catalogMainImage(item),
      salesRank: sales.rank,
      salesRankLabel: sales.label,
      browseNodeId: browse?.classificationId
        ? String(browse.classificationId)
        : "",
      browseNodeName: browse?.displayName ? String(browse.displayName) : "",
      rating: null,
      reviewCount: null,
    });
  }
  return hits;
}

export function amazonWinnerScore(hit: {
  salesRank: number | null;
  rating: number | null;
  reviewCount: number | null;
}): number {
  const sales =
    hit.salesRank && hit.salesRank > 0
      ? 1 / (1 + Math.log10(hit.salesRank))
      : 0;
  const reviews =
    hit.rating && hit.rating > 0
      ? (hit.rating / 5) *
        (Math.log10(1 + (hit.reviewCount || 0)) / Math.log10(10_001))
      : 0;
  if (sales > 0 && reviews > 0) return 0.55 * sales + 0.45 * reviews;
  return sales || reviews;
}

export function sortAmazonWinners<
  T extends {
    asin: string;
    salesRank: number | null;
    rating: number | null;
    reviewCount: number | null;
  },
>(hits: T[]): T[] {
  return [...hits].sort((a, b) => {
    const delta = amazonWinnerScore(b) - amazonWinnerScore(a);
    if (Math.abs(delta) > 0.0001) return delta;
    const rankA = a.salesRank ?? Number.POSITIVE_INFINITY;
    const rankB = b.salesRank ?? Number.POSITIVE_INFINITY;
    if (rankA !== rankB) return rankA - rankB;
    return a.asin.localeCompare(b.asin);
  });
}

/** Drop clearly poorly reviewed items when Amazon gave us a real rating. */
export function isWeakAmazonReview(hit: {
  rating: number | null;
  reviewCount: number | null;
}): boolean {
  if (hit.rating == null) return false;
  if ((hit.reviewCount || 0) < 15) return false;
  return hit.rating < 3.7;
}

export function pickAmazonWinners<
  T extends {
    asin: string;
    salesRank: number | null;
    rating: number | null;
    reviewCount: number | null;
  },
>(hits: T[], limit = 12): T[] {
  const ranked = sortAmazonWinners(hits);
  const strong = ranked.filter((hit) => !isWeakAmazonReview(hit));
  const pool = strong.length >= 3 ? strong : ranked;
  return pool.slice(0, limit);
}
