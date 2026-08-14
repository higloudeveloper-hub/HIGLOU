/** Ignore FORCE_MINI_PACKAGE 1×1×1 — that is shipping, not product size. */
export const MIN_REAL_ITEM_INCHES = 6;
export const MAX_REAL_ITEM_INCHES = 240;

export type ItemDims = {
  lengthIn: number;
  widthIn: number;
  heightIn: number;
};

export type PackageHint = {
  lengthIn?: number | null;
  widthIn?: number | null;
  depthIn?: number | null;
};

export function formatEbayInches(n: number): string {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v < 1) return "";
  return `${v} in`;
}

function inRange(n: number): boolean {
  return Number.isFinite(n) && n >= MIN_REAL_ITEM_INCHES && n <= MAX_REAL_ITEM_INCHES;
}

/** Parse 18" x 22" x 34" / 18 x 22 x 34 in / 18in x 22in x 34in. */
export function parseDimensionTriplet(text: string): ItemDims | null {
  const m = String(text || "").match(
    /(\d+(?:\.\d+)?)\s*(?:in(?:ch(?:es)?)?|"|'' )?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:in(?:ch(?:es)?)?|"|'' )?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:in(?:ch(?:es)?)?|"|'' )?/i,
  );
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = Number(m[3]);
  if (![a, b, c].every((n) => Number.isFinite(n) && n >= 1 && n <= MAX_REAL_ITEM_INCHES)) {
    return null;
  }
  // Furniture: longest horizontal ≈ length, next ≈ width, remaining ≈ height
  // when the triplet is unordered. Keep declared order when all look plausible.
  return { lengthIn: a, widthIn: b, heightIn: c };
}

function parseLabeledInches(text: string, labels: string[]): number | null {
  const hay = String(text || "");
  for (const label of labels) {
    const escaped = label.replace(/\s+/g, String.raw`\s+`);
    const re = new RegExp(
      String.raw`\b${escaped}(?:\s*(?:is|:|=))?\s*(\d+(?:\.\d+)?)\s*(?:in(?:ch(?:es)?)?|"|'' )?`,
      "i",
    );
    const m = hay.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (inRange(n) || (n >= 1 && n < MIN_REAL_ITEM_INCHES && /seat/i.test(label))) {
      return n;
    }
  }
  return null;
}

export function realisticPackageDims(pkg?: PackageHint | null): ItemDims | null {
  if (!pkg) return null;
  const lengthIn = Number(pkg.lengthIn);
  const widthIn = Number(pkg.widthIn);
  const heightIn = Number(pkg.depthIn);
  if (![lengthIn, widthIn, heightIn].every(inRange)) return null;
  return { lengthIn, widthIn, heightIn };
}

/** Typical assembled sizes when taxonomy requires Item Length and OCR has none. */
export function inferFurnitureDefaultDims(text: string): ItemDims | null {
  const hay = String(text || "").toLowerCase();
  if (
    /patio\s*chair|folding\s*(patio\s*)?chair|lawn\s*chair|outdoor\s*chair|silla\s*(de\s*patio|plegable)|folding\s*chair/.test(
      hay,
    )
  ) {
    return { lengthIn: 22, widthIn: 18, heightIn: 34 };
  }
  if (/patio\s*table|bistro\s*table/.test(hay)) {
    return { lengthIn: 20, widthIn: 20, heightIn: 28 };
  }
  if (/\b(?:bar\s*)?stool\b|\btaburete\b/.test(hay)) {
    return { lengthIn: 14, widthIn: 14, heightIn: 30 };
  }
  if (/\b(?:dining|accent|side|office|desk)?\s*chairs?\b|\bsilla\b/.test(hay)) {
    return { lengthIn: 22, widthIn: 20, heightIn: 32 };
  }
  return null;
}

