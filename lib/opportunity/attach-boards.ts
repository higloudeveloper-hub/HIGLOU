import {
  analyzeCrossPlatform,
  type CrossPlatformAnalysis,
} from "@/lib/opportunity/cross-platform";
import {
  buildOpportunityPriceBoard,
  type OpportunityPriceBoard,
} from "@/lib/opportunity/price-board";
import type { OpportunityProduct } from "@/lib/opportunity/types";

export type OpportunityWithBoard = OpportunityProduct & {
  priceBoard: OpportunityPriceBoard;
  crossPlatform?: {
    bestKeep: number | null;
    bestRoute: string | null;
    quotes: CrossPlatformAnalysis["quotes"];
    routes: CrossPlatformAnalysis["routes"];
  };
};

/**
 * Attach a price/profit board to each winner. Optionally deep-check other
 * platforms (Walmart / Home Depot) when tokens/time allow — capped at 5.
 */
export async function attachOpportunityBoards(
  hits: OpportunityProduct[],
  opts?: {
    amazonToken?: string;
    marketplaceId?: string;
    ebayToken?: string;
    deep?: boolean;
  },
): Promise<OpportunityWithBoard[]> {
  const deep = opts?.deep !== false;
  const capped = hits.slice(0, 5);

  return Promise.all(
    capped.map(async (hit) => {
      let analysis: CrossPlatformAnalysis | null = null;
      if (deep && (hit.title || hit.upc || hit.asin)) {
        try {
          analysis = await analyzeCrossPlatform({
            title: hit.title,
            brand: hit.brand,
            upc: hit.upc,
            asin: hit.asin,
            amazonToken: opts?.amazonToken,
            marketplaceId: opts?.marketplaceId,
            ebayToken: opts?.ebayToken,
            sourceMarket: hit.sourceMarket,
            sourceId: hit.sourceId,
            sourcePrice: hit.cost ?? hit.amazonPrice ?? hit.buyBoxPrice,
          });
        } catch {
          analysis = null;
        }
      }

      let next = hit;
      if (
        analysis?.bestKeep != null &&
        (hit.hypotheticalKeep == null ||
          analysis.bestKeep > (hit.hypotheticalKeep ?? 0))
      ) {
        next = { ...hit, hypotheticalKeep: analysis.bestKeep };
      }

      const overlay = analysis
        ? {
            quotes: analysis.quotes.map((q) => ({
              platform: q.platform,
              price: q.price,
            })),
            routes: analysis.routes,
          }
        : null;

      return {
        ...next,
        priceBoard: buildOpportunityPriceBoard(next, overlay),
        crossPlatform: analysis
          ? {
              bestKeep: analysis.bestKeep,
              bestRoute: analysis.bestRoute,
              quotes: analysis.quotes,
              routes: analysis.routes,
            }
          : undefined,
      } satisfies OpportunityWithBoard;
    }),
  );
}
