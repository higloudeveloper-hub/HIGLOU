import { keepaGet, keepaQuery } from "@/lib/keepa/client";
import { parseKeepaProduct, type KeepaSnapshot } from "@/lib/keepa/parse";
import { OPPORTUNITY_RULES } from "@/lib/opportunity/types";

/** Keepa Product Finder requires perPage ≥ 50. */
export const KEEPA_FINDER_MIN_PER_PAGE = 50;

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

/** Shared selection for Product Finder — tested without burning tokens. */
export function buildKeepaFinderSelection(opts: {
  rootCategory?: string;
  title?: string;
  perPage?: number;
  mode?: "amazon" | "amazon_to_ebay" | "supplier" | string;
  page?: number;
}): Record<string, unknown> {
  const mode = opts.mode || "amazon_to_ebay";
  const perPage = Math.max(
    KEEPA_FINDER_MIN_PER_PAGE,
    Math.min(opts.perPage ?? KEEPA_FINDER_MIN_PER_PAGE, 100),
  );
  const selection: Record<string, unknown> = {
    page: opts.page ?? 0,
    perPage,
    current_NEW_gte: Math.round(OPPORTUNITY_RULES.minPrice * 100),
    current_NEW_lte: Math.round(OPPORTUNITY_RULES.maxPrice * 100),
    current_SALES_gte: OPPORTUNITY_RULES.minBsr,
    current_SALES_lte: OPPORTUNITY_RULES.maxBsr,
    deltaPercent90_NEW_lte: -Math.round(OPPORTUNITY_RULES.minDiscount90 * 100),
    packageWeight_lte: Math.round(OPPORTUNITY_RULES.maxPackageLb * 453.592),
    sort: [["current_SALES", "asc"]],
    productType: [0, 1],
  };
  if (mode === "amazon" || mode === "supplier") {
    selection.current_COUNT_NEW_gte = OPPORTUNITY_RULES.minSellers;
    selection.current_COUNT_NEW_lte = OPPORTUNITY_RULES.maxSellers;
    selection.availabilityAmazon = [-1];
  }
  const roots = rootCategoryIds(opts.rootCategory);
  if (roots) selection.rootCategory = roots;
  if (opts.title?.trim()) selection.title = [opts.title.trim()];
  return selection;
}

/** Product Finder: price, BSR, 90-day discount, weight. */
export async function keepaFindAsins(opts: {
  rootCategory?: string;
  title?: string;
  perPage?: number;
  mode?: "amazon" | "amazon_to_ebay" | "supplier" | string;
}): Promise<string[]> {
  const selection = buildKeepaFinderSelection(opts);
  const json = await keepaQuery(selection);
  return [...new Set(asinsFromKeepa(json))].slice(0, 40);
}

export async function keepaSearchAsins(term: string): Promise<string[]> {
  const json = await keepaGet("search", { type: "product", term });
  return [...new Set(asinsFromKeepa(json))].slice(0, 20);
}

export async function keepaProducts(asins: string[]): Promise<KeepaSnapshot[]> {
  const clean = [...new Set(asins.map((asin) => asin.toUpperCase()))].filter(
    (asin) => /^[A-Z0-9]{10}$/.test(asin),
  );
  if (!clean.length) return [];
  const json = await keepaGet("product", {
    asin: clean.slice(0, 20).join(","),
    stats: 90,
    history: 1,
  });
  const products = Array.isArray(json.products) ? json.products : [];
  return products
    .map((row) => parseKeepaProduct(row))
    .filter((row): row is KeepaSnapshot => Boolean(row));
}
