/**
 * Ready-made vitrinas + carousels from related products.
 * Groups by shared title tokens + brand + price band so Higlou can
 * recommend “vitrinas ya hechas” the user can publish in one tap.
 */

export type PromoGroupCard = {
  id: string;
  title: string;
  brand?: string | null;
  priceLabel?: string | null;
  asin?: string | null;
  meta?: string | null;
  imageUrl?: string | null;
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
 * Stable fingerprint so the same product photo (or ASIN image) is not
 * packed twice — even when ASINs differ or are missing.
 */
export function productImageKey(url?: string | null): string {
  const raw = String(url || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  const fromQuery = lower.match(/[?&]asin=([a-z0-9]{10})\b/i)?.[1];
  const fromPath = lower.match(/\/(?:images\/)?p\/([a-z0-9]{10})\./i)?.[1];
  const asin = (fromQuery || fromPath || "").toUpperCase();
  if (asin) return `asin:${asin}`;
  try {
    const u = new URL(raw);
    return `path:${u.hostname}${u.pathname}`.toLowerCase();
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

/** Drop duplicate ASINs / identical images before clustering. */
export function dedupePromoCards(cards: PromoGroupCard[]): PromoGroupCard[] {
  const seenAsin = new Set<string>();
  const seenImg = new Set<string>();
  const out: PromoGroupCard[] = [];
  for (const c of cards) {
    if (!c.id || !String(c.title || "").trim()) continue;
    const asin = asinOf(c);
    if (asin && seenAsin.has(asin)) continue;
    const img = productImageKey(c.imageUrl);
    if (img && seenImg.has(img)) continue;
    if (asin) seenAsin.add(asin);
    if (img) seenImg.add(img);
    out.push(c);
  }
  return out;
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

  const ba = brandOf(a);
  const bbBrand = brandOf(b);
  if (ba && bbBrand && ba === bbBrand && !isJunkBrand(ba)) s += 0.28;

  const pa = priceBand(a.priceLabel);
  const pb = priceBand(b.priceLabel);
  if (pa != null && pb != null && Math.abs(pa - pb) <= 1) s += 0.1;

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
): PromoPackSuggestion | null {
  // Hard uniqueness inside the pack
  const unique = dedupePromoCards(cluster);
  const sized =
    format === "vitrina"
      ? unique.slice(0, Math.min(8, Math.max(3, unique.length)))
      : unique.slice(0, Math.min(5, Math.max(2, unique.length)));

  if (format === "vitrina" && sized.length < 3) return null;
  if (format === "carousel" && sized.length < 2) return null;

  const niche = nicheLabel(sized);
  // Never ship chrome niches like "/Go"
  const safeNiche = isJunkBrand(niche) ? "Selección" : niche;
  return {
    id: `${format}:${sized.map((c) => c.id).join("|").slice(0, 56)}`,
    label:
      format === "vitrina"
        ? `Vitrina lista · ${safeNiche}`
        : `Carrusel · ${safeNiche}`,
    blurb:
      format === "vitrina"
        ? `${sized.length} productos relacionados · lista para publicar`
        : `${sized.length} productos del mismo tipo · carrusel listo`,
    cardIds: sized.map((c) => c.id),
    format,
    score: Math.round(score * 100) / 100,
    niche: safeNiche,
    imageUrls: sized
      .map((c) => String(c.imageUrl || "").trim())
      .filter((u) => /^https?:\/\//i.test(u))
      .filter((u, i, arr) => arr.indexOf(u) === i)
      .slice(0, 6),
    titles: sized.map((c) => String(c.title || "").slice(0, 40)),
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
  opts?: { limit?: number; preferVitrina?: boolean },
): PromoPackSuggestion[] {
  const pool = dedupePromoCards(cards);
  if (pool.length < 2) return [];

  const preferVitrina = opts?.preferVitrina !== false;
  const limit = Math.min(Math.max(opts?.limit ?? 6, 1), 8);
  const used = new Set<string>();
  const suggestions: PromoPackSuggestion[] = [];
  // Require real token/brand overlap — junk "/go" brand must not glue everything
  const minRelated = 0.22;

  // Rank seeds by how many neighbors they have (dense relatedness hubs).
  const hubs = pool
    .map((c) => {
      const neighbors = pool.filter(
        (o) => o.id !== c.id && productRelatedness(c, o) >= minRelated,
      ).length;
      return { c, neighbors };
    })
    .sort((a, b) => b.neighbors - a.neighbors);

  // Pass 1 — Vitrinas ya hechas (need ≥3 related)
  if (preferVitrina && pool.length >= 3) {
    for (const hub of hubs) {
      if (suggestions.length >= limit) break;
      if (used.has(hub.c.id)) continue;
      const cluster = growCluster(hub.c, pool, used, minRelated, 8);
      if (cluster.length < 3) continue;
      const avg =
        cluster.length <= 1
          ? 0
          : cluster.reduce((sum, a, i) => {
              let local = 0;
              let n = 0;
              for (let j = 0; j < cluster.length; j++) {
                if (i === j) continue;
                local += productRelatedness(a, cluster[j]!);
                n += 1;
              }
              return sum + (n ? local / n : 0);
            }, 0) / cluster.length;
      const pack = packFromCluster(cluster, "vitrina", Math.max(avg, 0.22));
      if (!pack) continue;
      for (const c of cluster.slice(0, pack.cardIds.length)) used.add(c.id);
      suggestions.push(pack);
    }
  }

  // Pass 2 — Carousels from leftovers (pairs+)
  for (const hub of hubs) {
    if (suggestions.length >= limit) break;
    if (used.has(hub.c.id)) continue;
    const cluster = growCluster(hub.c, pool, used, minRelated, 5);
    if (cluster.length < 2) continue;
    // If we still have 3+, prefer another vitrina
    const format: "carousel" | "vitrina" =
      preferVitrina && cluster.length >= 3 ? "vitrina" : "carousel";
    const avg =
      productRelatedness(cluster[0]!, cluster[1]!) *
      (cluster.length >= 3 ? 1.05 : 1);
    const pack = packFromCluster(cluster, format, Math.max(avg, 0.18));
    if (!pack) continue;
    for (const c of cluster.slice(0, pack.cardIds.length)) used.add(c.id);
    suggestions.push(pack);
  }

  // Pass 3 — Fallback: same price band as a “vitrina lista”
  if (
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

  // Vitrinas first, then by score — and never return packs with dup card ids
  return suggestions
    .map((s) => ({
      ...s,
      cardIds: [...new Set(s.cardIds)],
    }))
    .filter((s) =>
      s.format === "vitrina" ? s.cardIds.length >= 3 : s.cardIds.length >= 2,
    )
    .sort((a, b) => {
      if (a.format !== b.format) return a.format === "vitrina" ? -1 : 1;
      return b.score - a.score;
    })
    .slice(0, limit);
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
