/**
 * Ready-made vitrinas + carousels from related products.
 * Groups by shared title tokens + brand + price band so Higlou can
 * recommend “vitrinas ya hechas” the user can publish in one tap.
 */

import { isWeakFacebookPictureUrl } from "@/lib/facebook/promo-media";

export type PromoGroupCard = {
  id: string;
  title: string;
  brand?: string | null;
  priceLabel?: string | null;
  asin?: string | null;
  meta?: string | null;
  imageUrl?: string | null;
  imageFallbacks?: string[] | null;
};

export type PromoPackSuggestion = {
  id: string;
  label: string;
  blurb: string;
  /** Card ids to select */
  cardIds: string[];
  /** Best format for this pack size */
  format: "carousel" | "vitrina";
  /** Strength 0–1 */
  score: number;
  /** Niche/brand for copy */
  niche: string;
  /** Preview image urls (same order as cardIds when available) */
  imageUrls: string[];
  /** Short titles for UI chips */
  titles: string[];
};

/** Real https photo — never ads-system / 1×1 P-ASIN stubs. */
export function promoCardHasUsablePhoto(
  card: Pick<PromoGroupCard, "imageUrl" | "imageFallbacks">,
): boolean {
  const urls = [
    String(card.imageUrl || "").trim(),
    ...((card.imageFallbacks || []).map((u) => String(u || "").trim())),
  ].filter(Boolean);
  return urls.some(
    (u) => /^https?:\/\//i.test(u) && !isWeakFacebookPictureUrl(u),
  );
}

export function bestPromoCardPhoto(
  card: Pick<PromoGroupCard, "imageUrl" | "imageFallbacks">,
): string {
  const urls = [
    String(card.imageUrl || "").trim(),
    ...((card.imageFallbacks || []).map((u) => String(u || "").trim())),
  ].filter((u, i, arr) => Boolean(u) && arr.indexOf(u) === i);
  const strong = urls.find(
    (u) => /^https?:\/\//i.test(u) && !isWeakFacebookPictureUrl(u),
  );
  return strong || "";
}

const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "pack",
  "set",
  "new",
  "pcs",
  "piece",
  "pieces",
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
  "por",
  "del",
  "al",
  "en",
  "of",
  "to",
  "in",
  "on",
  "a",
  "an",
  "or",
  "by",
  "asin",
  "offer",
  "oferta",
  "verificada",
  "amazon",
  "ebay",
  "home",
  "kit",
  "size",
  "color",
  "black",
  "white",
  "blue",
  "red",
  "go",
  "afiliado",
  "affiliate",
  "higlou",
  "seleccion",
  "selección",
  "listing",
  "smart",
  "link",
  "tag",
]);

/** Brands / niche labels that come from UI chrome, not products. */
const JUNK_BRAND = new Set([
  "go",
  "/go",
  "afiliado",
  "affiliate",
  "amazon",
  "ebay",
  "listing",
  "higlou",
  "seleccion",
  "selección",
  "smart",
  "tag",
  "promo",
  "cualquiera",
  "market",
  "mis listings",
]);

export function isJunkBrand(raw: string | null | undefined): boolean {
  const t = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^\/+/, "");
  if (!t || t.length < 2) return true;
  if (JUNK_BRAND.has(t) || JUNK_BRAND.has(`/${t}`)) return true;
  if (/^go(\b|$)/i.test(t)) return true;
  if (/^\/?go\b/i.test(String(raw || "").trim())) return true;
  return false;
}

/**
 * Stable fingerprint so the same product photo is not packed twice —
 * even when ASINs differ or Amazon serves the same I/{id} with different sizes.
 */
