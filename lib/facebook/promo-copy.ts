import { shortenFacebookCardTitle } from "@/lib/facebook/promo-media";

/**
 * Facebook Page copy — Amazon Deals editorial aesthetic.
 * Ultra-short, premium, minimal. Graph has no markdown; we use
 * Mathematical Bold Unicode so hooks read as bold in the feed.
 */

export type PromoFormat = "ads" | "carousel" | "vitrina";

export type PromoCopyInput = {
  format: PromoFormat;
  /** Product titles already selected (or empty for defaults) */
  titles?: string[];
  /** Price labels like "$24.99" */
  prices?: Array<string | null | undefined>;
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
  /** One-line card description for child_attachments — price only */
  cardDescription: (priceLabel?: string | null) => string;
  /** Short card name polish — product title only */
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

function pick<T>(items: T[], seed = 0): T {
  if (!items.length) throw new Error("empty pick");
  return items[Math.abs(seed) % items.length]!;
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
  if (/^\/?go$/i.test(n)) return "";
  if (/afiliado|affiliate|smart\s*link|higlou/i.test(n) && n.length < 12) {
    return "";
  }
  return n.slice(0, 32);
}

/** Price only — no "verificado", no Amazon suffix. */
function priceOnly(priceLabel?: string | null): string {
  const p = String(priceLabel || "").trim();
  if (!p) return "";
  // Keep $xx.xx if already a money label; otherwise pass through short label
  return p.slice(0, 24);
}

/** First meaningful noun-ish chunk from a title for copy hooks. */
export function productHook(title: string): string {
  const clean = cleanTitle(title);
  if (!clean) return "Deal";
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

/** Single-product deal posts — editorial, not salesy. */
const ADS_HOOKS = [
  () =>
    `${facebookBold("TODAY'S DEAL")}\n${RULE}\n${facebookBold("SHOP NOW")} →`,
  () =>
    `${facebookBold("DEAL OF THE DAY")}\n${RULE}\n${facebookBold("SHOP")} →`,
  () =>
    `${facebookBold("TODAY")}\n${RULE_SHORT}\n${facebookBold("SHOP NOW")} →`,
];

/** Carousel / multi — Amazon Deals swipe energy. */
const CAROUSEL_HOOKS = [
  () =>
    `${facebookBold("TOP DEALS")}\n${RULE_SHORT}\n${facebookBold("SWIPE")} → ${facebookBold("SHOP")}`,
  () =>
    `${facebookBold("TODAY'S PICKS")}\n${RULE_SHORT}\n${facebookBold("SWIPE")} → ${facebookBold("SHOP")}`,
  () =>
    `${facebookBold("DEALS")}\n${RULE_SHORT}\n${facebookBold("SWIPE TO SHOP")} →`,
];

/** Vitrina / collection — same retail-premium language. */
const VITRINA_HOOKS = [
  () =>
    `${facebookBold("TOP DEALS")}\n${RULE_SHORT}\n${facebookBold("SWIPE")} → ${facebookBold("SHOP")}`,
  () =>
    `${facebookBold("CURATED")}\n${RULE_SHORT}\n${facebookBold("SWIPE")} → ${facebookBold("SHOP")}`,
  () =>
    `${facebookBold("TODAY'S DEALS")}\n${RULE}\n${facebookBold("SHOP NOW")} →`,
];

const VITRINA_TITLES = ["Top Deals", "Today's Deals", "Deals", "Picks"];

/**
 * Build Page-ready copy: bold deal line + rule + CTA.
 * Cards: product name + price only.
 */
export function buildFacebookPromoCopy(
  input: PromoCopyInput,
): PromoCopyResult {
  const seed = input.seed ?? Date.now();
  const niche = cleanNiche(input.niche);

  let message: string;
  let collectionTitle: string;

  if (input.format === "ads") {
    message = pick(ADS_HOOKS, seed)();
    collectionTitle = "Today's Deal";
  } else if (input.format === "carousel") {
    message = pick(CAROUSEL_HOOKS, seed)();
    collectionTitle = niche || "Top Deals";
  } else {
    message = pick(VITRINA_HOOKS, seed)();
    collectionTitle = niche || pick(VITRINA_TITLES, seed);
  }

  return {
    message,
    collectionTitle: collectionTitle.slice(0, 60),
    cardDescription: (priceLabel) => priceOnly(priceLabel),
    cardName: (title) => shortenFacebookCardTitle(title, 36),
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
