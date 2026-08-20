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

function allBlocksAfterKey(
  html: string,
  key: string,
  openCh: "{" | "[",
): string[] {
  const re = new RegExp(
    `['"]${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"]\\s*:`,
    "gi",
  );
  const blocks: string[] = [];
  let match: RegExpExecArray | null = re.exec(html);
  while (match) {
    let i = match.index + match[0].length;
    while (i < html.length && /\s/.test(html[i])) i += 1;
    if (html[i] !== openCh) {
      const found = html.indexOf(openCh, i);
      if (found < 0 || found - i > 80) {
        match = re.exec(html);
        continue;
      }
      i = found;
    }
    const block = extractBalanced(html, i, openCh);
    if (block) blocks.push(block);
    if (blocks.length >= 8) break;
    match = re.exec(html);
  }
  return blocks;
}

function firstParsedObject(html: string, key: string): Record<string, unknown> | null {
  for (const block of allBlocksAfterKey(html, key, "{")) {
    const parsed = parseJs(block);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  }
  return null;
}

function firstParsedArray(html: string, key: string): unknown[] | null {
  for (const block of allBlocksAfterKey(html, key, "[")) {
    const parsed = parseJs(block);
    if (Array.isArray(parsed) && parsed.length) return parsed;
  }
  return null;
}