export function productImageKey(url?: string | null): string {
  const raw = String(url || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  // Amazon media I/{imageId} — strip size suffixes so SL500 ≡ SL1500
  const amzImg = lower.match(
    /\/images\/i\/([a-z0-9+_-]+?)(?:\._[^/?#]+)?(?:\.(?:jpe?g|png|webp|gif))?(?:[?#]|$)/i,
  )?.[1];
  if (amzImg && amzImg.length >= 3) {
    return `amzimg:${amzImg.replace(/\._.+$/i, "").replace(/\.(jpe?g|png|webp|gif)$/i, "")}`;
  }
  const fromQuery = lower.match(/[?&]asin=([a-z0-9]{10})\b/i)?.[1];
  const fromPath = lower.match(/\/(?:images\/)?p\/([a-z0-9]{10})\./i)?.[1];
  const asin = (fromQuery || fromPath || "").toUpperCase();
  if (asin) return `asin:${asin}`;
  try {
    const u = new URL(raw);
    // Strip query + CDN random suffix noise for stable path compare
    const path = u.pathname.replace(/\/[a-f0-9-]{36}(?=\.[a-z]+$)/i, "");
    return `path:${u.hostname}${path}`.toLowerCase();
  } catch {
    return `raw:${lower.slice(0, 160)}`;
  }
}

function tokens(title: string): string[] {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñü\s]/gi, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t));
}

function brandOf(card: PromoGroupCard): string {
  const fromField = String(card.brand || "").trim();
  if (fromField && !isJunkBrand(fromField)) return fromField.toLowerCase();
  const meta = String(card.meta || "");
  const m = meta.match(/(?:Amazon|eBay|Listing)\s*·\s*(.+)$/i);
  if (m?.[1] && !isJunkBrand(m[1])) return m[1].trim().toLowerCase();
  // Never treat "Afiliado · /go" as a brand
  if (/afiliado|affiliate|\/go/i.test(meta)) return "";
  const toks = tokens(card.title);
  return toks[0] || "";
}

