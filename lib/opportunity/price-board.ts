import {
  estimateEbayReferralFee,
  estimateNetProfit,
} from "@/lib/opportunity/profit";
import { askBasedSalePrice } from "@/lib/opportunity/spread";
import { winnerRouteById } from "@/lib/opportunity/winner-routes";
import type { OpportunityMode, OpportunityProduct } from "@/lib/opportunity/types";
import { amazonProductScore } from "@/lib/opportunity/amazon-product-winner";
import { platformKeep } from "@/lib/opportunity/platform-winner";
import { buildPlatformUrls } from "@/lib/opportunity/platform-links";

export type PlatformKey = "amazon" | "ebay" | "walmart" | "homedepot";

export type OpportunityPlatformPrice = {
  platform: PlatformKey;
  label: string;
  price: number | null;
  role: "buy" | "sell" | "other";
  note?: string;
  /** Product or search URL so the seller can open the live listing. */
  url?: string | null;
};

export type OpportunityRouteProfit = {
  mode: OpportunityMode;
  label: string;
  buy: number;
  sell: number;
  keep: number;
  active: boolean;
};

export type OpportunityPriceBoard = {
  platforms: OpportunityPlatformPrice[];
  routes: OpportunityRouteProfit[];
  activeKeep: number | null;
  activeBuy: number | null;
  activeSell: number | null;
  demandScore: number | null;
  kind: "keep" | "demand";
};

