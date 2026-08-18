export type AmazonCatalogHit = {
  asin: string;
  title: string;
  productType?: string;
  identifiers?: string[];
};

export type AmazonMatchHints = {
  title?: string;
  brand?: string;
  model?: string;
  mpn?: string;
};

const KIT_RE =
  /\b(kit|combo|batter(?:y|ies)|charger included|pack of|2\s*ah|4\s*ah|5\s*ah)\b/i;
const BARE_RE = /\b(tool only|bare tool|herramienta sola)\b/i;
const RENEWED_RE = /\b(renewed|refurbished|reacondicionado)\b/i;
const MODEL_TOKEN_RE = /\b[A-Z]{1,8}\d[A-Z0-9\-]{1,16}\b/gi;
const NUMERIC_MODEL_RE = /\b\d{6,10}\b/g;
const FINISH_RE = /(^|[^A-Z])(PC|SN|PN|SS|BN|RB|CZ|BL|WH|BNK)([^A-Z]|$)/i;
const SKIP_TOKENS = new Set([
  "MAX",
  "XR",
  "LED",
  "USB",
  "AH",
  "VMAX",
  "WIFI",
  "HOME",
]);

function compact(value: string): string {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function haystack(hints: AmazonMatchHints): string {
  return [hints.brand, hints.model, hints.mpn, hints.title]
    .filter(Boolean)
    .join(" ");
}

function hitHaystack(hit: AmazonCatalogHit): string {
  return [hit.title, ...(hit.identifiers || [])].filter(Boolean).join(" ");
}

function brandMatches(hints: AmazonMatchHints, hit: AmazonCatalogHit): boolean {
  const brand = String(hints.brand || "").trim();
  if (!brand) return true;
  const text = hitHaystack(hit);
  if (compact(text).includes(compact(brand))) return true;
  if (text.toLowerCase().includes(brand.toLowerCase())) return true;
  if (/^ryobi$/i.test(brand) && /oneand|one\+|one\s*plus/i.test(text)) return true;
  return false;
}

export function listingLooksLikeKit(text: string): boolean {
  return KIT_RE.test(text);
}

export function listingLooksBareTool(text: string): boolean {
  return BARE_RE.test(text);
}

export function extractModelTokens(text: string): string[] {
  const raw = String(text || "").toUpperCase();
  const alpha = raw.match(MODEL_TOKEN_RE) || [];
  const numeric = raw.match(NUMERIC_MODEL_RE) || [];
  const tokens = [...alpha, ...numeric]
    .map((token) => token.replace(/[^A-Z0-9-]/g, ""))
    .filter((token) => {
      const tight = compact(token);
      return tight.length >= 4 && !SKIP_TOKENS.has(tight);
    });
  return [...new Set(tokens)];
}

export function extractModelCode(text: string): string {
  return extractModelTokens(text).sort((a, b) => compact(b).length - compact(a).length)[0] || "";
}

function stripPackageSuffix(model: string): string {
  return String(model || "").replace(/[-\/][NU]$/i, "");
}

export function resolveAmazonModelCode(hints: AmazonMatchHints): string {
  const field = String(hints.model || hints.mpn || "").trim();
  const tight = compact(field);
  const brand = compact(hints.brand || "");
  const fieldIsBrand = Boolean(brand && tight === brand);
  if (field && !/\s/.test(field) && /^\d{6,12}$/.test(tight) && !fieldIsBrand) {
    return field;
  }
  if (
    field &&
    !fieldIsBrand &&
    !/\s/.test(field) &&
    /[A-Z]/i.test(field) &&
    /\d/.test(field) &&
    tight.length >= 4 &&
    tight.length <= 18
  ) {
    return stripPackageSuffix(field);
  }
  return stripPackageSuffix(extractModelCode(haystack(hints)));
}

export function amazonCatalogQueries(hints: AmazonMatchHints): string[] {
  const brand = String(hints.brand || "").trim();
  const model = resolveAmazonModelCode(hints);
  const queries = [
    [brand, model].filter(Boolean).join(" "),
    model,
    model.replace(/-/g, ""),
    String(hints.title || "").replace(/\s+/g, " ").trim().slice(0, 80),
  ].filter((query) => query.length >= 4);
  return [...new Set(queries)];
}

export function amazonSearchKeywords(hints: AmazonMatchHints): string {
  return amazonCatalogQueries(hints)[0] || "";
}

function modelsCompatible(listingModel: string, amazonModel: string): boolean {
  const listing = compact(stripPackageSuffix(listingModel));
  const amazon = compact(stripPackageSuffix(amazonModel));
  if (!listing || !amazon) return false;
  if (listing === amazon) return true;
  const listingFinish = listingFinishCode(listing);
  const amazonFinish = listingFinishCode(amazon);
  if (listingFinish && amazonFinish && listingFinish !== amazonFinish) return false;
  const shorter = listing.length <= amazon.length ? listing : amazon;
  const longer = listing.length <= amazon.length ? amazon : listing;
  return shorter.length >= 5 && longer.startsWith(shorter);
}

function listingFinishCode(model: string): string {
  const match = compact(model).match(/(PC|SN|PN|SS|BN|RB|CZ|BL|WH)$/);
  return match?.[1] || "";
}

export function listingModelMatchesHit(
  hit: AmazonCatalogHit,
  hints: AmazonMatchHints,
): boolean {
  const model = compact(resolveAmazonModelCode(hints));
  if (!model) return false;
  const blob = compact(hitHaystack(hit));
  if (blob.includes(model)) return true;
  if (model.length >= 5 && blob.includes(model.slice(0, Math.max(5, model.length - 1)))) {
    return true;
  }
  return extractModelTokens(hitHaystack(hit)).some((token) =>
    modelsCompatible(model, token),
  );
}

function hitFinish(text: string): string {
  const match = String(text || "").toUpperCase().match(FINISH_RE);
  return match?.[2] || "";
}

function hasConflictingModel(hitText: string, listingModel: string): boolean {
  const listing = compact(listingModel);
  if (listing.length < 4) return false;
  return extractModelTokens(hitText).some((token) => {
    const tight = compact(token);
    if (tight.length < 6) return false;
    if (listing.includes(tight) || tight.includes(listing)) return false;
    const listingCore = listing.replace(/(PC|SN|PN|SS|BN)$/, "");
    const tokenCore = tight.replace(/(PC|SN|PN|SS|BN)$/, "");
    if (listingCore && tokenCore.startsWith(listingCore)) return false;
    if (listingCore && listingCore.startsWith(tokenCore)) return false;
    return true;
  });
}

export function scoreAmazonCatalogHit(
  hit: AmazonCatalogHit,
  hints: AmazonMatchHints,
): number {
  const listingText = haystack(hints);
  const title = String(hit.title || "");
  const blob = compact(hitHaystack(hit));
  const model = compact(resolveAmazonModelCode(hints));
  if (!listingModelMatchesHit(hit, hints)) return 0;
  if (!brandMatches(hints, hit)) return 0;
  if (hasConflictingModel(hitHaystack(hit), model)) return 0;

  const finish = listingFinishCode(resolveAmazonModelCode(hints));
  const otherFinish = hitFinish(hitHaystack(hit));
  if (finish && otherFinish && finish !== otherFinish) return 0;

  let score = 20;
  if (blob.includes(model)) score += 50;
  else score += 35;
  if (finish && (otherFinish === finish || blob.includes(finish))) score += 12;
  const listingKit = listingLooksLikeKit(listingText);
  const hitKit = listingLooksLikeKit(title);
  if (listingKit === hitKit) score += 16;
  else score -= 30;
  if (BARE_RE.test(title) && !listingKit) score += 10;
  if (RENEWED_RE.test(title)) score -= 50;
  if (/\battachment\b/i.test(title) && !/\battachment\b/i.test(listingText)) {
    score -= 40;
  }
  return score;
}

export function pickAmazonCatalogMatch(
  hits: AmazonCatalogHit[],
  hints: AmazonMatchHints,
): AmazonCatalogHit | null {
  const ranked = hits
    .map((hit, index) => ({
      hit,
      index,
      score: scoreAmazonCatalogHit(hit, hints),
    }))
    .filter((row) => row.score >= 45)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked[0]?.hit || null;
}

export function pickExactAmazonCatalog(
  hits: AmazonCatalogHit[],
  hints: AmazonMatchHints,
): AmazonCatalogHit | null {
  const exact = hits.filter((hit) => listingModelMatchesHit(hit, hints));
  return pickAmazonCatalogMatch(exact, hints);
}

export function pickSoleBarcodeCatalogHit(
  hits: AmazonCatalogHit[],
  hints: AmazonMatchHints,
): AmazonCatalogHit | null {
  if (hits.length !== 1) return pickExactAmazonCatalog(hits, hints);
  const hit = hits[0];
  if (!hit?.asin) return null;
  if (String(hints.brand || "").trim() && !brandMatches(hints, hit)) return null;
  return hit;
}