function priceBand(label?: string | null): number | null {
  if (!label) return null;
  const n = Number(String(label).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 15) return 0;
  if (n < 30) return 1;
  if (n < 50) return 2;
  if (n < 80) return 3;
  return 4;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

function asinOf(card: PromoGroupCard): string {
  return String(card.asin || "")
    .trim()
    .toUpperCase();
}

/** Exact title fingerprint — collapses whitespace, keeps color/size suffixes. */
export function productTitleKey(title?: string | null): string {
  return String(title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9áéíóúñü\s·.-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/**
 * Drop duplicate products before clustering / publish.
 * Same ASIN, same photo, or same title = same product (never twin cards
 * in a carousel or vitrina). Color/Size suffixes keep variation titles unique.
 */
export function dedupePromoCards(cards: PromoGroupCard[]): PromoGroupCard[] {
  const seenAsin = new Set<string>();
  const seenImg = new Set<string>();
  const seenTitle = new Set<string>();
  const out: PromoGroupCard[] = [];
  for (const c of cards) {
    if (!c.id || !String(c.title || "").trim()) continue;
    const asin = asinOf(c);
    if (asin && seenAsin.has(asin)) continue;
    const img = productImageKey(c.imageUrl);
    if (img && seenImg.has(img)) continue;
    const titleKey = productTitleKey(c.title);
    if (titleKey && seenTitle.has(titleKey)) continue;
    if (asin) seenAsin.add(asin);
    if (img) seenImg.add(img);
    if (titleKey) seenTitle.add(titleKey);
    out.push(c);
  }
  return out;
}

/**
 * Product family anchors — two products must share a family (or ≥2
 * content tokens) to count as related. Brand alone is never enough
 * (Anker cable ≠ Anker toothbrush).
 */
const PRODUCT_FAMILIES: Record<string, string[]> = {
  tablet: ["tablet", "tableta", "ipad"],
  phone: ["phone", "iphone", "smartphone", "celular", "galaxy"],
  laptop: ["laptop", "notebook", "chromebook", "macbook"],
  charger: [
    "charger",
    "charging",
    "cargador",
    "powerbank",
    "bank",
    "usb",
    "cable",
    "adapter",
    "wallwart",
  ],
  headphone: [
    "headphone",
    "earbuds",
    "earbud",
    "earphone",
    "auricular",
    "headset",
    "buds",
  ],
  speaker: ["speaker", "bluetooth", "soundbar", "altavoz"],
  camera: ["camera", "webcam", "gopro", "lens", "camara"],
  watch: ["watch", "smartwatch", "fitnessband", "reloj"],
  kitchen: [
    "knife",
    "blender",
    "cookware",
    "kitchen",
    "pan",
    "pot",
    "utensil",
    "cuchillo",
  ],
  supplement: [
    "supplement",
    "capsule",
    "capsules",
    "vitamin",
    "vitamins",
    "pill",
    "pills",
    "softgel",
    "gummy",
    "gummies",
    "powder",
    "probiotic",
    "collagen",
    "omega",
    "multivitamin",
    "suplemento",
    "pastilla",
    "pastillas",
  ],
  beauty: [
    "serum",
    "moisturizer",
    "skincare",
    "cream",
    "shampoo",
    "conditioner",
    "makeup",
    "cosmetic",
    "toothbrush",
    "toothpaste",
    "razor",
  ],
  toy: ["toy", "toys", "lego", "puzzle", "juguete", "juguetes"],
  pet: ["dog", "cat", "pet", "perro", "gato", "mascota"],
  tool: ["drill", "screwdriver", "wrench", "hammer", "tool", "tools"],
  light: ["lamp", "bulb", "flashlight", "led", "lighting", "luz"],
  bag: ["backpack", "luggage", "suitcase", "bag", "tote", "mochila"],
  shoe: ["shoe", "shoes", "sneaker", "sneakers", "boot", "boots", "zapato"],
  printer: ["printer", "ink", "toner", "labelmaker", "label"],
  monitor: ["monitor", "display", "screen"],
  mouse: ["mouse", "keyboard", "teclado", "keypad"],
};

function familyOfTitle(title: string): Set<string> {
  const toks = new Set(tokens(title));
  const joined = toks;
  // also match compound powerbank etc already tokenized
  const families = new Set<string>();
  for (const [family, keys] of Object.entries(PRODUCT_FAMILIES)) {
    for (const key of keys) {
      if (joined.has(key)) {
        families.add(family);
        break;
      }
      // multi-word keys collapsed
      if (key.includes(" ") && title.toLowerCase().includes(key)) {
        families.add(family);
        break;
      }
    }
  }
  return families;
}

/** Shared product families between two titles (tablet∩tablet, not tablet∩pill). */
export function sharedProductFamilies(
  a: PromoGroupCard,
  b: PromoGroupCard,
): string[] {
  const fa = familyOfTitle(a.title);
  const fb = familyOfTitle(b.title);
  return [...fa].filter((f) => fb.has(f));
}

/**
 * Hard relatedness gate for RON / strict packs.
 * Same brand alone is NOT enough. Need shared family or ≥2 title tokens.
 * Different known families (tablet vs supplement) always fail.
 */
export function productsAreStrictlyRelated(
  a: PromoGroupCard,
  b: PromoGroupCard,
): boolean {
  const aa = asinOf(a);
  const bb = asinOf(b);
  if (aa && bb && aa === bb) return false;
  const ia = productImageKey(a.imageUrl);
  const ib = productImageKey(b.imageUrl);
  if (ia && ib && ia === ib) return false;

  const fa = familyOfTitle(a.title);
  const fb = familyOfTitle(b.title);
  const families = [...fa].filter((f) => fb.has(f));
  if (families.length >= 1) return true;
  // Known family clash → never related (tablet ≠ pill, even with shared brand)
  if (fa.size > 0 && fb.size > 0) return false;

  const ta = new Set(tokens(a.title).slice(0, 12));
  const tb = new Set(tokens(b.title).slice(0, 12));
  const shared = [...ta].filter((t) => tb.has(t));
  // Require 2+ meaningful tokens when no family match
  if (shared.length >= 2) return true;

  return false;
}

/** Every pair in the pack must pass the strict gate. */
export function isCoherentPromoPack(cards: PromoGroupCard[]): boolean {
  if (cards.length < 2) return true;
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      if (!productsAreStrictlyRelated(cards[i]!, cards[j]!)) return false;
    }
  }
  // Also: whole pack should share one family when any card has a family
  const familySets = cards.map((c) => familyOfTitle(c.title));
  const withFamily = familySets.filter((s) => s.size > 0);
  if (withFamily.length >= 2) {
    let inter = new Set(withFamily[0]);
    for (const s of withFamily.slice(1)) {
      inter = new Set([...inter].filter((f) => s.has(f)));
    }
    if (inter.size === 0) return false;
  }
  return true;
}

/** Relatedness of two products (0–1). Soft thresholds so real catalogs cluster. */
export function productRelatedness(
  a: PromoGroupCard,
  b: PromoGroupCard,
): number {
  const aa = asinOf(a);
  const bb = asinOf(b);
  if (aa && bb && aa === bb) return 0; // identical — never “related”, it's a dup

  const ia = productImageKey(a.imageUrl);
  const ib = productImageKey(b.imageUrl);
  if (ia && ib && ia === ib) return 0;

  const ta = new Set(tokens(a.title).slice(0, 10));
  const tb = new Set(tokens(b.title).slice(0, 10));
  let s = jaccard(ta, tb) * 0.55;

  // Shared anchor token (category-ish word)
  const shared = [...ta].filter((t) => tb.has(t));
  if (shared.length >= 2) s += 0.22;
  else if (shared.length === 1) s += 0.12;

  const families = sharedProductFamilies(a, b);
  if (families.length >= 1) s += 0.35;
  else {
    // Different known families → hard clash (tablet vs supplement)
    const fa = familyOfTitle(a.title);
    const fb = familyOfTitle(b.title);
    if (fa.size && fb.size) return Math.min(s, 0.08);
  }

  const ba = brandOf(a);
  const bbBrand = brandOf(b);
  // Brand only helps when already family/token related — never alone
  if (
    ba &&
    bbBrand &&
    ba === bbBrand &&
    !isJunkBrand(ba) &&
    (families.length >= 1 || shared.length >= 1)
  ) {
    s += 0.18;
  }

  const pa = priceBand(a.priceLabel);
  const pb = priceBand(b.priceLabel);
  if (pa != null && pb != null && Math.abs(pa - pb) <= 1) s += 0.08;

  return Math.min(1, s);
}

function titleCase(word: string): string {
  return word.replace(/\b\w/g, (c) => c.toUpperCase());
}

function nicheLabel(cards: PromoGroupCard[]): string {
  const brandCounts = new Map<string, number>();
  const tokenCounts = new Map<string, number>();
  for (const c of cards) {
    const b = brandOf(c);
    if (b && !isJunkBrand(b)) {
      brandCounts.set(b, (brandCounts.get(b) || 0) + 1);
    }
    for (const t of tokens(c.title).slice(0, 6)) {
      if (STOP.has(t) || isJunkBrand(t)) continue;
      tokenCounts.set(t, (tokenCounts.get(t) || 0) + 1);
    }
  }
  const topBrand = [...brandCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topBrand && topBrand[1] >= 2) {
    return titleCase(topBrand[0]);
  }
  const topTok = [...tokenCounts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])[0];
  if (topTok) {
    return titleCase(topTok[0]);
  }
  const first = tokens(cards[0]?.title || "").find(
    (t) => !isJunkBrand(t) && !STOP.has(t),
  );
  return first ? titleCase(first) : "Selección";
}

