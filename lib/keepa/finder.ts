import { keepaBudgetOk, keepaMaxProductsPerScan } from "@/lib/keepa/budget";
import { setCachedKeepaProduct, takeCachedKeepaProducts } from "@/lib/keepa/cache";
import { keepaGet, keepaPost, keepaQuery } from "@/lib/keepa/client";
import { parseKeepaProduct, type KeepaSnapshot } from "@/lib/keepa/parse";
import {
  applyKeepaStrategyFilters,
  buildKeepaDealSelection,
  resolveKeepaStrategy,
  type KeepaStrategyId,
} from "@/lib/keepa/strategies";
import { OPPORTUNITY_CATEGORIES } from "@/lib/opportunity/categories";

/** Keepa Product Finder requires perPage ≥ 50 (~11 tokens / page). */
export const KEEPA_FINDER_MIN_PER_PAGE = 50;

/** Demand floor used in strict category scans. */
export const KEEPA_MIN_BSR_DROPS_90 = 15;

/** Root categories we rotate for general opportunity scans (proven US browse nodes). */
export const KEEPA_SCAN_ROOTS: Array<{ id: string; label: string }> = [
  { id: "1055398", label: "Home & Kitchen" },
  { id: "1064954", label: "Office Products" },
  { id: "2619533011", label: "Pet Supplies" },
  { id: "228013", label: "Tools & Home Improvement" },
  { id: "165793011", label: "Toys & Games" },
  { id: "3760901", label: "Health & Household" },
  { id: "2617941011", label: "Arts & Crafts" },
  { id: "16310091", label: "Industrial & Scientific" },
];

function asinsFromKeepa(json: Record<string, unknown>): string[] {
  const list = json.asinList;
  if (Array.isArray(list)) {
    return list
      .map((row) => String(row || "").toUpperCase())
      .filter((asin) => /^[A-Z0-9]{10}$/.test(asin));
  }
  return [];
}

function rootCategoryIds(raw?: string): number[] | undefined {
  if (!raw?.trim()) return undefined;
  const id = Number(raw.trim());
  if (!Number.isFinite(id) || id <= 0) return undefined;
  return [id];
}

export type KeepaFinderTone = "strict" | "open" | "wide";

/**
 * Product Finder selection — rooted in how sellers actually use Keepa:
 * always set rootCategory, prefer avg90 BSR + Buy Box / NEW, BSR drops for velocity.
 * Prices are cents. Never stack too many narrow filters.
 */
