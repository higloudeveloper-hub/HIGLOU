import { keepaGet } from "@/lib/keepa/client";
import { isKeepaConfigured } from "@/lib/keepa/config";
import type { ListingVariation } from "@/types/product";
import type { ListingVariationSet } from "@/lib/listing/variations";

const MAX_VARIANTS = 80;

function axisName(raw: string): string {
  const key = String(raw || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (/^colou?r/.test(key)) return "Color";
  if (/^size/.test(key)) return "Size";
  if (/^style/.test(key)) return "Style";
  if (/^pattern/.test(key)) return "Pattern";
  const pretty = String(raw || "")
    .replace(/_name$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/:$/, "")
    .trim();
  if (!pretty) return "";
  return pretty.replace(/\b\w/g, (ch) => ch.toUpperCase()).slice(0, 40);
}

function cleanValue(raw: string): string {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 65);
}

function isAsin(value: string): boolean {
  return /^[A-Z0-9]{10}$/i.test(value);
}

function keepaVariantImages(rec: Record<string, unknown>): string[] {
  const raw = String(rec.image || rec.imagesCSV || "")
    .split(",")
    .map((part) => part.trim())
    .find(Boolean);
  if (!raw) return [];
  if (/^https:\/\//i.test(raw)) {
    const id = raw.match(/\/images\/I\/([^/?#]+)/i)?.[1]
      ?.replace(/\._.+$/i, "")
      .replace(/\.(jpe?g|png|webp|gif)$/i, "");
    return [
      id && id.length >= 3
        ? `https://m.media-amazon.com/images/I/${id}._AC_SL1500_.jpg`
        : raw,
    ];
  }
  const id = raw.replace(/\._.+$/i, "").replace(/\.(jpe?g|png|webp|gif)$/i, "");
  if (id.length < 3) return [];
  return [`https://m.media-amazon.com/images/I/${id}._AC_SL1500_.jpg`];
}

/** Keepa product.variations → Higlou Color/Size picker rows. */
export function parseKeepaVariations(
  row: Record<string, unknown>,
): ListingVariationSet | null {
  const list = row.variations;
  if (!Array.isArray(list) || list.length < 2) return null;
  const variants: ListingVariation[] = [];
  const seen = new Set<string>();
  const axes = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const asin = String(rec.asin || "").trim().toUpperCase();
    if (!isAsin(asin) || seen.has(asin)) continue;
    const aspects: Record<string, string> = {};
    const attrs = rec.attributes;
    if (Array.isArray(attrs)) {
      attrs.forEach((attr, index) => {
        if (!attr || typeof attr !== "object") return;
        const bag = attr as Record<string, unknown>;
        const rawName = String(bag.dimension ?? bag.name ?? "");
        const name =
          axisName(rawName) ||
          (index === 0 ? "Color" : index === 1 ? "Size" : "");
        const value = cleanValue(String(bag.value || ""));
        if (name && value && !/^select$/i.test(value)) {
          aspects[name] = value;
          axes.add(name);
        }
      });
    }
    if (!Object.keys(aspects).length) continue;
    seen.add(asin);
    variants.push({
      asin,
      sku: `AMZ-${asin}`,
      aspects,
      imageUrls: keepaVariantImages(rec),
    });
    if (variants.length >= MAX_VARIANTS) break;
  }
  if (variants.length < 2) return null;
  return {
    axisNames: [...axes],
    variants,
  };
}

async function keepaProductRow(
  asin: string,
): Promise<Record<string, unknown> | null> {
  const json = await keepaGet("product", {
    asin: asin.toUpperCase(),
    history: 0,
  });
  const products = Array.isArray(json.products) ? json.products : [];
  const row = products[0];
  return row && typeof row === "object"
    ? (row as Record<string, unknown>)
    : null;
}

/** Child ASINs from Keepa when the Amazon page HTML hid the twister. */
export async function keepaVariationSet(
  asin: string,
): Promise<ListingVariationSet | null> {
  if (!isKeepaConfigured() || !isAsin(asin)) return null;
  const row = await keepaProductRow(asin);
  if (!row) return null;
  const parsed = parseKeepaVariations(row);
  if (parsed) return parsed;
  const parent = String(row.parentAsin || "").trim().toUpperCase();
  if (!parent || parent === asin.toUpperCase() || !isAsin(parent)) return null;
  const parentRow = await keepaProductRow(parent);
  return parentRow ? parseKeepaVariations(parentRow) : null;
}
