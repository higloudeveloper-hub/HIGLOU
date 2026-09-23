/**
 * Facebook Page copy — pro, minimalist, credible.
 * Graph API has no markdown bold; we use Mathematical Bold Unicode
 * so key lines render as “negrita” in the feed.
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
  /** One-line card description for child_attachments */
  cardDescription: (priceLabel?: string | null) => string;
  /** Short card name polish */
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

/** First meaningful noun-ish chunk from a title for copy hooks. */
export function productHook(title: string): string {
  const clean = cleanTitle(title);
  if (!clean) return "este producto";
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

const ADS_HOOKS = [
  (h: string, p: string) =>
    `${facebookBold("Precio verificado")}\n${h}${p ? ` · ${p}` : ""}\nTocá. Compará. Comprá.`,
  (h: string, p: string) =>
    `${facebookBold("Higlou encontró esto")}\n${h}${p ? ` — ${p}` : ""}\nEl precio más limpio que vimos hoy.`,
  (h: string, p: string) =>
    `${facebookBold("WOW · vale la pena")}\n${h}${p ? ` · ${p}` : ""}\nVerificado. Sin ruido. Tocá el link.`,
  (h: string, p: string) =>
    `${facebookBold("Mejor precio · ahora")}\n${h}${p ? ` a ${p}` : ""}\nSelección Higlou · comprá seguro.`,
];

const CAROUSEL_HOOKS = [
  (n: number) =>
    `${facebookBold("Selección Higlou")}\n${n} productos · precios verificados\nDeslizá. Tocá el que te conviene.`,
  (n: number) =>
    `${facebookBold("Los más bajos hoy")}\n${n} hallazgos · sin relleno\nDeslizá y elegí. Higlou ya filtró.`,
  (n: number) =>
    `${facebookBold("Carrusel verificado")}\n${n} opciones serias · precio limpio\nTocá la tarjeta. Comprá directo.`,
];

const VITRINA_HOOKS = [
  () =>
    `${facebookBold("Vitrina Higlou")}\nPrecios bajos. Productos buenos.\nDeslizá y tocá el que te guste.`,
  () =>
    `${facebookBold("Curado · no spam")}\nSolo lo que pasa nuestro filtro.\nTocá. Compará. Listo.`,
  () =>
    `${facebookBold("La vitrina de hoy")}\nHallazgos reales · precio verificado\nEntrá. Deslizá. Comprá.`,
];

const VITRINA_TITLES = [
  "Selección Higlou",
  "Precios verificados",
  "Hallazgos de hoy",
  "Vitrina limpia",
  "Lo mejor · ahora",
];

/**
 * Build Page-ready copy: bold hook + short credible body.
 * Brand idea: Higlou is the platform that finds lowest prices + best products.
 */
export function buildFacebookPromoCopy(
  input: PromoCopyInput,
): PromoCopyResult {
  const seed = input.seed ?? Date.now();
  const titles = (input.titles || []).map(cleanTitle).filter(Boolean);
  const prices = (input.prices || []).filter(
    (p): p is string => Boolean(p && String(p).trim()),
  );
  const niche = String(input.niche || "").trim();
  const count = Math.max(titles.length, 1);
  const firstTitle = titles[0] || niche || "producto verificado";
  const hook = productHook(firstTitle);
  const price = prices[0] || "";

  let message: string;
  let collectionTitle: string;

  if (input.format === "ads") {
    message = pick(ADS_HOOKS, seed)(hook, price);
    collectionTitle = "Higlou";
  } else if (input.format === "carousel") {
    message = pick(CAROUSEL_HOOKS, seed)(count);
    if (niche) {
      message = `${facebookBold(niche)}\n${count} piezas · precio verificado\nDeslizá y tocá. Higlou filtró el ruido.`;
    }
    collectionTitle = niche ? `Selección · ${niche}` : "Selección Higlou";
  } else {
    message = pick(VITRINA_HOOKS, seed)();
    collectionTitle = niche
      ? `${niche} · Higlou`
      : pick(VITRINA_TITLES, seed);
  }

  return {
    message,
    collectionTitle: collectionTitle.slice(0, 80),
    cardDescription: (priceLabel) => {
      const p = String(priceLabel || "").trim();
      if (p) return `${p} · Precio verificado Higlou`.slice(0, 120);
      return "Precio verificado · Higlou";
    },
    cardName: (title) => {
      const cleaned = cleanTitle(title) || "Selección Higlou";
      return cleaned.slice(0, 80);
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
