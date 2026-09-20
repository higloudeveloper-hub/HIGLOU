import { searchAmazonCatalogByIdentifier } from "@/lib/amazon/sp-api";
import { barcodeSearchKeys } from "@/lib/amazon/catalog-resolve";
import {
  getAmazonFeesEstimate,
  getAmazonLowestNewPrice,
} from "@/lib/amazon/sp-api";
import { searchEbayLivePrices } from "@/lib/ebay/live-prices";
import { searchHomeDepotBestMatch } from "@/lib/homedepot/search-products";
import { fetchHomeDepotProduct } from "@/lib/homedepot/fetch-product";
import { searchWalmartBestMatch } from "@/lib/walmart/search-products";
import { fetchWalmartProduct } from "@/lib/walmart/fetch-product";
import {
  estimateEbayReferralFee,
  estimateNetProfit,
} from "@/lib/opportunity/profit";
import type { OpportunityMode, OpportunitySourceMarket } from "@/lib/opportunity/types";
import { OPPORTUNITY_RULES } from "@/lib/opportunity/types";

export type PlatformPriceQuote = {
  platform: "amazon" | "ebay" | "walmart" | "homedepot";
  price: number | null;
  fees: number | null;
  id: string;
  title: string;
  url: string;
  matchedBy: "upc" | "asin" | "title" | "source" | "none";
};

export type CrossPlatformAnalysis = {
  upc: string;
  asin: string;
  title: string;
  quotes: PlatformPriceQuote[];
  /** Best buy → sell keep after fees (hypothetical). */
  bestKeep: number | null;
  bestRoute: OpportunityMode | null;
  routes: Array<{
    mode: OpportunityMode;
    buy: number;
    sell: number;
    keep: number;
    label: string;
  }>;
  realOpportunity: boolean;
};

function money(n: number | null | undefined) {
  return n != null && Number.isFinite(n) && n > 0 ? n : null;
}

function routeLabel(mode: OpportunityMode): string {
  switch (mode) {
    case "amazon_to_ebay":
      return "Buy Amazon → Sell eBay";
    case "walmart_to_amazon":
      return "Buy Walmart → Sell Amazon";
    case "walmart_to_ebay":
      return "Buy Walmart → Sell eBay";
    case "homedepot_to_amazon":
      return "Buy Home Depot → Sell Amazon";
    case "homedepot_to_ebay":
      return "Buy Home Depot → Sell eBay";
    case "ebay_to_amazon":
      return "Buy eBay → Sell Amazon";
    case "amazon":
      return "Sell on Amazon";
    default:
      return mode;
  }
}

/**
 * Look up the same product across Amazon, eBay, Walmart, Home Depot.
 * UPC/GTIN is strongest; brand+model and short title are fallbacks.\n * Never stop after an empty UPC miss when title search would find the item.
 */