export function buildKeepaFinderSelection(opts: {
  rootCategory?: string;
  title?: string;
  perPage?: number;
  mode?: "amazon" | "amazon_to_ebay" | "supplier" | string;
  page?: number;
  tone?: KeepaFinderTone;
  strategy?: KeepaStrategyId | string | null;
}): Record<string, unknown> {
  const mode = opts.mode || "amazon_to_ebay";
  const tone = opts.tone || "open";
  const strategy = resolveKeepaStrategy(opts.strategy);
  const perPage = Math.max(
    KEEPA_FINDER_MIN_PER_PAGE,
    Math.min(opts.perPage ?? KEEPA_FINDER_MIN_PER_PAGE, 50),
  );
  const buyOnAmazon = mode === "amazon_to_ebay";
  // Strategy playbooks own Amazon presence — skip default availability overlays.
  const strategyOwnsAvailability =
    strategy === "amazon_oos" ||
    strategy === "price_drop" ||
    strategy === "seller_vacuum" ||
    strategy === "hot_deals" ||
    strategy === "rising_price";

  // Core discovery — fewer hard filters = results. Tighten in enrich pass.
  const selection: Record<string, unknown> = {
    page: opts.page ?? 0,
    perPage,
    productType: [0],
    singleVariation: true,
    sort: [
      ["salesRankDrops90", "desc"],
      ["avg90_SALES", "asc"],
    ],
  };

  if (tone === "strict") {
    selection.avg90_SALES_gte = 1_000;
    selection.avg90_SALES_lte = 80_000;
    selection.avg90_NEW_gte = 1_500;
    selection.avg90_NEW_lte = 8_000;
    selection.salesRankDrops90_gte = KEEPA_MIN_BSR_DROPS_90;
    selection.current_COUNT_NEW_gte = 2;
    selection.current_COUNT_NEW_lte = 15;
    selection.current_RATING_gte = 38;
  } else if (tone === "open") {
    // Classic seller Product Finder band: mid BSR, live NEW price, real drops.
    selection.avg90_SALES_gte = 500;
    selection.avg90_SALES_lte = 150_000;
    selection.current_NEW_gte = 1_200;
    selection.current_NEW_lte = 10_000;
    selection.salesRankDrops90_gte = 10;
    selection.current_COUNT_NEW_gte = 1;
    selection.current_COUNT_NEW_lte = 25;
  } else {
    // wide — last resort, still needs a root
    selection.current_SALES_gte = 1;
    selection.current_SALES_lte = 250_000;
    selection.current_NEW_gte = 1_000;
    selection.current_NEW_lte = 12_000;
    selection.salesRankDrops90_gte = 5;
  }

  // Sell-on-Amazon OA: Amazon absent (classic filter from Keepa tutorials).
  if (!strategyOwnsAvailability && (mode === "amazon" || mode === "supplier")) {
    selection.availabilityAmazon = [-1];
    if (tone !== "wide") {
      selection.current_COUNT_NEW_gte = 2;
      selection.current_COUNT_NEW_lte = tone === "strict" ? 12 : 15;
    }
  }

  // Buy-on-Amazon arbitrage: Amazon preferably in stock so we can source it.
  if (!strategyOwnsAvailability && buyOnAmazon && tone !== "wide") {
    selection.availabilityAmazon = [0];
  }

  const roots = rootCategoryIds(opts.rootCategory);
  if (roots) selection.rootCategory = roots;

  if (opts.title?.trim() && opts.title.trim().split(/\s+/).length >= 3) {
    selection.title = [opts.title.trim()];
  }

  // Pro playbooks overlay last so they win conflicts with tone defaults.
  applyKeepaStrategyFilters(selection, strategy, { mode });

  // Wide tone softens strategy floors so we still get results.
  if (tone === "wide" && strategy !== "velocity") {
    if (typeof selection.salesRankDrops90_gte === "number") {
      selection.salesRankDrops90_gte = Math.min(
        Number(selection.salesRankDrops90_gte),
        5,
      );
    }
    delete selection.monthlySold_gte;
  }

  return selection;
}

/** Product Finder: ~11 tokens. Returns ASINs only. */
export async function keepaFindAsins(opts: {
  rootCategory?: string;
  title?: string;
  perPage?: number;
  mode?: "amazon" | "amazon_to_ebay" | "supplier" | string;
  page?: number;
  tone?: KeepaFinderTone;
  strategy?: KeepaStrategyId | string | null;
}): Promise<string[]> {
  if (!keepaBudgetOk(12)) return [];
  // Keepa without rootCategory returns a random catalog slice — always require a root.
  if (!opts.rootCategory?.trim()) return [];
  const selection = buildKeepaFinderSelection(opts);
  const json = await keepaQuery(selection);
  return [...new Set(asinsFromKeepa(json))].slice(0, 50);
}

/**
 * Keepa Browsing Deals — recent price drops (~5 tokens / page).
 * Used by the hot_deals pro playbook.
 */
export async function keepaBrowseDealAsins(opts: {
  rootCategory?: string;
  page?: number;
}): Promise<string[]> {
  if (!keepaBudgetOk(6)) return [];
  try {
    const selection = buildKeepaDealSelection(opts);
    const json = await keepaPost("deal", {}, selection);
    const deals = Array.isArray((json as { deals?: unknown }).deals)
      ? ((json as { deals: Array<{ asin?: string }> }).deals)
      : [];
    const asins: string[] = [];
    for (const row of deals) {
      if (!row || typeof row !== "object") continue;
      const asin = String(row.asin || "").toUpperCase();
      if (/^[A-Z0-9]{10}$/.test(asin)) asins.push(asin);
    }
    return [...new Set(asins)].slice(0, 50);
  } catch {
    return [];
  }
}

function rootsForScan(preferred?: string): string[] {
  if (preferred?.trim()) return [preferred.trim()];
  const fromCategories = OPPORTUNITY_CATEGORIES.filter((c) => c.keepaRoot).map(
    (c) => c.keepaRoot,
  );
  const merged = [
    ...fromCategories,
    ...KEEPA_SCAN_ROOTS.map((r) => r.id),
  ];
  return [...new Set(merged.filter(Boolean))];
}

/**
 * Real opportunity scan: rotate Keepa root categories until we have ASINs.
 * Never queries without a rootCategory (Keepa's documented requirement for useful results).
 * Optional `strategy` applies pro Product Finder playbooks (OA OOS, price drop, etc.).
 */