function packFromCluster(
  cluster: PromoGroupCard[],
  format: "carousel" | "vitrina",
  score: number,
  opts?: { strict?: boolean },
): PromoPackSuggestion | null {
  // Hard uniqueness inside the pack
  let unique = dedupePromoCards(cluster);
  if (opts?.strict) {
    // Trim until coherent — drop weakest outliers from the end
    while (unique.length >= (format === "vitrina" ? 3 : 2)) {
      if (isCoherentPromoPack(unique)) break;
      unique = unique.slice(0, -1);
    }
    if (!isCoherentPromoPack(unique)) return null;
  }
  const sized =
    format === "vitrina"
      ? unique.slice(0, Math.min(8, Math.max(3, unique.length)))
      : unique.slice(0, Math.min(5, Math.max(2, unique.length)));

  // Every card in the pack must carry a real photo — never empty vitrina thumbs
  const withPhotos = sized.filter(promoCardHasUsablePhoto);
  if (format === "vitrina" && withPhotos.length < 3) return null;
  if (format === "carousel" && withPhotos.length < 2) return null;
  const finalCards = withPhotos;

  if (opts?.strict && !isCoherentPromoPack(finalCards)) return null;

  const niche = nicheLabel(finalCards);
  // Never ship chrome niches like "/Go"
  const safeNiche = isJunkBrand(niche) ? "Selección" : niche;
  const imageUrls = finalCards
    .map((c) => bestPromoCardPhoto(c))
    .filter(Boolean);
  if (imageUrls.length < finalCards.length) return null;

  return {
    id: `${format}:${finalCards.map((c) => c.id).join("|").slice(0, 56)}`,
    label:
      format === "vitrina"
        ? `Vitrina lista · ${safeNiche}`
        : `Carrusel · ${safeNiche}`,
    blurb:
      format === "vitrina"
        ? `${finalCards.length} productos relacionados · lista para publicar`
        : `${finalCards.length} productos del mismo tipo · carrusel listo`,
    cardIds: finalCards.map((c) => c.id),
    format,
    score: Math.round(score * 100) / 100,
    niche: safeNiche,
    imageUrls,
    titles: finalCards.map((c) => String(c.title || "").slice(0, 40)),
  };
}

