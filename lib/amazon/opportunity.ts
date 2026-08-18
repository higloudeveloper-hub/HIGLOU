export type OpportunityLabel = "now" | "watch" | "thin";

export function scoreAmazonOpportunity(hit: {
  salesRank: number | null;
  salesRankLabel?: string;
  rating: number | null;
  reviewCount: number | null;
  amazonPrice: number | null;
  ebayPrice?: number | null;
}): { label: OpportunityLabel; reason: string; spread: number | null } {
  const amazon = hit.amazonPrice && hit.amazonPrice > 0 ? hit.amazonPrice : null;
  const ebay = hit.ebayPrice && hit.ebayPrice > 0 ? hit.ebayPrice : null;
  const spread =
    amazon && ebay ? Math.round((ebay - amazon) * 100) / 100 : null;
  const catalogRank =
    hit.salesRankLabel === "Amazon search" ? null : hit.salesRank;
  const selling =
    catalogRank != null && catalogRank > 0 && catalogRank <= 80_000;
  const loved = (hit.rating ?? 0) >= 4 && (hit.reviewCount ?? 0) >= 10;
  const margin =
    spread != null && amazon != null && spread >= Math.max(4, amazon * 0.2);

  if (loved && selling && margin) {
    return {
      label: "now",
      reason: "Selling on Amazon and eBay pays more right now",
      spread,
    };
  }
  if (loved && selling) {
    return {
      label: "watch",
      reason: "Moving on Amazon. Check the eBay price.",
      spread,
    };
  }
  if (loved && margin) {
    return {
      label: "watch",
      reason: "eBay is paying more than Amazon",
      spread,
    };
  }
  return {
    label: "thin",
    reason: "Not enough live sales signal yet",
    spread,
  };
}

export function sortByOpportunity<
  T extends {
    asin: string;
    opportunity?: OpportunityLabel;
    salesRank: number | null;
    rating: number | null;
    reviewCount: number | null;
  },
>(hits: T[]): T[] {
  const rank = { now: 0, watch: 1, thin: 2 };
  return [...hits].sort((a, b) => {
    const left = rank[a.opportunity || "thin"];
    const right = rank[b.opportunity || "thin"];
    if (left !== right) return left - right;
    const rankA = a.salesRank ?? Number.POSITIVE_INFINITY;
    const rankB = b.salesRank ?? Number.POSITIVE_INFINITY;
    if (rankA !== rankB) return rankA - rankB;
    return a.asin.localeCompare(b.asin);
  });
}