export async function analyzeCrossPlatform(opts: {
  title: string;
  brand?: string;
  model?: string;
  mpn?: string;
  upc?: string;
  asin?: string;
  sourceMarket?: OpportunitySourceMarket | string;
  sourceId?: string;
  sourcePrice?: number | null;
  amazonToken?: string;
  marketplaceId?: string;
  ebayToken?: string;
  pageOrigin?: string;
}): Promise<CrossPlatformAnalysis> {
  const title = String(opts.title || "").trim();
  const brand = String(opts.brand || "").trim();
  const model = String(opts.model || "").trim();
  const mpn = String(opts.mpn || "").trim();
  const upc = String(opts.upc || "").replace(/\D/g, "");
  let asin = String(opts.asin || "")
    .trim()
    .toUpperCase();
  const quotes: PlatformPriceQuote[] = [];
  const retailHints = { title, brand, model, mpn, upc };

  // --- Source quote (already known) ---
  const source = String(opts.sourceMarket || "");
  const sourcePrice = money(opts.sourcePrice);
  if (source === "walmart" && sourcePrice) {
    quotes.push({
      platform: "walmart",
      price: sourcePrice,
      fees: null,
      id: opts.sourceId || "",
      title,
      url: opts.sourceId
        ? `https://www.walmart.com/ip/${opts.sourceId}`
        : "",
      matchedBy: "source",
    });
  }
  if (source === "homedepot" && sourcePrice) {
    quotes.push({
      platform: "homedepot",
      price: sourcePrice,
      fees: null,
      id: opts.sourceId || "",
      title,
      url: opts.sourceId
        ? `https://www.homedepot.com/p/${opts.sourceId}`
        : "",
      matchedBy: "source",
    });
  }
  if (source === "amazon" && sourcePrice) {
    quotes.push({
      platform: "amazon",
      price: sourcePrice,
      fees: null,
      id: asin,
      title,
      url: asin ? `https://www.amazon.com/dp/${asin}` : "",
      matchedBy: "source",
    });
  }

  // --- Amazon via UPC / ASIN ---
  if (opts.amazonToken && opts.marketplaceId) {
    if (!asin && upc.length >= 12) {
      for (const key of barcodeSearchKeys(upc)) {
        try {
          const hits = await searchAmazonCatalogByIdentifier({
            accessToken: opts.amazonToken,
            marketplaceId: opts.marketplaceId,
            identifier: key.identifier,
            identifierType: key.identifierType,
          });
          if (hits[0]?.asin) {
            asin = hits[0].asin.toUpperCase();
            break;
          }
        } catch {
          /* next */
        }
      }
    }
    if (asin) {
      const live = await getAmazonLowestNewPrice({
        accessToken: opts.amazonToken,
        marketplaceId: opts.marketplaceId,
        asin,
      }).catch(() => null);
      const fee =
        live != null
          ? await getAmazonFeesEstimate({
              accessToken: opts.amazonToken,
              marketplaceId: opts.marketplaceId,
              asin,
              price: live,
              fulfillment: "FBM",
            }).catch(() => null)
          : null;
      if (!quotes.some((q) => q.platform === "amazon")) {
        quotes.push({
          platform: "amazon",
          price: live,
          fees: fee,
          id: asin,
          title,
          url: `https://www.amazon.com/dp/${asin}`,
          matchedBy: upc ? "upc" : "asin",
        });
      } else {
        const row = quotes.find((q) => q.platform === "amazon")!;
        row.price = live ?? row.price;
        row.fees = fee;
        row.id = asin;
      }
    }
  }

  // --- eBay (app token or user token) ---
  if (opts.ebayToken && (upc || title || model || mpn)) {
    const live = await searchEbayLivePrices({
      accessToken: opts.ebayToken,
      query: title,
      brand,
      model,
      mpn,
      gtin: upc || undefined,
      amazonPrice: quotes.find((q) => q.platform === "amazon")?.price,
    }).catch(() => null);
    if (live && (live.count > 0 || live.low != null || live.median != null)) {
      quotes.push({
        platform: "ebay",
        price: live.low ?? live.median ?? null,
        fees: estimateEbayReferralFee(live.low ?? live.median ?? null),
        id: live.sampleItemId || "",
        title: live.sampleTitle || title,
        url: live.sampleItemUrl || "",
        matchedBy: live.matchedByGtin ? "upc" : "title",
      });
    }
  }

  // --- Walmart (skip if already from source) ---
  if (!quotes.some((q) => q.platform === "walmart") && (upc || title || model)) {
    try {
      const matched = await searchWalmartBestMatch(retailHints, { limit: 8 });
      if (matched?.hit) {
        let price = matched.hit.price;
        let resolvedUpc = matched.hit.upc || "";
        try {
          const detail = await fetchWalmartProduct(
            `https://www.walmart.com/ip/${matched.hit.itemId}`,
            { pageOrigin: opts.pageOrigin },
          );
          price = detail.price ?? price;
          resolvedUpc = detail.upc || resolvedUpc;
        } catch {
          /* seed price */
        }
        const upcHit =
          Boolean(resolvedUpc && upc && resolvedUpc.replace(/\D/g, "") === upc);
        quotes.push({
          platform: "walmart",
          price: money(price),
          fees: null,
          id: matched.hit.itemId,
          title: matched.hit.title || title,
          url: `https://www.walmart.com/ip/${matched.hit.itemId}`,
          matchedBy: upcHit || matched.matchedBy === "upc" ? "upc" : "title",
        });
      }
    } catch {
      /* optional */
    }
  }

  // --- Home Depot ---
  if (
    !quotes.some((q) => q.platform === "homedepot") &&
    (upc || title || model)
  ) {
    try {
      const matched = await searchHomeDepotBestMatch(retailHints, { limit: 8 });
      if (matched?.hit) {
        let price = matched.hit.price;
        let resolvedUpc = matched.hit.upc;
        try {
          const detail = await fetchHomeDepotProduct(
            `https://www.homedepot.com/p/${matched.hit.itemId}`,
            { pageOrigin: opts.pageOrigin },
          );
          price = detail.price ?? price;
          resolvedUpc = detail.upc || resolvedUpc;
        } catch {
          /* seed */
        }
        const upcHit =
          Boolean(resolvedUpc && upc && resolvedUpc.replace(/\D/g, "") === upc);
        quotes.push({
          platform: "homedepot",
          price: money(price),
          fees: null,
          id: matched.hit.itemId,
          title: matched.hit.title || title,
          url: `https://www.homedepot.com/p/${matched.hit.itemId}`,
          matchedBy: upcHit || matched.matchedBy === "upc" ? "upc" : "title",
        });
      }
    } catch {
      /* optional */
    }
  }

  const amazon = quotes.find((q) => q.platform === "amazon");
  const ebay = quotes.find((q) => q.platform === "ebay");
  const walmart = quotes.find((q) => q.platform === "walmart");
  const homedepot = quotes.find((q) => q.platform === "homedepot");

  const routes: CrossPlatformAnalysis["routes"] = [];

  const pushRoute = (
    mode: OpportunityMode,
    buy: number | null | undefined,
    sell: number | null | undefined,
    sellFees: number | null | undefined,
  ) => {
    const b = money(buy);
    const s = money(sell);
    if (b == null || s == null || s <= b) return;
    const profit = estimateNetProfit({
      salePrice: s,
      cost: b,
      marketplaceFee: sellFees ?? null,
    });
    const keep = profit.netProfit;
    if (keep == null) return;
    routes.push({
      mode,
      buy: b,
      sell: s,
      keep,
      label: routeLabel(mode),
    });
  };

  pushRoute(
    "amazon_to_ebay",
    amazon?.price,
    ebay?.price,
    ebay?.fees ?? estimateEbayReferralFee(ebay?.price ?? null),
  );
  pushRoute(
    "walmart_to_ebay",
    walmart?.price,
    ebay?.price,
    ebay?.fees ?? estimateEbayReferralFee(ebay?.price ?? null),
  );
  pushRoute(
    "walmart_to_amazon",
    walmart?.price,
    amazon?.price,
    amazon?.fees,
  );
  pushRoute(
    "homedepot_to_ebay",
    homedepot?.price,
    ebay?.price,
    ebay?.fees ?? estimateEbayReferralFee(ebay?.price ?? null),
  );
  pushRoute(
    "homedepot_to_amazon",
    homedepot?.price,
    amazon?.price,
    amazon?.fees,
  );
  pushRoute(
    "ebay_to_amazon",
    ebay?.price,
    amazon?.price,
    amazon?.fees,
  );

  routes.sort((a, b) => b.keep - a.keep);
  const best = routes[0] || null;
  const realOpportunity = Boolean(
    best && best.keep >= OPPORTUNITY_RULES.minWinnerProfit,
  );

  return {
    upc,
    asin,
    title,
    quotes,
    bestKeep: best?.keep ?? null,
    bestRoute: best?.mode ?? null,
    routes,
    realOpportunity,
  };
}

