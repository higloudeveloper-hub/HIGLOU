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

export function scoreProductIdentity(opts: {
  amazonTitle?: string;
  ebayTitle?: string;
  amazonBrand?: string;
  ebayBrand?: string;
  amazonUpc?: string;
  ebayUpc?: string;
  amazonMpn?: string;
  ebayMpn?: string;
  ebayMatchedByGtin?: boolean;
}): {
  confidence: number;
  basis: string;
  amazonPack: number;
  ebayPack: number;
  reject: boolean;
} {
  const amazonPack = extractPackQty(opts.amazonTitle || "");
  const ebayPack = opts.ebayTitle
    ? extractPackQty(opts.ebayTitle)
    : amazonPack;
  if (opts.ebayTitle && amazonPack !== ebayPack) {
    return {
      confidence: 0,
      basis: `Pack mismatch ${amazonPack} vs ${ebayPack}`,
      amazonPack,
      ebayPack,
      reject: true,
    };
  }

  const upcA = compact(opts.amazonUpc || "");
  const upcB = compact(opts.ebayUpc || "");
  const brandA = compact(opts.amazonBrand || "");
  const brandB = compact(opts.ebayBrand || "");
  const mpnA = compact(opts.amazonMpn || "");
  const mpnB = compact(opts.ebayMpn || "");

  let confidence = 0;
  const bits: string[] = [`${amazonPack}-pack`];

  if ((upcA && upcB && upcA === upcB) || (upcA && opts.ebayMatchedByGtin)) {
    confidence += 50;
    bits.push("UPC");
  } else if (upcA && !upcB) {
    confidence += 12;
    bits.push("Amazon UPC only");
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
    bits.push("Amazon MPN only");
  }

  const amazonTokens = String(opts.amazonTitle || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);
  const ebayText = String(opts.ebayTitle || "").toLowerCase();
  if (ebayText && amazonTokens.length >= 3) {
    const hit = amazonTokens.filter((token) => ebayText.includes(token)).length;
    const ratio = hit / amazonTokens.length;
    confidence += Math.round(ratio * 10);
  }

  if (!upcA && !mpnA) confidence = Math.min(confidence, 59);
  if ((upcA && upcB && upcA === upcB) || (upcA && opts.ebayMatchedByGtin)) {
    confidence = Math.max(confidence, 97);
  }

  return {
    confidence: Math.max(0, Math.min(100, confidence)),
    basis: bits.join(" · "),
    amazonPack,
    ebayPack,
    reject: false,
  };
}
