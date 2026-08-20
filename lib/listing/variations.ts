import type { ItemSpecificField, ListingVariation, ProductListing } from "@/types/product";
import { sanitizeEbayPolicyCopy } from "@/lib/ebay/listing-helpers";

export const VARIATIONS_SPECIFIC_KEY = "C:__HIGLOU_VARIATIONS__";

export type ListingVariationSet = {
  axisNames: string[];
  variants: ListingVariation[];
};

export function isVariationsSpecific(field: {
  key?: string;
  label?: string;
}): boolean {
  const key = String(field.key || "").replace(/^C:/, "");
  const label = String(field.label || "").replace(/^C:/, "");
  return key === "__HIGLOU_VARIATIONS__" || /^higlou\s*variations$/i.test(label);
}

export function encodeVariationsSpecific(
  set: ListingVariationSet,
): ItemSpecificField {
  return {
    key: VARIATIONS_SPECIFIC_KEY,
    label: "Higlou Variations",
    value: JSON.stringify({
      axisNames: set.axisNames,
      variants: set.variants,
    }),
    isCustom: true,
  };
}

export function decodeVariationsSet(raw: string): ListingVariationSet | null {
  try {
    const parsed = JSON.parse(String(raw || "")) as {
      axisNames?: unknown;
      variants?: unknown;
    };
    const axisNames = Array.isArray(parsed.axisNames)
      ? parsed.axisNames.map((name) => String(name || "").trim()).filter(Boolean)
      : [];
    const variants = Array.isArray(parsed.variants)
      ? parsed.variants
          .map((row) => {
            if (!row || typeof row !== "object") return null;
            const rec = row as Record<string, unknown>;
            const asin = String(rec.asin || "").trim().toUpperCase();
            const sku = String(rec.sku || "").trim();
            const aspects: Record<string, string> = {};
            if (rec.aspects && typeof rec.aspects === "object") {
              for (const [key, value] of Object.entries(
                rec.aspects as Record<string, unknown>,
              )) {
                const name = String(key || "").trim();
                const text = sanitizeEbayPolicyCopy(String(value || "")).slice(
                  0,
                  65,
                );
                if (name && text) aspects[name] = text;
              }
            }
            const imageUrls = Array.isArray(rec.imageUrls)
              ? rec.imageUrls
                  .map((url) => String(url || "").trim())
                  .filter((url) => /^https:\/\//i.test(url))
              : [];
            if (!asin || !Object.keys(aspects).length) return null;
            return {
              asin,
              sku: sku || `AMZ-${asin}`,
              aspects,
              imageUrls,
            } satisfies ListingVariation;
          })
          .filter((row): row is ListingVariation => Boolean(row))
      : [];
    if (variants.length < 2) return null;
    return {
      axisNames: axisNames.length
        ? axisNames
        : [...new Set(variants.flatMap((row) => Object.keys(row.aspects)))],
      variants,
    };
  } catch {
    return null;
  }
}

export function variationsFromListing(
  listing: Pick<ProductListing, "itemSpecifics"> & {
    variations?: ListingVariation[];
    variationAxes?: string[];
  },
): ListingVariationSet | null {
  if (listing.variations && listing.variations.length >= 2) {
    return {
      axisNames:
        listing.variationAxes?.length
          ? listing.variationAxes
          : [...new Set(listing.variations.flatMap((row) => Object.keys(row.aspects)))],
      variants: listing.variations,
    };
  }
  const field = (listing.itemSpecifics || []).find(isVariationsSpecific);
  return field?.value ? decodeVariationsSet(field.value) : null;
}

export function withEncodedVariations(
  specifics: ItemSpecificField[],
  set: ListingVariationSet | null | undefined,
): ItemSpecificField[] {
  const without = specifics.filter((field) => !isVariationsSpecific(field));
  if (!set || set.variants.length < 2) return without;
  return [encodeVariationsSpecific(set), ...without];
}

export function variationSummary(set: ListingVariationSet | null): string {
  if (!set || set.variants.length < 2) return "";
  const parts = set.axisNames.map((axis) => {
    const n = new Set(
      set.variants.map((row) => row.aspects[axis]).filter(Boolean),
    ).size;
    return n ? `${n} ${axis.toLowerCase()}${n === 1 ? "" : "s"}` : "";
  }).filter(Boolean);
  return `${set.variants.length} variations${parts.length ? ` · ${parts.join(" × ")}` : ""}`;
}
