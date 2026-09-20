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
};

/** Organized Find Winners routes — buy market → sell market. */
export const WINNER_ROUTES: WinnerRoute[] = [
  {
    id: "amazon_to_ebay",
    play: "arbitrage",
    group: "arbitrage",
    label: "Amazon → eBay",
    buy: "Amazon",
    sell: "eBay",
    hint: "Compras en Amazon, vendes en eBay · keep neto",
  },
  {
    id: "ebay_to_amazon",
    play: "arbitrage",
    group: "arbitrage",
    label: "eBay → Amazon",
    buy: "eBay",
    sell: "Amazon",
    hint: "Compras en eBay, listás en Amazon",
  },
  {
    id: "walmart_to_amazon",
    play: "arbitrage",
    group: "retail",
    label: "Walmart → Amazon",
    buy: "Walmart",
    sell: "Amazon",
    hint: "Retail arb · UPC → Amazon",
  },
  {
    id: "walmart_to_ebay",
    play: "arbitrage",
    group: "retail",
    label: "Walmart → eBay",
    buy: "Walmart",
    sell: "eBay",
    hint: "Retail arb · UPC → eBay",
  },
  {
    id: "homedepot_to_amazon",
    play: "arbitrage",
    group: "retail",
    label: "Home Depot → Amazon",
    buy: "Home Depot",
    sell: "Amazon",
    hint: "Retail arb · UPC → Amazon",
  },
  {
    id: "homedepot_to_ebay",
    play: "arbitrage",
    group: "retail",
    label: "Home Depot → eBay",
    buy: "Home Depot",
    sell: "eBay",
    hint: "Retail arb · UPC → eBay",
  },
  {
    id: "amazon",
    play: "amazon_direct",
    group: "demand",
    label: "Vender en Amazon",
    buy: "Supplier",
    sell: "Amazon",
    hint: "Demanda Keepa · listás directo en Amazon",
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
    subtitle: "Compras en un market · vendes en otro · keep neto",
    defaultMode: "amazon_to_ebay",
  },
  {
    id: "amazon_direct",
    title: "Vender en Amazon",
    subtitle: "Productos con demanda · listás directo en Amazon",
    defaultMode: "amazon",
  },
];

export function winnerRouteById(id: OpportunityMode) {
  return WINNER_ROUTES.find((row) => row.id === id) || WINNER_ROUTES[0]!;
}

export function playForMode(mode: OpportunityMode): WinnerPlay {
  return winnerRouteById(mode).play;
}

export function routesForPlay(play: WinnerPlay) {
  return WINNER_ROUTES.filter((row) => row.play === play);
}
