import { sanitizeEbayPolicyCopy } from "@/lib/ebay/listing-helpers";
import type { ListingVariation } from "@/types/product";
import type { ListingVariationSet } from "@/lib/listing/variations";

const MAX_VARIANTS = 80;

function upgradeImage(url: string): string {
  const clean = String(url || "").trim().replace(/&amp;/g, "&");
  if (!/^https:\/\//i.test(clean)) return "";
  const id = clean.match(/\/images\/I\/([^/?#]+)/i)?.[1]?.replace(/\._.+$/i, "").replace(/\.(jpe?g|png|webp|gif)$/i, "");
  if (!id || id.length < 3) return /^https:\/\//i.test(clean) ? clean : "";
  return `https://m.media-amazon.com/images/I/${id}._AC_SL1500_.jpg`;
}

function extractBalanced(
  source: string,
  start: number,
  openCh: "{" | "[",
): string {
  const closeCh = openCh === "{" ? "}" : "]";
  if (source[start] !== openCh) return "";
  let depth = 0;
  let inStr = false;
  let quote = "";
  let escape = false;
  for (let i = start; i < source.length; i += 1) {
    const c = source[i];
    if (inStr) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === quote) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      quote = c;
      continue;
    }
    if (c === openCh) depth += 1;
    else if (c === closeCh) {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return "";
}

function blockAfterKey(
  html: string,
  key: string,
  openCh: "{" | "[",
): string {
  const re = new RegExp(
    `['"]${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"]\\s*:`,
    "i",
  );
  const match = re.exec(html);
  if (!match || match.index == null) return "";
  let i = match.index + match[0].length;
  while (i < html.length && /\s/.test(html[i])) i += 1;
  if (html[i] !== openCh) {
    const found = html.indexOf(openCh, i);
    if (found < 0 || found - i > 80) return "";
    i = found;
  }
  return extractBalanced(html, i, openCh);
}

function parseJs(raw: string): unknown {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    /* Amazon often emits JS objects with single quotes */
  }
  try {
    return JSON.parse(
      text
        .replace(/'/g, '"')
        .replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":'),
    );
  } catch {
    return null;
  }
}

function axisName(raw: string): string {
  const key = String(raw || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (/^colou?r/.test(key)) return "Color";
  if (/^size/.test(key)) return "Size";
  if (/^style/.test(key)) return "Style";
  if (/^pattern/.test(key)) return "Pattern";
  const pretty = String(raw || "")
    .replace(/_name$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!pretty) return "";
  return pretty.replace(/\b\w/g, (ch) => ch.toUpperCase()).slice(0, 40);
}

function cleanValue(raw: string): string {
  return sanitizeEbayPolicyCopy(String(raw || "").replace(/\s+/g, " ")).slice(
    0,
    65,
  );
}

function isAsin(value: string): boolean {
  return /^[A-Z0-9]{10}$/i.test(value);
}

function colorImageMap(html: string): Record<string, string[]> {
  const obj = blockAfterKey(html, "colorImages", "{");
  const parsed = parseJs(obj);
  const out: Record<string, string[]> = {};
  if (!parsed || typeof parsed !== "object") return out;
  for (const [color, rows] of Object.entries(parsed as Record<string, unknown>)) {
    if (/^initial$/i.test(color) || !Array.isArray(rows)) continue;
    const urls: string[] = [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const rec = row as Record<string, unknown>;
      for (const key of ["hiRes", "mainUrl", "hiResImage", "large"]) {
        const url = upgradeImage(String(rec[key] || ""));
        if (url) urls.push(url);
      }
    }
    if (urls.length) out[color] = [...new Set(urls)].slice(0, 12);
  }
  return out;
}

function imagesForColor(
  map: Record<string, string[]>,
  color: string,
): string[] {
  if (map[color]?.length) return map[color];
  const needle = color.toLowerCase();
  for (const [name, urls] of Object.entries(map)) {
    if (name.toLowerCase() === needle) return urls;
  }
  return [];
}

function fromDimensionDisplay(html: string): ListingVariationSet | null {
  const data = parseJs(blockAfterKey(html, "dimensionValuesDisplayData", "{"));
  const labelsRaw = parseJs(blockAfterKey(html, "variationDisplayLabels", "["));
  if (!data || typeof data !== "object") return null;
  const labels = Array.isArray(labelsRaw)
    ? labelsRaw.map((row) => axisName(String(row || ""))).filter(Boolean)
    : [];
  const variants: ListingVariation[] = [];
  for (const [asin, values] of Object.entries(data as Record<string, unknown>)) {
    if (!isAsin(asin) || !Array.isArray(values)) continue;
    const aspects: Record<string, string> = {};
    values.forEach((value, index) => {
      const name = labels[index] || (index === 0 ? "Color" : index === 1 ? "Size" : "");
      const text = cleanValue(String(value || ""));
      if (name && text && !/^select$/i.test(text)) aspects[name] = text;
    });
    if (!Object.keys(aspects).length) continue;
    variants.push({
      asin: asin.toUpperCase(),
      sku: `AMZ-${asin.toUpperCase()}`,
      aspects,
      imageUrls: [],
    });
  }
  if (variants.length < 2) return null;
  const axisNames =
    labels.filter((name) =>
      variants.some((row) => row.aspects[name]),
    ) || [...new Set(variants.flatMap((row) => Object.keys(row.aspects)))];
  return { axisNames, variants: variants.slice(0, MAX_VARIANTS) };
}

function fromAsinVariationValues(html: string): ListingVariationSet | null {
  const valuesObj = parseJs(blockAfterKey(html, "variationValues", "{"));
  const asinMap = parseJs(blockAfterKey(html, "asinVariationValues", "{"));
  if (!valuesObj || typeof valuesObj !== "object") return null;
  if (!asinMap || typeof asinMap !== "object") return null;
  const axes = Object.entries(valuesObj as Record<string, unknown>).map(
    ([key, list]) => ({
      name: axisName(key),
      values: Array.isArray(list) ? list.map((row) => cleanValue(String(row || ""))) : [],
    }),
  ).filter((axis) => axis.name && axis.values.length);
  if (!axes.length) return null;
  const variants: ListingVariation[] = [];
  for (const [asin, indexes] of Object.entries(asinMap as Record<string, unknown>)) {
    if (!isAsin(asin) || !Array.isArray(indexes)) continue;
    const aspects: Record<string, string> = {};
    indexes.forEach((index, axisIndex) => {
      const axis = axes[axisIndex];
      if (!axis) return;
      const n = Number(index);
      const text = axis.values[n] || "";
      if (text) aspects[axis.name] = text;
    });
    if (!Object.keys(aspects).length) continue;
    variants.push({
      asin: asin.toUpperCase(),
      sku: `AMZ-${asin.toUpperCase()}`,
      aspects,
      imageUrls: [],
    });
  }
  if (variants.length < 2) return null;
  return {
    axisNames: axes.map((axis) => axis.name),
    variants: variants.slice(0, MAX_VARIANTS),
  };
}

function fromColorToAsin(html: string): ListingVariationSet | null {
  const raw =
    parseJs(blockAfterKey(html, "colorToAsin", "{")) ||
    parseJs(blockAfterKey(html, "asinToColor", "{"));
  if (!raw || typeof raw !== "object") return null;
  const bag =
    raw && typeof raw === "object" && "initial" in raw && raw.initial
      ? (raw.initial as Record<string, unknown>)
      : (raw as Record<string, unknown>);
  const variants: ListingVariation[] = [];
  const seen = new Set<string>();
  for (const [key, value] of Object.entries(bag)) {
    if (/^initial$/i.test(key)) continue;
    let asin = "";
    let color = "";
    if (typeof value === "string" && isAsin(value)) {
      asin = value.toUpperCase();
      color = cleanValue(key);
    } else if (isAsin(key) && typeof value === "string") {
      asin = key.toUpperCase();
      color = cleanValue(value);
    } else if (value && typeof value === "object") {
      const rec = value as Record<string, unknown>;
      const found = String(rec.asin || rec.ASIN || "").toUpperCase();
      if (isAsin(found)) {
        asin = found;
        color = cleanValue(String(rec.color || rec.name || key));
      }
    }
    if (!asin || !color || seen.has(asin)) continue;
    seen.add(asin);
    variants.push({
      asin,
      sku: `AMZ-${asin}`,
      aspects: { Color: color },
      imageUrls: [],
    });
  }
  if (variants.length < 2) return null;
  return { axisNames: ["Color"], variants: variants.slice(0, MAX_VARIANTS) };
}

function attachColorImages(
  set: ListingVariationSet,
  html: string,
): ListingVariationSet {
  const map = colorImageMap(html);
  return {
    ...set,
    variants: set.variants.map((row) => ({
      ...row,
      imageUrls: imagesForColor(map, row.aspects.Color || "") || row.imageUrls,
    })),
  };
}

/** Color / size (and similar) child ASINs from an Amazon twister page. */
export function parseAmazonVariations(html: string): ListingVariationSet | null {
  const decoded = String(html || "")
    .replace(/&quot;/g, '"')
    .replace(/\\u002[fF]/g, "/")
    .replace(/\\\//g, "/");
  const set =
    fromDimensionDisplay(decoded) ||
    fromAsinVariationValues(decoded) ||
    fromColorToAsin(decoded);
  if (!set) return null;
  const axes = set.axisNames.filter((name) => {
    const uniq = new Set(
      set.variants.map((row) => row.aspects[name]).filter(Boolean),
    );
    return uniq.size > 1;
  }).slice(0, 2);
  const variants = set.variants
    .map((row) => {
      const aspects: Record<string, string> = {};
      for (const axis of axes.length ? axes : set.axisNames) {
        if (row.aspects[axis]) aspects[axis] = row.aspects[axis];
      }
      return { ...row, aspects };
    })
    .filter((row) => Object.keys(row.aspects).length);
  if (variants.length < 2) return null;
  return attachColorImages(
    {
      axisNames: axes.length ? axes : set.axisNames.slice(0, 2),
      variants,
    },
    decoded,
  );
}
