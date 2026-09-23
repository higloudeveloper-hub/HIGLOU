/**
 * Keepa Product Finder playbooks used by pro Amazon sellers.
 * Sources: Keepa Product Finder tutorials (reverse sourcing, OA Amazon-OOS,
 * Buy Box corridors, seller vacuum, price-drop / deals browsing).
 *
 * Prices in Finder filters are cents. deltaPercent: negative = price fell.
 */

export const KEEPA_STRATEGY_IDS = [
  "velocity",
  "amazon_oos",
  "price_drop",
  "seller_vacuum",
  "rising_price",
  "hot_deals",
] as const;

export type KeepaStrategyId = (typeof KEEPA_STRATEGY_IDS)[number];

export type KeepaStrategyMeta = {
  id: KeepaStrategyId;
  label: string;
  short: string;
  /** Shown under the chip in Find Winners */
  blurb: string;
  /** Prefer Amazon-absent listing dynamics */
  prefersAmazonAbsent: boolean;
};

export const KEEPA_STRATEGIES: KeepaStrategyMeta[] = [
  {
    id: "velocity",
    label: "Velocity",
    short: "BSR drops",
    blurb: "Más caídas de BSR / 90d + rango de ventas estable (clásico Keepa).",
    prefersAmazonAbsent: true,
  },
  {
    id: "amazon_oos",
    label: "Amazon OOS",
    short: "Amazon fuera",
    blurb:
      "Amazon out of stock / Buy Box 3P — reverse sourcing OA de los pros.",
    prefersAmazonAbsent: true,
  },
  {
    id: "price_drop",
    label: "Price drop",
    short: "Bajó precio",
    blurb: "Buy Box bajó 15–45% en 30d y sigue vendiendo (margen temporal).",
    prefersAmazonAbsent: false,
  },
  {
    id: "seller_vacuum",
    label: "Seller vacuum",
    short: "Salen sellers",
    blurb: "Menos ofertas NEW pero demanda firme — espacio para entrar.",
    prefersAmazonAbsent: true,
  },
  {
    id: "rising_price",
    label: "Rising price",
    short: "Sube precio",
    blurb: "Buy Box subió 15–40% en 30d — listing apreciándose.",
    prefersAmazonAbsent: false,
  },
  {
    id: "hot_deals",
    label: "Hot deals",
    short: "Deals Keepa",
    blurb: "Drops recientes del feed Deals + Finder de descuento fuerte.",
    prefersAmazonAbsent: false,
  },
];

export function isKeepaStrategyId(raw: unknown): raw is KeepaStrategyId {
  return (
    typeof raw === "string" &&
    (KEEPA_STRATEGY_IDS as readonly string[]).includes(raw)
  );
}

export function resolveKeepaStrategy(raw?: string | null): KeepaStrategyId {
  if (raw && isKeepaStrategyId(raw)) return raw;
  return "velocity";
}

export function keepaStrategyMeta(id: KeepaStrategyId): KeepaStrategyMeta {
  return (
    KEEPA_STRATEGIES.find((s) => s.id === id) ||
    KEEPA_STRATEGIES[0]!
  );
}

/**
 * Overlay pro filters onto a base Product Finder selection.
 * Mutates/returns the same object for chaining.
 */
