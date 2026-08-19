import { keepaGet, keepaPost } from "@/lib/keepa/client";
import { parseKeepaProduct, type KeepaSnapshot } from "@/lib/keepa/parse";
import { OPPORTUNITY_RULES } from "@/lib/opportunity/types";

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

/** Product Finder: price, BSR, 90-day discount, weight. */
export async function keepaFindAsins(opts: {
  rootCategory?: string;
  title?: string;
  perPage?: number;
  mode?: "amazon" | "amazon_to_ebay" | "supplier";
}): Promise<string[]> {
  const mode = opts.mode || "amazon_to_ebay";
  const selection: Record<string, unknown> = {
    current_NEW_gte: Math.round(OPPORTUNITY_RULES.minPrice * 100),
    current_NEW_lte: Math.round(OPPORTUNITY_RULES.maxPrice * 100),
    current_SALES_gte: OPPORTUNITY_RULES.minBsr,
    current_SALES_lte: OPPORTUNITY_RULES.maxBsr,
    deltaPercent90_NEW_lte: -Math.round(OPPORTUNITY_RULES.minDiscount90 * 100),
    packageWeight_lte: Math.round(OPPORTUNITY_RULES.maxPackageLb * 453.592),
    perPage: Math.min(opts.perPage ?? 20, 50),
    sort: [["current_SALES", "asc"]],
  };
  if (mode === "amazon" || mode === "supplier") {
    selection.current_COUNT_NEW_gte = OPPORTUNITY_RULES.minSellers;
    selection.current_COUNT_NEW_lte = OPPORTUNITY_RULES.maxSellers;
    selection.availabilityAmazon = [-1];
  }
  if (opts.rootCategory) selection.rootCategory = [opts.rootCategory];
  if (opts.title) selection.title = [opts.title];
  const json = await keepaPost(
    "query",
    { selection: JSON.stringify(selection) },
    selection,
  );
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