function money(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function routeLabel(mode: OpportunityMode): string {
  return winnerRouteById(mode).label;
}

function pushRoute(
  routes: OpportunityRouteProfit[],
  mode: OpportunityMode,
  buy: number | null,
  sell: number | null,
  sellFees: number | null,
  activeMode: OpportunityMode,
) {
  const b = money(buy);
  const s = money(sell);
  if (b == null || s == null || s <= b) return;
  const fee = sellFees ?? estimateEbayReferralFee(s);
  const profit = estimateNetProfit({
    salePrice: s,
    cost: b,
    marketplaceFee: fee,
  });
  if (profit.netProfit == null) return;
  routes.push({
    mode,
    label: routeLabel(mode),
    buy: b,
    sell: s,
    keep: profit.netProfit,
    active: mode === activeMode,
  });
}

/**
 * Build an on-screen price + profit board from a Find Winners hit.
 * Uses prices already found (Amazon / eBay / retail cost). Optional overlay
 * from a fuller cross-platform analysis can merge more quotes.
 */
export function buildOpportunityPriceBoard(
  hit: OpportunityProduct,
  overlay?: {
    quotes?: Array<{
      platform: PlatformKey;
      price: number | null;
      url?: string | null;
    }>;
    routes?: Array<{
      mode: OpportunityMode;
      buy: number;
      sell: number;
      keep: number;
      label: string;
    }>;
  } | null,
): OpportunityPriceBoard {
  const mode = hit.mode || "amazon_to_ebay";
  const amazon = money(
    hit.buyBoxPrice ?? hit.amazonPrice ?? (hit.sourceMarket === "amazon" ? hit.cost : null),
  );
  const ebay = money(
    askBasedSalePrice({
      low: hit.ebayActiveLow,
      median: hit.ebayActiveMedian ?? hit.ebayPrice,
    }) ?? hit.ebayPrice,
  );
  const retailCost =
    hit.sourceMarket === "walmart" || hit.sourceMarket === "homedepot"
      ? money(hit.cost)
      : null;
  const walmart =
    hit.sourceMarket === "walmart" ? retailCost : null;
  const homedepot =
    hit.sourceMarket === "homedepot" ? retailCost : null;

  const byOverlay = new Map(
    (overlay?.quotes || []).map((q) => [q.platform, money(q.price)]),
  );
  const urlOverlay = new Map(
    (overlay?.quotes || [])
      .filter((q) => q.url)
      .map((q) => [q.platform, String(q.url)]),
  );

  const amazonPrice = byOverlay.get("amazon") ?? amazon;
  const ebayPrice = byOverlay.get("ebay") ?? ebay;
  const walmartPrice = byOverlay.get("walmart") ?? walmart;
  const hdPrice = byOverlay.get("homedepot") ?? homedepot;

  const route = winnerRouteById(mode);
  const urls = hit.platformUrls || buildPlatformUrls(hit);
  const platforms: OpportunityPlatformPrice[] = [
    {
      platform: "amazon",
      label: "Amazon",
      price: amazonPrice,
      role:
        route.buy === "Amazon"
          ? "buy"
          : route.sell === "Amazon"
            ? "sell"
            : "other",
      note: hit.amazonRetail ? "Amazon retail" : undefined,
      url: urlOverlay.get("amazon") ?? urls?.amazon ?? null,
    },
    {
      platform: "ebay",
      label: "eBay",
      price: ebayPrice,
      role:
        route.buy === "eBay"
          ? "buy"
          : route.sell === "eBay"
            ? "sell"
            : "other",
      note:
        hit.ebayActiveCount != null && hit.ebayActiveCount > 0
          ? `${hit.ebayActiveCount} asks`
          : undefined,
      url: urlOverlay.get("ebay") ?? urls?.ebay ?? null,
    },
    {
      platform: "walmart",
      label: "Walmart",
      price: walmartPrice,
      role: route.buy === "Walmart" ? "buy" : "other",
      url: urlOverlay.get("walmart") ?? urls?.walmart ?? null,
    },
    {
      platform: "homedepot",
      label: "Home Depot",
      price: hdPrice,
      role: route.buy === "Home Depot" ? "buy" : "other",
      url: urlOverlay.get("homedepot") ?? urls?.homedepot ?? null,
    },
  ];

  const routes: OpportunityRouteProfit[] = [];
  if (overlay?.routes?.length) {
    for (const row of overlay.routes) {
      routes.push({
        mode: row.mode,
        label: row.label || routeLabel(row.mode),
        buy: row.buy,
        sell: row.sell,
        keep: row.keep,
        active: row.mode === mode,
      });
    }
  } else {
    pushRoute(
      routes,
      "amazon_to_ebay",
      amazonPrice,
      ebayPrice,
      hit.ebayFees ?? estimateEbayReferralFee(ebayPrice),
      mode,
    );
    pushRoute(
      routes,
      "walmart_to_ebay",
      walmartPrice,
      ebayPrice,
      hit.ebayFees ?? estimateEbayReferralFee(ebayPrice),
      mode,
    );
    pushRoute(
      routes,
      "walmart_to_amazon",
      walmartPrice,
      amazonPrice,
      hit.amazonFees,
      mode,
    );
    pushRoute(
      routes,
      "homedepot_to_ebay",
      hdPrice,
      ebayPrice,
      hit.ebayFees ?? estimateEbayReferralFee(ebayPrice),
      mode,
    );
    pushRoute(
      routes,
      "homedepot_to_amazon",
      hdPrice,
      amazonPrice,
      hit.amazonFees,
      mode,
    );
    pushRoute(
      routes,
      "ebay_to_amazon",
      ebayPrice,
      amazonPrice,
      hit.amazonFees,
      mode,
    );
  }

  routes.sort((a, b) => b.keep - a.keep);

  const keep = platformKeep(hit);
  const activeRoute = routes.find((r) => r.active) || routes[0] || null;
  const activeBuy =
    money(hit.cost) ??
    (route.buy === "Amazon"
      ? amazonPrice
      : route.buy === "eBay"
        ? ebayPrice
        : route.buy === "Walmart"
          ? walmartPrice
          : route.buy === "Home Depot"
            ? hdPrice
            : activeRoute?.buy ?? null);
  const activeSell =
    money(hit.salePrice) ??
    (route.sell === "eBay"
      ? ebayPrice
      : route.sell === "Amazon"
        ? amazonPrice
        : activeRoute?.sell ?? null);

  const demandOnly =
    mode === "amazon" ||
    (keep == null && (hit.keepa || (hit.bsrDrops90 ?? 0) > 0));

  return {
    platforms,
    routes: routes.slice(0, 4),
    activeKeep: keep ?? activeRoute?.keep ?? null,
    activeBuy,
    activeSell,
    demandScore: demandOnly ? amazonProductScore(hit) : null,
    kind: keep != null || activeRoute ? "keep" : "demand",
  };
}
