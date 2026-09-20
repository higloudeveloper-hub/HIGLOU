import type { OpportunityMode } from "@/lib/opportunity/types";

/** Two plays the seller picks first — then a concrete buy→sell route. */
export type WinnerPlay = "arbitrage" | "amazon_direct";

export type WinnerRoute = {
  id: OpportunityMode;
  play: WinnerPlay;
  group: "arbitrage" | "retail" | "demand";
  label: string;
  buy: string;
  sell: string;
  hint: string;
  /** Shown in Find Winners UI. Hidden routes stay API-compatible only. */
  ui?: boolean;
};

/**
 * Real routes we ship in the UI.
 * Extra retail modes stay available to the API but are hidden — they rarely
 * return winners and confuse the finder.
 */
export const WINNER_ROUTES: WinnerRoute[] = [
  {
    id: "amazon_to_ebay",
    play: "arbitrage",
    group: "arbitrage",
    label: "Amazon → eBay",
    buy: "Amazon",
    sell: "eBay",
    hint: "Compras en Amazon, vendes en eBay · keep neto",
    ui: true,
  },
  {
    id: "amazon",
    play: "amazon_direct",
    group: "demand",
    label: "Vender en Amazon",
    buy: "Supplier",
    sell: "Amazon",
    hint: "Demanda Keepa · listás directo en Amazon",
    ui: true,
  },
  // API-only (hidden) — kept for older imports / deep links
  {
    id: "ebay_to_amazon",
    play: "arbitrage",
    group: "arbitrage",
    label: "eBay → Amazon",
    buy: "eBay",
    sell: "Amazon",
    hint: "Compras en eBay, listás en Amazon",
    ui: false,
  },
  {
    id: "walmart_to_amazon",
    play: "arbitrage",
    group: "retail",
    label: "Walmart → Amazon",
    buy: "Walmart",
    sell: "Amazon",
    hint: "Retail arb · UPC → Amazon",
    ui: false,
  },
  {
    id: "walmart_to_ebay",
    play: "arbitrage",
    group: "retail",
    label: "Walmart → eBay",
    buy: "Walmart",
    sell: "eBay",
    hint: "Retail arb · UPC → eBay",
    ui: false,
  },
  {
    id: "homedepot_to_amazon",
    play: "arbitrage",
    group: "retail",
    label: "Home Depot → Amazon",
    buy: "Home Depot",
    sell: "Amazon",
    hint: "Retail arb · UPC → Amazon",
    ui: false,
  },
  {
    id: "homedepot_to_ebay",
    play: "arbitrage",
    group: "retail",
    label: "Home Depot → eBay",
    buy: "Home Depot",
    sell: "eBay",
    hint: "Retail arb · UPC → eBay",
    ui: false,
  },
];

export const WINNER_PLAYS: Array<{
  id: WinnerPlay;
  title: string;
  subtitle: string;
  defaultMode: OpportunityMode;
}> = [
  {
    id: "arbitrage",
    title: "Arbitraje",
    subtitle: "Amazon → eBay · keep neto",
    defaultMode: "amazon_to_ebay",
  },
  {
    id: "amazon_direct",
    title: "Vender en Amazon",
    subtitle: "Demanda Keepa · listás en Amazon",
    defaultMode: "amazon",
  },
];

export function winnerRouteById(id: OpportunityMode) {
  return WINNER_ROUTES.find((row) => row.id === id) || WINNER_ROUTES[0]!;
}

export function playForMode(mode: OpportunityMode): WinnerPlay {
  return winnerRouteById(mode).play;
}

/** UI routes only — one clear path per play. */
export function routesForPlay(play: WinnerPlay) {
  return WINNER_ROUTES.filter((row) => row.play === play && row.ui !== false);
}
