import type { OpportunityMode } from "@/lib/opportunity/types";

/** Organized Find Winners routes — buy market → sell market. */
export const WINNER_ROUTES: Array<{
  id: OpportunityMode;
  group: "arbitrage" | "retail" | "demand";
  label: string;
  buy: string;
  sell: string;
  hint: string;
}> = [
  {
    id: "amazon_to_ebay",
    group: "arbitrage",
    label: "Amazon → eBay",
    buy: "Amazon",
    sell: "eBay",
    hint: "Keepa hot movers + eBay ask keep",
  },
  {
    id: "amazon",
    group: "demand",
    label: "Sell on Amazon",
    buy: "Supplier",
    sell: "Amazon",
    hint: "Keepa demand · BSR velocity",
  },
  {
    id: "walmart_to_amazon",
    group: "retail",
    label: "Walmart → Amazon",
    buy: "Walmart",
    sell: "Amazon",
    hint: "UPC match · Amazon fees",
  },
  {
    id: "walmart_to_ebay",
    group: "retail",
    label: "Walmart → eBay",
    buy: "Walmart",
    sell: "eBay",
    hint: "UPC match · eBay ask",
  },
  {
    id: "homedepot_to_amazon",
    group: "retail",
    label: "Home Depot → Amazon",
    buy: "Home Depot",
    sell: "Amazon",
    hint: "UPC match · Amazon fees",
  },
  {
    id: "homedepot_to_ebay",
    group: "retail",
    label: "Home Depot → eBay",
    buy: "Home Depot",
    sell: "eBay",
    hint: "UPC match · eBay ask",
  },
  {
    id: "ebay_to_amazon",
    group: "arbitrage",
    label: "eBay → Amazon",
    buy: "eBay",
    sell: "Amazon",
    hint: "GTIN → ASIN · Amazon fees",
  },
];

export function winnerRouteById(id: OpportunityMode) {
  return WINNER_ROUTES.find((row) => row.id === id) || WINNER_ROUTES[0]!;
}
