import { keepaBudgetOk, keepaMaxProductsPerScan } from "@/lib/keepa/budget";
import { setCachedKeepaProduct, takeCachedKeepaProducts } from "@/lib/keepa/cache";
import { keepaGet, keepaQuery } from "@/lib/keepa/client";
import { parseKeepaProduct, type KeepaSnapshot } from "@/lib/keepa/parse";
import { OPPORTUNITY_RULES } from "@/lib/opportunity/types";

/** Keepa Product Finder requires perPage ≥ 50 (~11 tokens / page). */
export const KEEPA_FINDER_MIN_PER_PAGE = 50;

/** Demand floor for Product Finder — velocity before anyone else. */
export const KEEPA_MIN_BSR_DROPS_90 = 10;

function asinsFromKeepa(json: Record<string, unknown>): string[] {
  const list = json.asinList;
  if (Array.isArray(list)) {
    return list
      .map((row) => String(row || "").toUpperCase())
      .filter((asin) => /^[A-Z0-9]{10}$/.test(asin));
  }
  const products = json.products;
  if (Array.isArray(products)) {
    return products
      .map((row) => String((row as { asin?: string }).asin || "").toUpperCase())
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
 * Shared selection for Product Finder.
 * Opportunity-first: sort by BSR drops. Category is optional.
 */
export function buildKeepaFinderSelection(opts: {
  rootCategory?: string;
  title?: string;
  perPage?: number;
  mode?: "amazon" | "amazon_to_ebay" | "supplier" | string;
  page?: number;
  /** strict = category-tight; open = global hot; wide = last-resort relax */
  tone?: KeepaFinderTone;
}): Record<string, unknown> {
  const mode = opts.mode || "amazon_to_ebay";
  const tone = opts.tone || (opts.rootCategory ? "strict" : "open");
  const perPage = Math.max(
    KEEPA_FINDER_MIN_PER_PAGE,
    Math.min(opts.perPage ?? KEEPA_FINDER_MIN_PER_PAGE, 50),
  );

  const dropsGte =
    tone === "wide" ? 6 : tone === "open" ? KEEPA_MIN_BSR_DROPS_90 : 12;
  const priceMin =
    tone === "wide"
      ? 10
      : OPPORTUNITY_RULES.minPrice;
  const priceMax =
    tone === "wide"
      ? 150
      : OPPORTUNITY_RULES.maxPrice;
  const bsrMin = tone === "wide" ? 200 : OPPORTUNITY_RULES.minBsr;
  const bsrMax = tone === "wide" ? 250_000 : OPPORTUNITY_RULES.maxBsr;

  const selection: Record<string, unknown> = {
    page: opts.page ?? 0,
    perPage,
    current_NEW_gte: Math.round(priceMin * 100),
    current_NEW_lte: Math.round(priceMax * 100),
    current_SALES_gte: bsrMin,
    current_SALES_lte: bsrMax,
    salesRankDrops90_gte: dropsGte,
    sort: [
      ["salesRankDrops90", "desc"],
      ["current_SALES", "asc"],
    ],
    productType: [0, 1],
  };

  if (tone !== "wide") {
    selection.packageWeight_lte = Math.round(
      OPPORTUNITY_RULES.maxPackageLb * 453.592,
    );
  }

  if (mode === "amazon" || mode === "supplier") {
    selection.current_COUNT_NEW_gte = OPPORTUNITY_RULES.minSellers;
    selection.current_COUNT_NEW_lte =
      tone === "wide" ? 20 : OPPORTUNITY_RULES.maxSellers;
    selection.availabilityAmazon = [-1];
  }

  const roots = rootCategoryIds(opts.rootCategory);
  if (roots) selection.rootCategory = roots;

  // Only exact product titles — short keywords make finder miss.
  if (opts.title?.trim() && opts.title.trim().split(/\s+/).length >= 3) {
    selection.title = [opts.title.trim()];
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
}): Promise<string[]> {
  if (!keepaBudgetOk(12)) return [];
  const selection = buildKeepaFinderSelection(opts);
  const json = await keepaQuery(selection);
  return [...new Set(asinsFromKeepa(json))].slice(0, 40);
}

/**
 * Opportunity-first Keepa scan — no category required.
 * Tries open global → wider filters → optional category root.
 * ~11–33 tokens worst case (stops early when ASINs found).
 */
export async function keepaFindHotWinners(opts: {
  mode?: "amazon" | "amazon_to_ebay" | "supplier" | string;
  rootCategory?: string;
  title?: string;
  seed?: number;
  preferGlobal?: boolean;
}): Promise<{ asins: string[]; scope: "global" | "category" | "wide" }> {
  const mode = opts.mode || "amazon_to_ebay";
  const page = Math.abs(opts.seed ?? 0) % 5;
  const preferGlobal = opts.preferGlobal !== false;

  const attempts: Array<{
    scope: "global" | "category" | "wide";
    tone: KeepaFinderTone;
    rootCategory?: string;
    page: number;
  }> = [];

  if (preferGlobal || !opts.rootCategory) {
    attempts.push({ scope: "global", tone: "open", page });
    attempts.push({
      scope: "global",
      tone: "open",
      page: (page + 1) % 5,
    });
  }
  if (opts.rootCategory) {
    attempts.push({
      scope: "category",
      tone: "strict",
      rootCategory: opts.rootCategory,
      page: 0,
    });
  }
  attempts.push({ scope: "wide", tone: "wide", page: 0 });

  for (const attempt of attempts) {
    try {
      const asins = await keepaFindAsins({
        mode,
        rootCategory: attempt.rootCategory,
        title: opts.title,
        page: attempt.page,
        tone: attempt.tone,
      });
      if (asins.length) {
        return { asins, scope: attempt.scope };
      }
    } catch {
      /* try next tone */
    }
  }
  return { asins: [], scope: preferGlobal ? "global" : "category" };
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
 * Uses in-memory cache so live/manual rescans do not re-bill.
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
    .map((row) => parseKeepaProduct(row))
    .filter((row): row is KeepaSnapshot => Boolean(row));
  for (const snap of fresh) setCachedKeepaProduct(snap);
  const byAsin = new Map<string, KeepaSnapshot>();
  for (const snap of [...hits, ...fresh]) byAsin.set(snap.asin, snap);
  return capped
    .map((asin) => byAsin.get(asin))
    .filter((row): row is KeepaSnapshot => Boolean(row));
}