/**
 * Grow a relatedness cluster from a seed card.
 */
function growCluster(
  seed: PromoGroupCard,
  pool: PromoGroupCard[],
  used: Set<string>,
  minScore: number,
  maxSize: number,
  opts?: { strict?: boolean },
): PromoGroupCard[] {
  const cluster: PromoGroupCard[] = [seed];
  const ids = new Set([seed.id]);
  const asins = new Set<string>(asinOf(seed) ? [asinOf(seed)] : []);
  const images = new Set<string>(
    productImageKey(seed.imageUrl) ? [productImageKey(seed.imageUrl)] : [],
  );

  while (cluster.length < maxSize) {
    let best: { c: PromoGroupCard; s: number } | null = null;
    for (const c of pool) {
      if (ids.has(c.id) || used.has(c.id)) continue;
      const asin = asinOf(c);
      if (asin && asins.has(asin)) continue;
      const img = productImageKey(c.imageUrl);
      if (img && images.has(img)) continue;
      if (opts?.strict && !productsAreStrictlyRelated(seed, c)) continue;
      if (
        opts?.strict &&
        !cluster.every((m) => productsAreStrictlyRelated(m, c))
      ) {
        continue;
      }
      const s =
        cluster.reduce((sum, m) => sum + productRelatedness(m, c), 0) /
        cluster.length;
      if (s < minScore) continue;
      if (!best || s > best.s) best = { c, s };
    }
    if (!best) break;
    cluster.push(best.c);
    ids.add(best.c.id);
    const asin = asinOf(best.c);
    if (asin) asins.add(asin);
    const img = productImageKey(best.c.imageUrl);
    if (img) images.add(img);
  }
  return cluster;
}

/**
 * Recommend ready-made vitrinas (3–8 related) first, then carousels (2–5).
 */
