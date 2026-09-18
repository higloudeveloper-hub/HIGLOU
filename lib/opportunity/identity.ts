const PACK_RE =
  /\b(\d+)\s*(?:[\-x]\s*)?(?:pack|pk|count|ct|pcs|piece|set)\b/i;
const PAIR_RE = /\b(pair|2\s*pk|two[\s-]pack)\b/i;

export function extractPackQty(text: string): number {
  const raw = String(text || "");
  const pack = raw.match(PACK_RE);
  if (pack) {
    const n = Number(pack[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 200) return n;
  }
  if (PAIR_RE.test(raw)) return 2;
  return 1;
}

function compact(value: string): string {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

const STARTER_RESTRICTED =
  /\b(lithium|batter(?:y|ies)|aerosol|flammable|hazardous|hazmat|prescription|cbd|vape|medical|add[\s-]?on item|subscribe\s*&\s*save)\b/i;
const FRAGILE =
  /\b(glass|ceramic|porcelain|crystal|framed mirror)\b/i;

export function isStarterRestrictedTitle(title: string): boolean {
  return STARTER_RESTRICTED.test(title || "");
}

export function isFragileTitle(title: string): boolean {
  return FRAGILE.test(title || "");
}

export type IdentityScore = {
  confidence: number;
  basis: string;
  sourcePack: number;
  destPack: number;
  /** @deprecated Prefer sourcePack */
  amazonPack: number;
  /** @deprecated Prefer destPack */
  ebayPack: number;
  reject: boolean;
  gtinExact: boolean;
};

/**
 * Exact product identity across any source to destination pair.
 * Legacy amazon/ebay keys still work as aliases for source/dest fields.
 */
export function scoreProductIdentity(opts: {
  sourceTitle?: string;
  destTitle?: string;
  sourceBrand?: string;
  destBrand?: string;
  sourceUpc?: string;
  destUpc?: string;
  sourceMpn?: string;
  destMpn?: string;
  matchedByGtin?: boolean;
  /** Legacy aliases */
  amazonTitle?: string;
  ebayTitle?: string;
  amazonBrand?: string;
  ebayBrand?: string;
  amazonUpc?: string;
  ebayUpc?: string;
  amazonMpn?: string;
  ebayMpn?: string;
  ebayMatchedByGtin?: boolean;
}): IdentityScore {
  const sourceTitle = opts.sourceTitle ?? opts.amazonTitle ?? "";
  const destTitle = opts.destTitle ?? opts.ebayTitle ?? "";
  const sourceBrand = opts.sourceBrand ?? opts.amazonBrand ?? "";
  const destBrand = opts.destBrand ?? opts.ebayBrand ?? "";
  const sourceUpc = opts.sourceUpc ?? opts.amazonUpc ?? "";
  const destUpc = opts.destUpc ?? opts.ebayUpc ?? "";
  const sourceMpn = opts.sourceMpn ?? opts.amazonMpn ?? "";
  const destMpn = opts.destMpn ?? opts.ebayMpn ?? "";
  const matchedByGtin = Boolean(
    opts.matchedByGtin ?? opts.ebayMatchedByGtin,
  );

  const sourcePack = extractPackQty(sourceTitle);
  const destPack = destTitle ? extractPackQty(destTitle) : sourcePack;
  if (destTitle && sourcePack !== destPack) {
    return {
      confidence: 0,
      basis: `Pack mismatch ${sourcePack} vs ${destPack}`,
      sourcePack,
      destPack,
      amazonPack: sourcePack,
      ebayPack: destPack,
      reject: true,
      gtinExact: false,
    };
  }

  const upcA = compact(sourceUpc);
  const upcB = compact(destUpc);
  const brandA = compact(sourceBrand);
  const brandB = compact(destBrand);
  const mpnA = compact(sourceMpn);
  const mpnB = compact(destMpn);

  let confidence = 0;
  const bits: string[] = [`${sourcePack}-pack`];
  let gtinExact = false;

  if ((upcA && upcB && upcA === upcB) || (upcA && matchedByGtin)) {
    confidence += 50;
    bits.push("UPC");
    gtinExact = true;
  } else if (upcA && !upcB) {
    confidence += 12;
    bits.push("Source UPC only");
  }

  if (brandA && brandB && brandA === brandB) {
    confidence += 20;
    bits.push("brand");
  } else if (brandA) {
    confidence += 6;
  }

  if (mpnA && mpnB && (mpnA === mpnB || mpnA.includes(mpnB) || mpnB.includes(mpnA))) {
    confidence += 25;
    bits.push("MPN");
  } else if (mpnA) {
    confidence += 8;
    bits.push("Source MPN only");
  }

  const sourceTokens = String(sourceTitle || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);
  const destText = String(destTitle || "").toLowerCase();
  if (destText && sourceTokens.length >= 3) {
    const hit = sourceTokens.filter((token) => destText.includes(token)).length;
    const ratio = hit / sourceTokens.length;
    confidence += Math.round(ratio * 10);
  }

  if (!upcA && !mpnA) confidence = Math.min(confidence, 59);
  if (gtinExact) {
    confidence = Math.max(confidence, 97);
  }

  return {
    confidence: Math.max(0, Math.min(100, confidence)),
    basis: bits.join(" · "),
    sourcePack,
    destPack,
    amazonPack: sourcePack,
    ebayPack: destPack,
    reject: false,
    gtinExact,
  };
}