function inferLinearLength(text: string): string | null {
  const hay = String(text || "");
  if (!/\b(?:cord|cable|hose|rope|chain|extension)\b/i.test(hay)) return null;
  const ft = hay.match(/\b(\d+(?:\.\d+)?)\s*(?:ft|feet|foot)\b/i);
  if (ft) {
    const inches = Math.round(Number(ft[1]) * 12);
    const formatted = formatEbayInches(inches);
    return formatted || null;
  }
  const inch = hay.match(/\b(\d+(?:\.\d+)?)\s*(?:in(?:ch(?:es)?)?|" )\b/i);
  if (inch) {
    const formatted = formatEbayInches(Number(inch[1]));
    return formatted || null;
  }
  return null;
}

export function inferItemDimsFromText(
  text: string,
  pkg?: PackageHint | null,
): ItemDims | null {
  const labeledLength = parseLabeledInches(text, [
    "item length",
    "overall length",
    "assembled length",
  ]);
  const labeledWidth = parseLabeledInches(text, [
    "item width",
    "overall width",
    "assembled width",
  ]);
  const labeledHeight = parseLabeledInches(text, [
    "item height",
    "overall height",
    "assembled height",
  ]);
  const triplet = parseDimensionTriplet(text);
  const pack = realisticPackageDims(pkg);
  const furniture = inferFurnitureDefaultDims(text);
  const base = triplet || pack || furniture;
  const lengthIn = labeledLength || base?.lengthIn || 0;
  const widthIn = labeledWidth || base?.widthIn || 0;
  const heightIn = labeledHeight || base?.heightIn || 0;
  if (lengthIn < 1 && widthIn < 1 && heightIn < 1) return null;
  return {
    lengthIn: lengthIn || furniture?.lengthIn || pack?.lengthIn || 0,
    widthIn: widthIn || furniture?.widthIn || pack?.widthIn || 0,
    heightIn: heightIn || furniture?.heightIn || pack?.heightIn || 0,
  };
}

/** Infer a single eBay dimension aspect (Item Length / Width / Height / Seat Height). */
export function inferItemDimensionAspect(
  aspectName: string,
  text: string,
  pkg?: PackageHint | null,
): string | null {
  const name = String(aspectName || "").trim().toLowerCase();
  if (!name) return null;

  if (/seat\s*height/.test(name)) {
    const labeled = parseLabeledInches(text, ["seat height"]);
    if (labeled) return formatEbayInches(labeled) || null;
    if (inferFurnitureDefaultDims(text)) return "17 in";
    return null;
  }

  const dims = inferItemDimsFromText(text, pkg);
  if (/length/.test(name) && !/width|height/.test(name)) {
    if (dims?.lengthIn) return formatEbayInches(dims.lengthIn) || null;
    return inferLinearLength(text);
  }
  if (/width/.test(name) && dims?.widthIn) {
    return formatEbayInches(dims.widthIn) || null;
  }
  if (/height/.test(name) && dims?.heightIn) {
    return formatEbayInches(dims.heightIn) || null;
  }
  return null;
}

/**
 * Fill Item Length / Width / Height before Inventory PUT so 25002 does not
 * chain (Length → Width → Height). Mutates aspects; returns added keys.
 */
function hasAspect(
  aspects: Record<string, string[] | undefined> | null | undefined,
  name: string,
): boolean {
  const want = name.trim().toLowerCase();
  for (const [key, values] of Object.entries(aspects || {})) {
    if (key.trim().toLowerCase() !== want) continue;
    if ((values || []).some((v) => String(v || "").trim())) return true;
  }
  return false;
}

export function ensureInferredDimensionAspects(
  aspects: Record<string, string[]>,
  haystack: string,
  pkg?: PackageHint | null,
): string[] {
  const added: string[] = [];
  const pairs: Array<[string, string]> = [
    ["Item Length", "Item Length"],
    ["Item Width", "Item Width"],
    ["Item Height", "Item Height"],
  ];
  for (const [aspectName] of pairs) {
    if (hasAspect(aspects, aspectName)) continue;
    const value = inferItemDimensionAspect(aspectName, haystack, pkg);
    if (!value) continue;
    aspects[aspectName] = [value];
    added.push(aspectName);
  }
  return added;
}