export function suggestPromoPacks(
  cards: PromoGroupCard[],
  opts?: {
    limit?: number;
    preferVitrina?: boolean;
    /** Minimum pairwise relatedness (default 0.22; RON uses ~0.48) */
    minRelated?: number;
    /** Skip price-band-only packs (tablets + pills). Default false for studio. */
    disallowPriceBandFallback?: boolean;
    /**
     * RON mode: every pair must share a product family or ≥2 title tokens.
     * Brand / price alone never groups products.
     */
    strict?: boolean;
  },
): PromoPackSuggestion[] {
  // Ghost ASINs without real photos never enter vitrinas / carousels
  const pool = dedupePromoCards(cards)
    .map((c) => ({
      ...c,
      imageUrl: bestPromoCardPhoto(c) || c.imageUrl,
    }))
    .filter(promoCardHasUsablePhoto);
  if (pool.length < 2) return [];

  const preferVitrina = opts?.preferVitrina !== false;
  const limit = Math.min(Math.max(opts?.limit ?? 6, 1), 8);
  const used = new Set<string>();
  const suggestions: PromoPackSuggestion[] = [];
  const strict = Boolean(opts?.strict);
  const minRelated = Math.max(
    0.18,
    Math.min(0.55, opts?.minRelated ?? (strict ? 0.48 : 0.22)),
  );
  const disallowPriceBand =
    Boolean(opts?.disallowPriceBandFallback) || strict;
  const growOpts = strict ? { strict: true as const } : undefined;

  // Rank seeds by how many neighbors they have (dense relatedness hubs).
  const hubs = pool
    .map((c) => {
      const neighbors = pool.filter((o) => {
        if (o.id === c.id) return false;
        if (strict && !productsAreStrictlyRelated(c, o)) return false;
        return productRelatedness(c, o) >= minRelated;
      }).length;
      return { c, neighbors };
    })
    .sort((a, b) => b.neighbors - a.neighbors);

  // Pass 1 — Vitrinas ya hechas (need ≥3 related)
  if (preferVitrina && pool.length >= 3) {
    for (const hub of hubs) {
      if (suggestions.length >= limit) break;
      if (used.has(hub.c.id)) continue;
      const cluster = growCluster(
        hub.c,
        pool,
        used,
        minRelated,
        8,
        growOpts,
      );
      if (cluster.length < 3) continue;
      if (strict && !isCoherentPromoPack(cluster)) continue;
      // Hard gate: average relatedness must clear the bar (no mixed junk packs)
      const avg = clusterAvgRelatedness(cluster);
      if (avg < minRelated) continue;
      const pack = packFromCluster(
        cluster,
        "vitrina",
        Math.max(avg, minRelated),
        growOpts,
      );
      if (!pack) continue;
      for (const c of cluster.slice(0, pack.cardIds.length)) used.add(c.id);
      suggestions.push(pack);
    }
  }

  // Pass 2 — Carousels from leftovers (pairs+)
  for (const hub of hubs) {
    if (suggestions.length >= limit) break;
    if (used.has(hub.c.id)) continue;
    const cluster = growCluster(
      hub.c,
      pool,
      used,
      minRelated,
      5,
      growOpts,
    );
    if (cluster.length < 2) continue;
    if (strict && !isCoherentPromoPack(cluster)) continue;
    const format: "carousel" | "vitrina" =
      preferVitrina && cluster.length >= 3 ? "vitrina" : "carousel";
    const avg = clusterAvgRelatedness(cluster);
    if (avg < minRelated * 0.9) continue;
    const pack = packFromCluster(
      cluster,
      format,
      Math.max(avg, minRelated * 0.9),
      growOpts,
    );
    if (!pack) continue;
    for (const c of cluster.slice(0, pack.cardIds.length)) used.add(c.id);
    suggestions.push(pack);
  }

  // Pass 3 — Fallback: same price band (studio only — RON disables this)
  if (
    !disallowPriceBand &&
    suggestions.filter((s) => s.format === "vitrina").length < 1 &&
    pool.length >= 3
  ) {
    const byBand = new Map<number, PromoGroupCard[]>();
    for (const c of pool) {
      if (used.has(c.id)) continue;
      const b = priceBand(c.priceLabel) ?? 2;
      const list = byBand.get(b) || [];
      list.push(c);
      byBand.set(b, list);
    }
    for (const list of [...byBand.values()].sort(
      (a, b) => b.length - a.length,
    )) {
      if (suggestions.length >= limit) break;
      if (list.length < 3) continue;
      const slice = dedupePromoCards(list).slice(0, 6);
      const pack = packFromCluster(slice, "vitrina", 0.2);
      if (!pack) continue;
      suggestions.push({
        ...pack,
        label: `Vitrina lista · ${pack.niche}`,
        blurb: `${slice.length} relacionados por precio · lista para publicar`,
      });
      for (const c of slice) used.add(c.id);
    }
  }

  return suggestions
    .map((s) => ({
      ...s,
      cardIds: [...new Set(s.cardIds)],
    }))
    .filter((s) => {
      if (s.format === "vitrina" ? s.cardIds.length < 3 : s.cardIds.length < 2) {
        return false;
      }
      if (!strict) return true;
      const packCards = s.cardIds
        .map((id) => pool.find((c) => c.id === id))
        .filter((c): c is (typeof pool)[number] => c != null);
      return isCoherentPromoPack(packCards);
    })
    .sort((a, b) => {
      if (a.format !== b.format) return a.format === "vitrina" ? -1 : 1;
      return b.score - a.score;
    })
    .slice(0, limit);
}

function clusterAvgRelatedness(cluster: PromoGroupCard[]): number {
  if (cluster.length <= 1) return 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < cluster.length; i++) {
    for (let j = i + 1; j < cluster.length; j++) {
      sum += productRelatedness(cluster[i]!, cluster[j]!);
      n += 1;
    }
  }
  return n ? sum / n : 0;
}

/** Only ready-made vitrinas (3+ related products). */
export function suggestReadyVitrinas(
  cards: PromoGroupCard[],
  limit = 4,
): PromoPackSuggestion[] {
  return suggestPromoPacks(cards, { limit, preferVitrina: true }).filter(
    (p) => p.format === "vitrina",
  );
}