/** Item specifics + blurb for a listing draft from cross-platform analysis. */
export function crossPlatformToListingFields(analysis: CrossPlatformAnalysis) {
  const by = Object.fromEntries(
    analysis.quotes.map((q) => [q.platform, q]),
  ) as Record<string, PlatformPriceQuote | undefined>;

  const specifics: Array<{
    key: string;
    label: string;
    value: string;
    isCustom: boolean;
  }> = [];

  const add = (label: string, price: number | null | undefined, id?: string) => {
    if (price == null) return;
    specifics.push({
      key: `C:${label.replace(/\s/g, "")}`,
      label,
      value: id ? `$${price.toFixed(2)} (${id})` : `$${price.toFixed(2)}`,
      isCustom: true,
    });
  };

  add("Amazon price", by.amazon?.price, by.amazon?.id);
  add("eBay ask", by.ebay?.price);
  add("Walmart price", by.walmart?.price, by.walmart?.id);
  add("Home Depot price", by.homedepot?.price, by.homedepot?.id);

  if (analysis.bestRoute && analysis.bestKeep != null) {
    specifics.push({
      key: "C:BestRoute",
      label: "Best route",
      value: `${routeLabel(analysis.bestRoute)} · keep ~$${analysis.bestKeep.toFixed(2)}`,
      isCustom: true,
    });
  }

  const lines = analysis.quotes
    .filter((q) => q.price != null)
    .map(
      (q) =>
        `${q.platform}: $${q.price!.toFixed(2)}${q.id ? ` [${q.id}]` : ""}`,
    );

  const routeLines = analysis.routes.slice(0, 4).map(
    (r) =>
      `${r.label}: buy $${r.buy.toFixed(2)} → sell $${r.sell.toFixed(2)} · keep $${r.keep.toFixed(2)}`,
  );

  const summary = [
    "Cross-platform prices (Higlou verified at import)",
    ...lines,
    ...(routeLines.length ? ["", "Real routes:", ...routeLines] : []),
  ].join("\n");

  return { specifics, summary, listPrice: analysis.routes[0]?.sell ?? null };
}
