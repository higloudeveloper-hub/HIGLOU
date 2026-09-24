/**
 * Keepa discount → human "% OFF" for Facebook cards / captions.
 * discount90 is usually 0–1; couponPercent is 0–100.
 */
export function keepaOffPercent(hit: {
  discount90?: number | null;
  couponPercent?: number | null;
}): number | null {
  const coupon = Number(hit.couponPercent);
  if (Number.isFinite(coupon) && coupon >= 5) {
    return Math.min(90, Math.round(coupon));
  }
  const d = Number(hit.discount90);
  if (!Number.isFinite(d) || d <= 0) return null;
  const pct = d <= 1 ? d * 100 : d;
  if (pct < 5) return null;
  return Math.min(90, Math.round(pct));
}

/** Campaign / studio chrome that must never appear as a product title on FB. */
const JUNK_PROMO_TITLES = [
  /^facebook\s*ads?$/i,
  /^facebook$/i,
  /^ron(\s+agent)?$/i,
  /^higlou$/i,
  /^affiliate$/i,
  /^afiliado$/i,
  /^keepa(\s+winners)?$/i,
  /^default$/i,
  /^smart\s*link$/i,
  /^\/?go$/i,
  /^selecci[oó]n$/i,
  /^deal$/i,
  /^product$/i,
];

export function isJunkPromoTitle(raw: string | null | undefined): boolean {
  const t = String(raw || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!t || t.length < 2) return true;
  if (t.length > 80 && !/[a-z]/i.test(t)) return true;
  return JUNK_PROMO_TITLES.some((re) => re.test(t));
}

/** Prefer a real product name over affiliate/campaign chrome. */
export function pickProductTitle(
  ...candidates: Array<string | null | undefined>
): string {
  for (const c of candidates) {
    const t = String(c || "")
      .trim()
      .replace(/\s+/g, " ");
    if (!t || isJunkPromoTitle(t)) continue;
    return t;
  }
  return "Deal";
}
