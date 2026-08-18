export type AmazonCatalogHit = {
  asin: string;
  title: string;
  productType?: string;
};

export type AmazonMatchHints = {
  title?: string;
  brand?: string;
  model?: string;
  mpn?: string;
};

const MODEL_CODE_RE = /^[A-Z]{2,6}\d{2,5}[A-Z0-9]{0,6}$/;
const KIT_RE =
  /\b(kit|combo|batter(?:y|ies)|charger included|pack of|2\s*ah|4\s*ah|5\s*ah)\b/i;
const BARE_RE = /\b(tool only|bare tool|herramienta sola)\b/i;
const RENEWED_RE = /\b(renewed|refurbished|reacondicionado)\b/i;
const MODEL_RE = /\b([A-Z]{2,6}\d{2,5}[A-Z0-9]{0,6})\b/gi;

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

export function listingLooksLikeKit(text: string): boolean {
  return KIT_RE.test(text);
}

export function extractModelCode(text: string): string {
  const matches = String(text || "").toUpperCase().match(MODEL_RE) || [];
  const skip = new Set(["MAX", "XR", "LED", "USB", "AH", "VMAX"]);
  const codes = matches
    .map((code) => code.replace(/[^A-Z0-9]/g, ""))
    .filter((code) => MODEL_CODE_RE.test(code) && !skip.has(code));
  return codes.sort((a, b) => b.length - a.length)[0] || "";
}

export function resolveAmazonModelCode(hints: AmazonMatchHints): string {
  const fromFields = compact(hints.model || hints.mpn || "");
  if (MODEL_CODE_RE.test(fromFields)) return fromFields;
  return extractModelCode(haystack(hints));
}

export function amazonSearchKeywords(hints: AmazonMatchHints): string {
  const brand = String(hints.brand || "").trim();
  const model = resolveAmazonModelCode(hints);
  const parts = [brand, model].filter(Boolean);
  if (parts.length) return parts.join(" ");
  return String(hints.title || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function modelParts(model: string): { family: string; pack: string } {
  const raw = compact(model);
  const match = raw.match(/^([A-Z]+\d+)(.*)$/);
  return { family: match?.[1] || raw, pack: match?.[2] || "" };
}

function isKitPack(pack: string): boolean {
  return /^[A-Z]\d/.test(pack);
}

export function scoreAmazonCatalogHit(
  hit: AmazonCatalogHit,
  hints: AmazonMatchHints,
): number {
  const listingText = haystack(hints);
  const title = String(hit.title || "");
  const titleCompact = compact(title);
  const brand = compact(hints.brand || "");
  const model = resolveAmazonModelCode(hints);
  if (!model) return 0;
  const { family, pack } = modelParts(model);
  if (!family || !titleCompact.includes(family)) return 0;
  if (brand && !compact(title).includes(brand) && !/DEWALT|DE WALT/i.test(title)) {
    if (brand.length >= 4 && !title.toLowerCase().includes(String(hints.brand || "").toLowerCase())) {
      return 0;
    }
  }

  let score = 40;
  const hitModel = extractModelCode(title);
  const hitParts = modelParts(hitModel || family);
  if (hitParts.family === family) score += 20;
  if (pack && hitParts.pack === pack) score += 25;
  if (!pack && !isKitPack(hitParts.pack)) score += 15;
  if (!pack && hitParts.pack.length === 1) score += 8;

  const listingKit = listingLooksLikeKit(listingText);
  const hitKit = listingLooksLikeKit(title) || isKitPack(hitParts.pack);
  if (listingKit === hitKit) score += 20;
  else score -= 35;
  if (BARE_RE.test(title) && !listingKit) score += 12;
  if (RENEWED_RE.test(title)) score -= 50;
  return score;
}

export function pickAmazonCatalogMatch(
  hits: AmazonCatalogHit[],
  hints: AmazonMatchHints,
): AmazonCatalogHit | null {
  const ranked = hits
    .map((hit) => ({ hit, score: scoreAmazonCatalogHit(hit, hints) }))
    .filter((row) => row.score >= 50)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;
  const best = ranked[0];
  const second = ranked[1];
  if (second && best.score - second.score < 8 && best.hit.asin !== second.hit.asin) {
    const listingKit = listingLooksLikeKit(haystack(hints));
    const bestKit = listingLooksLikeKit(best.hit.title);
    if (bestKit !== listingKit && listingLooksLikeKit(second.hit.title) === listingKit) {
      return second.hit;
    }
    if (best.score === second.score) return null;
  }
  return best.hit;
}