export function applyKeepaStrategyFilters(
  selection: Record<string, unknown>,
  strategy: KeepaStrategyId,
  opts?: { mode?: string },
): Record<string, unknown> {
  const mode = opts?.mode || "amazon";
  const sellOnAmazon = mode === "amazon" || mode === "supplier";

  switch (strategy) {
    case "amazon_oos": {
      // Classic OA reverse-sourcing: Amazon absent, 3P Buy Box, mid BSR, ≤10 NEW.
      selection.availabilityAmazon = [-1];
      selection.buyBoxIsAmazon = false;
      selection.outOfStockPercentage90_gte = 70;
      selection.buyBoxStatsAmazon90_lte = 25;
      selection.avg90_SALES_gte = 1_000;
      selection.avg90_SALES_lte = 100_000;
      selection.current_COUNT_NEW_gte = 1;
      selection.current_COUNT_NEW_lte = 10;
      selection.salesRankDrops90_gte = 8;
      selection.current_BUY_BOX_SHIPPING_gte = 1_200;
      selection.current_BUY_BOX_SHIPPING_lte = 8_000;
      selection.sort = [
        ["avg90_SALES", "asc"],
        ["salesRankDrops90", "desc"],
      ];
      break;
    }
    case "price_drop": {
      // Buy Box fell 15–45% in 30d (Keepa: negative delta = drop).
      selection.deltaPercent30_BUY_BOX_SHIPPING_lte = -15;
      selection.deltaPercent30_BUY_BOX_SHIPPING_gte = -45;
      selection.avg90_SALES_gte = 500;
      selection.avg90_SALES_lte = 150_000;
      selection.salesRankDrops90_gte = 8;
      selection.current_BUY_BOX_SHIPPING_gte = 1_000;
      selection.current_BUY_BOX_SHIPPING_lte = 10_000;
      selection.current_COUNT_NEW_lte = 20;
      selection.sort = [
        ["deltaPercent30_BUY_BOX_SHIPPING", "asc"],
        ["salesRankDrops90", "desc"],
      ];
      if (sellOnAmazon) selection.availabilityAmazon = [-1];
      break;
    }
    case "seller_vacuum": {
      // NEW offer count fell ≥25% in 30d while demand holds.
      selection.deltaPercent30_COUNT_NEW_lte = -25;
      selection.deltaPercent30_COUNT_NEW_gte = -90;
      selection.avg90_SALES_gte = 1_000;
      selection.avg90_SALES_lte = 120_000;
      selection.salesRankDrops90_gte = 10;
      selection.current_COUNT_NEW_gte = 0;
      selection.current_COUNT_NEW_lte = 12;
      selection.current_NEW_gte = 1_200;
      selection.current_NEW_lte = 9_000;
      selection.sort = [
        ["deltaPercent30_COUNT_NEW", "asc"],
        ["salesRankDrops90", "desc"],
      ];
      if (sellOnAmazon) {
        selection.availabilityAmazon = [-1];
        selection.buyBoxIsAmazon = false;
      }
      break;
    }
    case "rising_price": {
      // Buy Box rose 15–40% in 30d (positive delta in Keepa = increase… wait:
      // Keepa drop% : negative means the number decreased.
      // Price rose ⇒ BUY_BOX value went up ⇒ deltaPercent is positive?
      // From cleartheshelf: "input -50 in the 30-day drop from and -25 to" for price UP
      // because they interpret drop% of the price series inverted for appreciation.
      // Keepa docs: "A negative value means the number has decreased."
      // So price UP = positive deltaPercent. But tutorials use negative for appreciation
      // when filtering "drop from -50 to -25" on Buy Box for items that rose…
      // Actually: if price went from $20→$30, the value increased +50%, delta = +50.
      // The tutorial saying -50 to -25 for "increased in price" is using the field as
      // "% change of price downward" — we'll use positive for rising.
      selection.deltaPercent30_BUY_BOX_SHIPPING_gte = 15;
      selection.deltaPercent30_BUY_BOX_SHIPPING_lte = 45;
      selection.avg90_SALES_gte = 500;
      selection.avg90_SALES_lte = 120_000;
      selection.salesRankDrops90_gte = 8;
      selection.current_BUY_BOX_SHIPPING_gte = 1_500;
      selection.current_BUY_BOX_SHIPPING_lte = 10_000;
      selection.current_COUNT_NEW_lte = 18;
      selection.sort = [
        ["deltaPercent30_BUY_BOX_SHIPPING", "desc"],
        ["salesRankDrops90", "desc"],
      ];
      break;
    }
    case "hot_deals": {
      // Strong recent NEW discount + live deal-ish band.
      selection.deltaPercent30_NEW_lte = -20;
      selection.deltaPercent30_NEW_gte = -60;
      selection.avg90_SALES_gte = 500;
      selection.avg90_SALES_lte = 180_000;
      selection.salesRankDrops90_gte = 5;
      selection.current_NEW_gte = 800;
      selection.current_NEW_lte = 10_000;
      selection.current_RATING_gte = 35;
      selection.sort = [
        ["deltaPercent30_NEW", "asc"],
        ["salesRankDrops90", "desc"],
      ];
      break;
    }
    case "velocity":
    default:
      // Base tone filters already applied by buildKeepaFinderSelection.
      // Mild pro polish: prefer monthlySold when present, keep drop sort.
      selection.monthlySold_gte = 50;
      break;
  }

  return selection;
}

/** Keepa Browsing Deals selection — ~5 tokens / 150 deals. */
export function buildKeepaDealSelection(opts: {
  rootCategory?: string;
  page?: number;
}): Record<string, unknown> {
  const includeCategories = opts.rootCategory?.trim()
    ? [Number(opts.rootCategory.trim())].filter((n) => Number.isFinite(n) && n > 0)
    : [];
  return {
    page: opts.page ?? 0,
    domainId: 1,
    excludeCategories: [] as number[],
    includeCategories,
    // Amazon + NEW + Buy Box shipping
    priceTypes: [0, 1, 18],
    // Absolute $ drop band (cents) — soft floor
    deltaRange: [300, 80_000],
    // Percent drop 20–70%
    deltaPercentRange: [20, 70],
    deltaLastRange: [20, 70],
    salesRankRange: [100, 200_000],
    currentRange: [800, 12_000],
    minRating: 35,
    isLowest: false,
    isLowestOffer: false,
    filterErotic: true,
    hasReviews: true,
    singleVariation: true,
    // Last ~1 day of deal feed
    dateRange: 1,
    sortType: 1,
  };
}
