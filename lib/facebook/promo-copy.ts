import { shortenFacebookCardTitle } from "@/lib/facebook/promo-media";
import { isJunkPromoTitle } from "@/lib/facebook/promo-title";

/**
 * Facebook Page copy — Amazon Deals editorial aesthetic.
 * Product name first. Keepa % OFF when known. Never "Facebook Ads".
 */

export type PromoFormat = "ads" | "carousel" | "vitrina";

export type PromoCopyInput = {
  format: PromoFormat;
  /** Product titles already selected (or empty for defaults) */
  titles?: string[];
  /** Price labels like "$24.99" */
  prices?: Array<string | null | undefined>;
  /** Keepa / coupon off % (5–90) aligned with titles */
  discountPercents?: Array<number | null | undefined>;
  /** Optional niche / brand hint */
  niche?: string | null;
  /** Seed so regenerate feels fresh */
  seed?: number;
};

export type PromoCopyResult = {
  /** Full post message (may include bold unicode) */
  message: string;
  /** Vitrina collection title */
  collectionTitle: string;
  /** One-line card description — % OFF + price */
  cardDescription: (
    priceLabel?: string | null,
    discountPercent?: number | null,
  ) => string;
  /** Short card name — product title only */
  cardName: (title: string) => string;
};

/** A–Z a–z 0–9 → Mathematical Bold (appears bold in FB feed). */
const BOLD_MAP: Record<string, string> = {};
(() => {
  const upper = "𝗔𝗕𝗖𝗗𝗘𝗙𝗚𝗛𝗜𝗝𝗞𝗟𝗠𝗡𝗢𝗣𝗤𝗥𝗦𝗧𝗨𝗩𝗪𝗫𝗬𝗭";
  const lower = "𝗮𝗯𝗰𝗱𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘂𝘃𝘄𝘅𝘆𝘇";
  const digits = "𝟬𝟭𝟮𝟯𝟰𝟱𝟲𝟳𝟴𝟵";
  for (let i = 0; i < 26; i++) {
    BOLD_MAP[String.fromCharCode(65 + i)] = [...upper][i]!;
    BOLD_MAP[String.fromCharCode(97 + i)] = [...lower][i]!;
  }
  for (let i = 0; i < 10; i++) {
    BOLD_MAP[String(i)] = [...digits][i]!;
  }
})();

const RULE = "━━━━━━━━━━━━";
const RULE_SHORT = "━━━━━━━━━━━";

/** Bold only Latin letters/digits; keep punctuation & accents readable. */
export function facebookBold(text: string): string {
  return [...String(text || "")]
    .map((ch) => BOLD_MAP[ch] ?? ch)
    .join("");
}

function pickSeed(seed = 0): number {
  return Math.abs(seed);
}

function cleanTitle(raw: string): string {
  return String(raw || "")
    .replace(/^ASIN\s+[A-Z0-9]{10}\b/i, "")
    .replace(/\bB0[A-Z0-9]{8}\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanNiche(raw?: string | null): string {
  const n = String(raw || "").trim();
  if (!n) return "";
  if (isJunkPromoTitle(n)) return "";
  if (/^\/?go$/i.test(n)) return "";
  if (/higlou|facebook|afiliado|affiliate|market|selecci/i.test(n)) return "";
  return n.slice(0, 32);
}

function normalizeOff(pct?: number | null): number | null {
  const n = Number(pct);
  if (!Number.isFinite(n) || n < 5) return null;
  return Math.min(90, Math.round(n));
}

function priceOnly(priceLabel?: string | null): string {
  const p = String(priceLabel || "").trim();
  if (!p) return "";
  return p.slice(0, 24);
}

function offLine(pct: number): string {
  return facebookBold(`${pct}% OFF`);
}

/** First meaningful noun-ish chunk from a title for copy hooks. */
export function productHook(title: string): string {
  const clean = cleanTitle(title);
  if (!clean || isJunkPromoTitle(clean)) return "Deal";
  const stop = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "for",
    "with",
    "de",
    "la",
    "el",
    "los",
    "las",
    "un",
    "una",
    "y",
    "o",
    "para",
    "con",
    "pack",
    "set",
    "new",
    "nuevo",
  ]);
  const words = clean
    .split(/[\s\-–,|/]+/)
    .map((w) => w.replace(/[^a-zA-Z0-9áéíóúñüÁÉÍÓÚÑÜ]/g, ""))
    .filter((w) => w.length >= 3 && !stop.has(w.toLowerCase()));
  const hook = words.slice(0, 3).join(" ");
  return hook || clean.slice(0, 32);
}

