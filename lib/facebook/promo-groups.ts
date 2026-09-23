/**
 * Recommend carousel / vitrina packs by product similarity.
 * Groups by shared title tokens + brand + price band — no ML, fast & explainable.
 */

export type PromoGroupCard = {
  id: string;
  title: string;
  brand?: string | null;
  priceLabel?: string | null;
  asin?: string | null;
  meta?: string | null;
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
]);

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
  if (fromField) return fromField.toLowerCase();
  const meta = String(card.meta || "");
  const m = meta.match(/(?:Amazon|eBay|Listing)\s*·\s*(.+)$/i);
  if (m?.[1]) return m[1].trim().toLowerCase();
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

function pairScore(a: PromoGroupCard, b: PromoGroupCard): number {
  const ta = new Set(tokens(a.title).slice(0, 8));
  const tb = new Set(tokens(b.title).slice(0, 8));
  let s = jaccard(ta, tb) * 0.65;
  const ba = brandOf(a);
  const bb = brandOf(b);
  if (ba && bb && ba === bb) s += 0.25;
  const pa = priceBand(a.priceLabel);
  const pb = priceBand(b.priceLabel);
  if (pa != null && pb != null && Math.abs(pa - pb) <= 1) s += 0.1;
  return s;
}

function nicheLabel(cards: PromoGroupCard[]): string {
  const brandCounts = new Map<string, number>();
  const tokenCounts = new Map<string, number>();
  for (const c of cards) {
    const b = brandOf(c);
    if (b) brandCounts.set(b, (brandCounts.get(b) || 0) + 1);
    for (const t of tokens(c.title).slice(0, 5)) {
      tokenCounts.set(t, (tokenCounts.get(t) || 0) + 1);
    }
  }
  const topBrand = [...brandCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topBrand && topBrand[1] >= 2) {
    return topBrand[0].replace(/\b\w/g, (c) => c.toUpperCase());
  }
  const topTok = [...tokenCounts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])[0];
  if (topTok) {
    return topTok[0].replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return "Selección";
}

/**
 * Build recommended packs from the current catalog.
 * Returns best carousel (2–5) and vitrina (3–8) clusters.
 */
export function suggestPromoPacks(
  cards: PromoGroupCard[],
  opts?: { limit?: number },
): PromoPackSuggestion[] {
  const pool = cards.filter((c) => c.id && String(c.title || "").trim());
  if (pool.length < 2) return [];

  const limit = Math.min(Math.max(opts?.limit ?? 4, 1), 6);
  const used = new Set<string>();
  const suggestions: PromoPackSuggestion[] = [];

  // Greedy: start from densest similar pairs, grow cluster.
  type Edge = { a: number; b: number; score: number };
  const edges: Edge[] = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const score = pairScore(pool[i]!, pool[j]!);
      if (score >= 0.18) edges.push({ a: i, b: j, score });
    }
  }
  edges.sort((x, y) => y.score - x.score);

  for (const edge of edges) {
    if (suggestions.length >= limit) break;
    const seedA = pool[edge.a]!;
    const seedB = pool[edge.b]!;
    if (used.has(seedA.id) || used.has(seedB.id)) continue;

    const cluster: PromoGroupCard[] = [seedA, seedB];
    const clusterIds = new Set([seedA.id, seedB.id]);

    const candidates = pool
      .filter((c) => !clusterIds.has(c.id) && !used.has(c.id))
      .map((c) => ({
        c,
        s:
          cluster.reduce((sum, m) => sum + pairScore(m, c), 0) / cluster.length,
      }))
      .filter((row) => row.s >= 0.16)
      .sort((a, b) => b.s - a.s);

    for (const row of candidates) {
      if (cluster.length >= 8) break;
      cluster.push(row.c);
      clusterIds.add(row.c.id);
    }

    if (cluster.length < 2) continue;

    const niche = nicheLabel(cluster);
    const avg =
      edges
        .filter(
          (e) =>
            clusterIds.has(pool[e.a]!.id) && clusterIds.has(pool[e.b]!.id),
        )
        .reduce((s, e, _, arr) => s + e.score / Math.max(arr.length, 1), 0) ||
      edge.score;

    const format: "carousel" | "vitrina" =
      cluster.length >= 4 ? "vitrina" : "carousel";
    const sized =
      format === "vitrina"
        ? cluster.slice(0, Math.min(8, Math.max(3, cluster.length)))
        : cluster.slice(0, Math.min(5, Math.max(2, cluster.length)));

    if (format === "vitrina" && sized.length < 3) continue;
    if (format === "carousel" && sized.length < 2) continue;

    for (const c of sized) used.add(c.id);

    suggestions.push({
      id: `pack:${sized.map((c) => c.id).join("|").slice(0, 48)}`,
      label:
        format === "vitrina"
          ? `Vitrina · ${niche}`
          : `Carrusel · ${niche}`,
      blurb:
        format === "vitrina"
          ? `${sized.length} productos parecidos · vitrina lista`
          : `${sized.length} productos del mismo tipo · carrusel listo`,
      cardIds: sized.map((c) => c.id),
      format,
      score: Math.round(avg * 100) / 100,
      niche,
    });
  }

  // Fallback: same price band when similarity is thin
  if (suggestions.length < 2 && pool.length >= 3) {
    const byBand = new Map<number, PromoGroupCard[]>();
    for (const c of pool) {
      if (used.has(c.id)) continue;
      const b = priceBand(c.priceLabel) ?? 2;
      const list = byBand.get(b) || [];
      list.push(c);
      byBand.set(b, list);
    }
    for (const [, list] of byBand) {
      if (suggestions.length >= limit) break;
      if (list.length < 3) continue;
      const slice = list.slice(0, 5);
      const niche = nicheLabel(slice);
      suggestions.push({
        id: `band:${niche}:${slice[0]!.id}`,
        label: `Pack precio · ${niche}`,
        blurb: `${slice.length} en el mismo rango de precio`,
        cardIds: slice.map((c) => c.id),
        format: slice.length >= 4 ? "vitrina" : "carousel",
        score: 0.2,
        niche,
      });
      for (const c of slice) used.add(c.id);
    }
  }

  return suggestions.sort((a, b) => b.score - a.score).slice(0, limit);
}
