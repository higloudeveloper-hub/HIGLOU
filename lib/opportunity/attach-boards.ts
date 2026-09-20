import {
  analyzeCrossPlatform,
  type CrossPlatformAnalysis,
} from "@/lib/opportunity/cross-platform";
import {
  buildOpportunityPriceBoard,
  type OpportunityPriceBoard,
} from "@/lib/opportunity/price-board";
import { withPlatformUrls } from "@/lib/opportunity/platform-links";
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
 * Always stamps Amazon / eBay / Walmart / HD product links for comparison.
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
            model: hit.mpn || undefined,
            mpn: hit.mpn || undefined,
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

      if (analysis?.quotes?.length) {
        const wm = analysis.quotes.find((q) => q.platform === "walmart");
        const hd = analysis.quotes.find((q) => q.platform === "homedepot");
        const eb = analysis.quotes.find((q) => q.platform === "ebay");
        const amz = analysis.quotes.find((q) => q.platform === "amazon");
        next = {
          ...next,
          walmartItemId: wm?.id || next.walmartItemId || null,
          homedepotItemId: hd?.id || next.homedepotItemId || null,
          ebayItemId: eb?.id || next.ebayItemId || null,
          walmartPrice:
            wm?.price != null ? wm.price : (next.walmartPrice ?? null),
          homedepotPrice:
            hd?.price != null ? hd.price : (next.homedepotPrice ?? null),
          ebayPrice:
            eb?.price != null
              ? eb.price
              : (next.ebayActiveLow ?? next.ebayPrice ?? null),
          ebayActiveLow:
            eb?.price != null ? eb.price : (next.ebayActiveLow ?? null),
          amazonPrice:
            amz?.price != null
              ? amz.price
              : (next.buyBoxPrice ?? next.amazonPrice ?? null),
        };
      }

      next = withPlatformUrls(next, analysis?.quotes);

      const overlay = analysis
        ? {
            quotes: analysis.quotes.map((q) => ({
              platform: q.platform,
              price: q.price,
              url: q.url || next.platformUrls?.[q.platform] || null,
            })),
            routes: analysis.routes,
          }
        : {
            quotes: (
              ["amazon", "ebay", "walmart", "homedepot"] as const
            ).map((platform) => ({
              platform,
              price: null as number | null,
              url: next.platformUrls?.[platform] ?? null,
            })),
          };

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