function fromDimensionDisplay(html: string): ListingVariationSet | null {
  const data = firstParsedObject(html, "dimensionValuesDisplayData");
  const labelsRaw = firstParsedArray(html, "variationDisplayLabels");
  if (!data) return null;
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
  const valuesObj = firstParsedObject(html, "variationValues");
  const asinMap = firstParsedObject(html, "asinVariationValues");
  if (!valuesObj) return null;
  if (!asinMap) return null;
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
    firstParsedObject(html, "colorToAsin") ||
    firstParsedObject(html, "asinToColor");
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

function fromDimensionToAsinMap(html: string): ListingVariationSet | null {
  const map = firstParsedObject(html, "dimensionToAsinMap");
  const valuesObj = firstParsedObject(html, "variationValues");
  if (!map || !valuesObj) return null;
  const dimKeysRaw = firstParsedArray(html, "dimensions");
  const labelsRaw = firstParsedArray(html, "variationDisplayLabels");
  const dimKeys = (
    Array.isArray(dimKeysRaw) && dimKeysRaw.length
      ? dimKeysRaw.map((row) => String(row || ""))
      : Object.keys(valuesObj)
  ).filter(Boolean);
  if (!dimKeys.length) return null;
  const labels = (
    Array.isArray(labelsRaw) && labelsRaw.length
      ? labelsRaw.map((row) => axisName(String(row || "")))
      : dimKeys.map((key) => axisName(key))
  ).filter(Boolean);
  const variants: ListingVariation[] = [];
  const seen = new Set<string>();
  for (const [combo, asinRaw] of Object.entries(map)) {
    const asin = String(asinRaw || "").trim().toUpperCase();
    if (!isAsin(asin) || seen.has(asin)) continue;
    const indexes = String(combo)
      .split(/[_-]/)
      .map((part) => Number(part))
      .filter((n) => Number.isFinite(n));
    const aspects: Record<string, string> = {};
    indexes.forEach((index, axisIndex) => {
      const dim = dimKeys[axisIndex];
      const label = labels[axisIndex] || axisName(dim);
      if (!dim || !label) return;
      const list = valuesObj[dim];
      const text = Array.isArray(list)
        ? cleanValue(String(list[index] || ""))
        : "";
      if (text) aspects[label] = text;
    });
    if (!Object.keys(aspects).length) continue;
    seen.add(asin);
    variants.push({
      asin,
      sku: `AMZ-${asin}`,
      aspects,
      imageUrls: [],
    });
  }
  if (variants.length < 2) return null;
  return {
    axisNames: labels.length ? labels : [...new Set(variants.flatMap((row) => Object.keys(row.aspects)))],
    variants: variants.slice(0, MAX_VARIANTS),
  };
}

function aStatePayloads(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]*type=["']a-state["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null = re.exec(html);
  while (match) {
    const parsed = parseJs(String(match[1] || "").trim());
    if (parsed) out.push(parsed);
    if (out.length >= 24) break;
    match = re.exec(html);
  }
  return out;
}

function bagsFromUnknown(root: unknown, depth = 0): Record<string, unknown>[] {
  if (!root || typeof root !== "object" || depth > 5) return [];
  const rec = root as Record<string, unknown>;
  const bags: Record<string, unknown>[] = [];
  if (
    rec.dimensionToAsinMap ||
    rec.dimensionValuesDisplayData ||
    rec.colorToAsin ||
    rec.asinVariationValues
  ) {
    bags.push(rec);
  }
  for (const value of Object.values(rec)) {
    if (value && typeof value === "object") {
      bags.push(...bagsFromUnknown(value, depth + 1));
    }
    if (bags.length >= 16) break;
  }
  return bags;
}

function setFromBag(rec: Record<string, unknown>): ListingVariationSet | null {
  const htmlish = JSON.stringify(rec);
  return (
    fromDimensionToAsinMap(htmlish) ||
    fromDimensionDisplay(htmlish) ||
    fromAsinVariationValues(htmlish) ||
    fromColorToAsin(htmlish)
  );
}

function fromAStateAndNested(html: string): ListingVariationSet | null {
  let best: ListingVariationSet | null = null;
  for (const payload of aStatePayloads(html)) {
    for (const bag of bagsFromUnknown(payload)) {
      const set = setFromBag(bag);
      if (set && (!best || set.variants.length > best.variants.length)) {
        best = set;
      }
    }
  }
  const dpx = html.search(/twister-js-init-dpx-data|immutableTwisterData|twister-plus-inline-twister/i);
  if (dpx >= 0) {
    const brace = html.indexOf("{", dpx);
    if (brace >= 0 && brace - dpx < 500) {
      const block = extractBalanced(html, brace, "{");
      const parsed = parseJs(block);
      for (const bag of bagsFromUnknown(parsed)) {
        const set = setFromBag(bag);
        if (set && (!best || set.variants.length > best.variants.length)) {
          best = set;
        }
      }
    }
  }
  return best;
}

function fromHtmlSwatches(html: string): ListingVariationSet | null {
  const variants: ListingVariation[] = [];
  const seen = new Set<string>();
  const tagRe =
    /<(?:li|span|button|div)[^>]{0,900}(?:data-defaultasin|data-asin)=["']([A-Z0-9]{10})["'][^>]{0,900}>/gi;
  let match: RegExpExecArray | null = tagRe.exec(html);
  while (match) {
    const tag = match[0];
    const asin = String(match[1] || "").toUpperCase();
    if (!isAsin(asin) || seen.has(asin)) {
      match = tagRe.exec(html);
      continue;
    }
    if (
      !/(color_name|size_name|style_name|inline-twister|twister|swatch)/i.test(tag)
    ) {
      match = tagRe.exec(html);
      continue;
    }
    const title =
      tag.match(/(?:title|aria-label|data-value)=["']([^"']{1,80})["']/i)?.[1] ||
      "";
    const color = cleanValue(
      title.replace(/^(click to select|select)\s+/i, ""),
    );
    if (!color) {
      match = tagRe.exec(html);
      continue;
    }
    seen.add(asin);
    variants.push({
      asin,
      sku: `AMZ-${asin}`,
      aspects: { Color: color },
      imageUrls: [],
    });
    if (variants.length >= MAX_VARIANTS) break;
    match = tagRe.exec(html);
  }
  if (variants.length < 2) return null;
  return { axisNames: ["Color"], variants };
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
    .replace(/&#34;/g, '"')
    .replace(/\\u0022/gi, '"')
    .replace(/\\u002[fF]/g, "/")
    .replace(/\\\//g, "/");
  const set =
    fromAStateAndNested(decoded) ||
    fromDimensionToAsinMap(decoded) ||
    fromDimensionDisplay(decoded) ||
    fromAsinVariationValues(decoded) ||
    fromColorToAsin(decoded) ||
    fromHtmlSwatches(decoded);
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