/**
 * Build Page-ready copy: product name + optional Keepa % OFF + CTA.
 * Cards: product name + (% OFF · price).
 */
export function buildFacebookPromoCopy(
  input: PromoCopyInput,
): PromoCopyResult {
  const seed = pickSeed(input.seed ?? Date.now());
  const niche = cleanNiche(input.niche);
  const titles = (input.titles || [])
    .map((t) => cleanTitle(String(t || "")))
    .filter((t) => t && !isJunkPromoTitle(t));
  const primaryTitle = titles[0] || "";
  const hook = productHook(primaryTitle);
  const discounts = (input.discountPercents || []).map(normalizeOff);
  const offs = discounts.filter((d): d is number => d != null);
  const off = offs.length ? Math.max(...offs) : null;

  let message: string;
  let collectionTitle: string;

  if (input.format === "ads") {
    message = [
      facebookBold(hook),
      RULE,
      ...(off != null ? [offLine(off)] : []),
      `${facebookBold("SHOP NOW")} →`,
    ].join("\n");
    collectionTitle = shortenFacebookCardTitle(
      primaryTitle || "Today's Deal",
      40,
    );
  } else if (input.format === "carousel") {
    // Always lead with the product name — never campaign chrome
    const head =
      hook !== "Deal"
        ? hook
        : niche || "Top Deals";
    message = [
      facebookBold(String(head).slice(0, 28).toUpperCase()),
      RULE_SHORT,
      ...(off != null ? [offLine(off)] : []),
      `${facebookBold("SWIPE")} → ${facebookBold("SHOP")}`,
    ].join("\n");
    collectionTitle = shortenFacebookCardTitle(
      primaryTitle || niche || head,
      40,
    );
  } else {
    const head =
      hook !== "Deal"
        ? hook
        : niche || "Today's Deals";
    message = [
      facebookBold(String(head).slice(0, 28).toUpperCase()),
      RULE_SHORT,
      ...(off != null ? [offLine(off)] : []),
      `${facebookBold("SWIPE")} → ${facebookBold("SHOP")}`,
    ].join("\n");
    collectionTitle = shortenFacebookCardTitle(
      primaryTitle || niche || head,
      40,
    );
  }

  // seed reserved for future variant rotation
  void seed;

  return {
    message,
    collectionTitle: collectionTitle.slice(0, 60),
    cardDescription: (priceLabel, discountPercent) => {
      const pct = normalizeOff(discountPercent) ?? off;
      const price = priceOnly(priceLabel);
      if (pct != null && price) return `${pct}% OFF · ${price}`;
      if (pct != null) return `${pct}% OFF`;
      return price;
    },
    cardName: (title) => {
      const t = cleanTitle(title);
      if (isJunkPromoTitle(t)) {
        return shortenFacebookCardTitle(primaryTitle || "Deal", 36);
      }
      return shortenFacebookCardTitle(t, 36);
    },
  };
}

/** Default message when UI first loads (ads). */
export function defaultFacebookPromoMessage(
  format: PromoFormat = "ads",
): string {
  return buildFacebookPromoCopy({ format, seed: 1 }).message;
}

export function defaultFacebookCollectionTitle(): string {
  return buildFacebookPromoCopy({ format: "vitrina", seed: 1 }).collectionTitle;
}
