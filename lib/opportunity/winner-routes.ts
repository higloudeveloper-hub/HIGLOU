import type { OpportunityMode } from "@/lib/opportunity/types";

/** Finder plays shown in Find Winners (arbitrage removed from UI). */
export type WinnerPlay = "amazon_direct";

export type WinnerRoute = {
  id: OpportunityMode;
  play: WinnerPlay | "arbitrage";
  group: "arbitrage" | "retail" | "demand";
  label: string;
  buy: string;
  sell: string;
  hint: string;
  /** Shown in Find Winners UI. Hidden routes stay API-compatible only. */
  ui?: boolean;
};

/**
 * Find Winners UI is demand-first: verified trending Amazon winners with
 * multi-platform prices. Arbitrage / retail modes stay API-compatible only.
 */
export const WINNER_ROUTES: WinnerRoute[] = [
  {
    id: "amazon",
    play: "amazon_direct",
    group: "demand",
    label: "Winners verificados",
    buy: "Supplier",
    sell: "Amazon",
    hint: "Tendencias Keepa · precios en cada plataforma",
    ui: true,
  },
  // API-only (hidden) — Market / imports / older ledgers still use these
  {
    id: "amazon_to_ebay",
    play: "arbitrage",
    group: "arbitrage",
    label: "Amazon → eBay",
    buy: "Amazon",
    sell: "eBay",
    hint: "Compras en Amazon, vendes en eBay · keep neto",
    ui: false,
  },
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
    id: "amazon_direct",
    title: "Winners",
    subtitle: "Verificados · tendencias · precios multi-plataforma",
    defaultMode: "amazon",
  },
];

export function winnerRouteById(id: OpportunityMode) {
  return WINNER_ROUTES.find((row) => row.id === id) || WINNER_ROUTES[0]!;
}

export function playForMode(mode: OpportunityMode): WinnerPlay {
  const play = winnerRouteById(mode).play;
  return play === "amazon_direct" ? "amazon_direct" : "amazon_direct";
}

/** UI routes only — demand winners in the finder. */
export function routesForPlay(play: WinnerPlay) {
  return WINNER_ROUTES.filter((row) => row.play === play && row.ui !== false);
}

export function finderUiRoutes() {
  return WINNER_ROUTES.filter((row) => row.ui !== false);
}