export async function keepaFindHotWinners(opts: {
  mode?: "amazon" | "amazon_to_ebay" | "supplier" | string;
  rootCategory?: string;
  title?: string;
  seed?: number;
  preferGlobal?: boolean;
  maxRoots?: number;
  strategy?: KeepaStrategyId | string | null;
}): Promise<{
  asins: string[];
  scope: "global" | "category" | "wide" | "deals";
  rootUsed: string;
  strategy: KeepaStrategyId;
}> {
  const mode = opts.mode || "amazon_to_ebay";
  const strategy = resolveKeepaStrategy(opts.strategy);
  const page = Math.abs(opts.seed ?? 0) % 3;
  const roots = rootsForScan(opts.rootCategory);
  const start = Math.abs(opts.seed ?? 0) % Math.max(roots.length, 1);
  const ordered = [
    ...roots.slice(start),
    ...roots.slice(0, start),
  ].slice(0, opts.maxRoots ?? (opts.preferGlobal === false ? 2 : 5));

  // Hot deals: prefer Keepa /deal feed first, then Finder discount stack.
  if (strategy === "hot_deals") {
    for (const root of ordered.slice(0, 3)) {
      const dealAsins = await keepaBrowseDealAsins({
        rootCategory: root,
        page: Math.abs(opts.seed ?? 0) % 2,
      });
      if (dealAsins.length) {
        return {
          asins: dealAsins,
          scope: "deals",
          rootUsed: root,
          strategy,
        };
      }
    }
  }

  const tones: KeepaFinderTone[] = ["open", "strict", "wide"];

  for (const root of ordered) {
    for (const tone of tones) {
      try {
        const asins = await keepaFindAsins({
          mode,
          rootCategory: root,
          title: opts.title,
          page,
          tone,
          strategy,
        });
        if (asins.length) {
          return {
            asins,
            scope: opts.rootCategory ? "category" : "global",
            rootUsed: root,
            strategy,
          };
        }
      } catch {
        /* try next */
      }
    }
  }

  // Strategy too tight → fall back to classic velocity so the board isn't empty.
  if (strategy !== "velocity") {
    for (const root of ordered.slice(0, 2)) {
      try {
        const asins = await keepaFindAsins({
          mode,
          rootCategory: root,
          title: opts.title,
          page,
          tone: "open",
          strategy: "velocity",
        });
        if (asins.length) {
          return {
            asins,
            scope: "wide",
            rootUsed: root,
            strategy: "velocity",
          };
        }
      } catch {
        /* try next */
      }
    }
  }

  return {
    asins: [],
    scope: "global",
    rootUsed: ordered[0] || "",
    strategy,
  };
}

/** Keyword search: ~10 tokens. Use only when finder returned nothing. */
export async function keepaSearchAsins(term: string): Promise<string[]> {
  const clean = term.trim();
  if (!clean || !keepaBudgetOk(10)) return [];
  const json = await keepaGet("search", { type: "product", term: clean });
  return [...new Set(asinsFromKeepa(json))].slice(0, 20);
}

/**
 * Hydrate ASINs with stats (no csv history). 1 token / ASIN.
 */
export async function keepaProducts(asins: string[]): Promise<KeepaSnapshot[]> {
  const clean = [...new Set(asins.map((asin) => asin.toUpperCase()))].filter(
    (asin) => /^[A-Z0-9]{10}$/.test(asin),
  );
  if (!clean.length) return [];

  const capped = clean.slice(0, keepaMaxProductsPerScan());
  const { hits, missing } = takeCachedKeepaProducts(capped);
  if (!missing.length) return hits;
  if (!keepaBudgetOk(missing.length)) return hits;

  const json = await keepaGet("product", {
    asin: missing.join(","),
    stats: 90,
    history: 0,
    rating: 1,
  });
  const products = Array.isArray(json.products) ? json.products : [];
  const fresh = products
    .map((row) => parseKeepaProduct(row as Record<string, unknown>))
    .filter((row): row is KeepaSnapshot => Boolean(row));
  for (const snap of fresh) setCachedKeepaProduct(snap);
  const byAsin = new Map<string, KeepaSnapshot>();
  for (const snap of [...hits, ...fresh]) byAsin.set(snap.asin, snap);
  return capped
    .map((asin) => byAsin.get(asin))
    .filter((row): row is KeepaSnapshot => Boolean(row));
}
