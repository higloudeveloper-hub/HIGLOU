import type { EbayAspects } from "@/lib/ebay/inventory-api";
import { getEbayConfig } from "@/lib/ebay/config";

export type AspectCardinality = "SINGLE" | "MULTI";

/** Fallback when Taxonomy metadata is unavailable — prefer SINGLE to avoid 25002. */
const DEFAULT_MULTI_ASPECTS = new Set(
  [
    "Features",
    "Feature",
    "Compatible Brand",
    "Compatible Model",
    "Compatible Product",
    "Theme",
    "Occasion",
    "Pattern",
  ].map((n) => n.toLowerCase()),
);

const FORCE_SINGLE_ASPECTS = new Set(
  [
    "Brand",
    "MPN",
    "Model",
    "Type",
    "Color",
    "Colour",
    "Finish",
    "Material",
    "Size",
    "Size Type",
    "Style",
    "Room",
    "Department",
    "Manufacturer",
    "Country/Region of Manufacture",
    "Country of Origin",
    "Power Source",
    "Voltage",
    "Installation",
    "Mounting Type",
    "Faucet Mounting Type",
    "Number of Faucet Holes",
    "Number of Holes",
    "Number of Lights",
    "Lighting Technology",
    "Shade Shape",
    "Shade Material",
  ].map((n) => n.toLowerCase()),
);

export function defaultCardinalityForAspect(name: string): AspectCardinality {
  const key = name.trim().toLowerCase();
  if (FORCE_SINGLE_ASPECTS.has(key)) return "SINGLE";
  if (DEFAULT_MULTI_ASPECTS.has(key)) return "MULTI";
  // Safest default for Inventory: one value. MULTI without metadata causes 25002.
  return "SINGLE";
}

function splitAspectValues(raw: string): string[] {
  return String(raw || "")
    .split(/\s*\|\s*|\s*;\s*|\s*,\s*/)
    .map((v) => v.trim())
    .filter(Boolean);
}

/** eBay item-specific values cannot exceed 65 characters (error 25002). */
export const EBAY_ASPECT_VALUE_MAX = 65;

export function cleanEbayAspectValue(raw: string): string {
  let value = String(raw || "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  if (/https?:\/\//i.test(value) || /\[[^\]]+\]\(/i.test(value)) return "";
  if (/video|va-related-videos|widget_feature|javascript:/i.test(value)) {
    return "";
  }
  if (value.length <= EBAY_ASPECT_VALUE_MAX) return value;
  const clipped = value
    .slice(0, EBAY_ASPECT_VALUE_MAX)
    .replace(/\s+\S*$/, "")
    .trim();
  return clipped.length >= 3
    ? clipped
    : value.slice(0, EBAY_ASPECT_VALUE_MAX).trim();
}

/**
 * Normalize Inventory product.aspects for eBay cardinality rules.
 * Color/Finish/etc must be a single-element array or eBay returns 25002.
 */
export function sanitizeEbayAspects(
  input: EbayAspects | Record<string, string[] | string>,
  cardinalityByName?: Map<string, AspectCardinality>,
): EbayAspects {
  const out: EbayAspects = {};

  for (const [rawName, rawValues] of Object.entries(input || {})) {
    const name = String(rawName || "").trim();
    if (!name) continue;

    const values = (
      Array.isArray(rawValues) ? rawValues : splitAspectValues(String(rawValues))
    )
      .flatMap((v) => splitAspectValues(String(v)))
      .map((v) => cleanEbayAspectValue(v))
      .filter(Boolean);

    if (!values.length) continue;

    const cardinality =
      cardinalityByName?.get(name.toLowerCase()) ||
      defaultCardinalityForAspect(name);

    if (cardinality === "SINGLE") {
      out[name] = [values[0]!];
    } else {
      // Cap multi aspects — eBay still rejects huge lists.
      out[name] = [...new Set(values)].slice(0, 10);
    }
  }

  return out;
}

type TaxonomyAspect = {
  localizedAspectName?: string;
  aspectConstraint?: {
    itemToAspectCardinality?: string;
    aspectRequired?: boolean;
    aspectUsage?: string;
  };
};

export type CategoryAspectMeta = {
  cardinality: Map<string, AspectCardinality>;
  /** Original-cased names eBay marked required for this category. */
  required: string[];
};

/**
 * Load SINGLE/MULTI cardinality + required aspect names from Taxonomy.
 */
export async function fetchCategoryAspectMeta(
  accessToken: string,
  categoryId: string,
): Promise<CategoryAspectMeta> {
  const cardinality = new Map<string, AspectCardinality>();
  const required: string[] = [];
  const id = String(categoryId || "").trim();
  if (!id) return { cardinality, required };

  const cfg = getEbayConfig();
  try {
    const res = await fetch(
      `${cfg.apiBase}/commerce/taxonomy/v1/category_tree/0/get_item_aspects_for_category?category_id=${encodeURIComponent(id)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "Accept-Language": "en-US",
        },
      },
    );
    if (!res.ok) return { cardinality, required };
    const json = (await res.json()) as {
      aspects?: TaxonomyAspect[];
    };
    for (const aspect of json.aspects || []) {
      const name = String(aspect.localizedAspectName || "").trim();
      if (!name) continue;
      const card = String(
        aspect.aspectConstraint?.itemToAspectCardinality || "",
      ).toUpperCase();
      if (card === "MULTI") cardinality.set(name.toLowerCase(), "MULTI");
      else if (card === "SINGLE") cardinality.set(name.toLowerCase(), "SINGLE");
      const usage = String(
        aspect.aspectConstraint?.aspectUsage || "",
      ).toUpperCase();
      if (aspect.aspectConstraint?.aspectRequired || usage === "REQUIRED") {
        required.push(name);
      }
    }
  } catch {
    // Non-fatal — sanitize with defaults.
  }
  return { cardinality, required };
}

/**
 * Load SINGLE/MULTI cardinality from Taxonomy getItemAspectsForCategory.
 * Falls back to empty map on failure (caller uses defaults).
 */
export async function fetchAspectCardinalityMap(
  accessToken: string,
  categoryId: string,
): Promise<Map<string, AspectCardinality>> {
  const meta = await fetchCategoryAspectMeta(accessToken, categoryId);
  return meta.cardinality;
}
