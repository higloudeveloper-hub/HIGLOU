import type { MarketDropPublic } from "@/lib/market/from-opportunity";
import { marketSpread } from "@/lib/market/catalog";

export type MarketPlay =
  | "sell_amazon"
  | "sell_ebay"
  | "source_supply";

export type TrendLevel = "hot" | "high" | "rising" | "steady";

export type MarketTilePricing =
  | { mode: "spread"; buy: number; sell: number; keep: number }
  | { mode: "single"; price: number; label: string };

/** Clear play the user should take — not a vague platform label. */
export function marketPlay(item: MarketDropPublic): {
  play: MarketPlay;
  badge: string;
  action: string;
  hint: string;
} {
  if (item.lane === "amazon") {
    return {
      play: "sell_amazon",
      badge: "Vender en Amazon",
      action: "Listar en Amazon",
      hint: "Demanda Keepa verificada · Buy Box real",
    };
  }
  if (item.lane === "retail") {
    return {
      play: "source_supply",
      badge: "Buscar suministro",
      action: "Sourcing → vender",
      hint: "Retail barato · margen marketplace",
    };
  }
  return {
    play: "sell_ebay",
    badge: "Vender en eBay",
    action: "Arbitraje Amazon → eBay",
    hint: "Compra Amazon · vende eBay · keep neto",
  };
}

/**
 * Trend strength from Keepa BSR drops + heat — never invented %.
 * Progress is a visual of verified velocity, not a fake forecast.
 */
export function marketTrend(item: MarketDropPublic): {
  level: TrendLevel;
  label: string;
  /** 0–100 visual fill from verified signals */
  progress: number;
  detail: string;
} {
  const drops = item.bsrDrops90 ?? 0;
  const demand = item.demandScore ?? item.score ?? 0;

  if (item.heat === "hot" || drops >= 40 || demand >= 85) {
    return {
      level: "hot",
      label: "Hot",
      progress: Math.min(100, 78 + Math.min(drops, 40) * 0.4),
      detail:
        drops > 0
          ? `${drops} caídas BSR / 90d · tendencia fuerte`
          : "Señal Hot · Keepa verificado",
    };
  }
  if (item.heat === "warm" || drops >= 22 || demand >= 74) {
    return {
      level: "high",
      label: "Alta",
      progress: Math.min(88, 58 + Math.min(drops, 30) * 0.7),
      detail:
        drops > 0
          ? `${drops} caídas BSR / 90d · demanda alta`
          : "Demanda alta · Keepa",
    };
  }
  if (drops >= 10 || demand >= 60) {
    return {
      level: "rising",
      label: "Subiendo",
      progress: Math.min(72, 42 + Math.min(drops, 20) * 1.1),
      detail:
        drops > 0
          ? `${drops} caídas BSR / 90d · subiendo`
          : "Velocidad en alza",
    };
  }
  return {
    level: "steady",
    label: "Estable",
    progress: Math.max(28, Math.min(48, 24 + demand * 0.2)),
    detail: "Analizado · banda estable",
  };
}

/**
 * Pricing for tiles: never show Compra = Venta.
 * Amazon demand lane → single Buy Box. Arb with no keep → single price.
 */
export function marketTilePricing(item: MarketDropPublic): MarketTilePricing {
  const keep = item.netProfit ?? marketSpread(item);
  const buy = item.buy;
  const sell = item.sell;
  const same =
    Number.isFinite(buy) &&
    Number.isFinite(sell) &&
    Math.abs(buy - sell) < 0.5;

  if (item.lane === "amazon" || (same && !(keep > 0 && item.lane !== "amazon"))) {
    const price =
      item.amazonPrice ??
      (item.lane === "amazon" ? sell : buy) ??
      sell ??
      buy;
    return {
      mode: "single",
      price,
      label: item.lane === "amazon" ? "Buy Box Amazon" : "Precio",
    };
  }

  if (item.lane !== "amazon" && keep > 0 && !same) {
    return { mode: "spread", buy, sell, keep };
  }

  // Fallback single when spread is noise
  return {
    mode: "single",
    price: sell || buy,
    label: "Precio",
  };
}

export function hasArbitrageKeep(item: MarketDropPublic): boolean {
  if (item.lane === "amazon") return false;
  const keep = item.netProfit ?? marketSpread(item);
  if (!(keep > 0)) return false;
  return Math.abs(item.buy - item.sell) >= 0.5;
}
