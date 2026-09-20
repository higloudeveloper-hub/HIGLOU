/**
 * Shared query builders + title scoring for cross-platform retail match
 * (Walmart / Home Depot / eBay). Prefer UPC, then brand+model, then short title.
 */

const STOP = new Set([
  "with",
  "for",
  "and",
  "the",
  "pack",
  "set",
  "of",
  "in",
  "to",
  "a",
  "an",
  "by",
  "from",
  "new",
  "free",
  "shipping",
  "pcs",
  "pc",
  "count",
  "amazon",
  "walmart",
  "exclusive",
  "renewed",
  "refurbished",
]);

export type RetailMatchHints = {
  title?: string;
  brand?: string;
  model?: string;
  mpn?: string;
  upc?: string;
};

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = String(raw || "").trim().replace(/\s+/g, " ");
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return out;
}

/** Keep model / catalog codes (incl. pure digits and hyphen SKUs). */
export function meaningfulTokens(text: string): string[] {
  const raw = String(text || "");
  const kept: string[] = [];
  const seen = new Set<string>();
  const push = (w: string) => {
    const key = w.toLowerCase();
    if (!w || seen.has(key)) return;
    seen.add(key);
    kept.push(w);
  };
  // Preserve hyphen catalog codes before splitting (e.g. 48-73-1430).
  for (const code of raw.match(/\b\d{2,4}-\d{2,4}-\d{2,6}\b/g) || []) {
    push(code);
  }
  const catalogCompact = new Set(
    kept.map((c) => c.replace(/[^a-z0-9]/gi, "").toLowerCase()),
  );
  for (const word of raw.split(/[^a-z0-9]+/i)) {
    const w = word.trim();
    if (!w) continue;
    if (STOP.has(w.toLowerCase())) continue;
    if (/^\d+$/.test(w)) {
      // Skip digit fragments already covered by a hyphen catalog code.
      if ([...catalogCompact].some((c) => c.includes(w))) continue;
      if (w.length >= 3) push(w);
      continue;
    }
    if (w.length <= 1) continue;
    push(w);
  }
  return kept;
}

export function buildRetailSearchQueries(hints: RetailMatchHints): string[] {
  const title = String(hints.title || "").trim();
  const brand = String(hints.brand || "").trim();
  const model = String(hints.model || "").trim();
  const mpn = String(hints.mpn || "").trim();
  const upc = String(hints.upc || "").replace(/\D/g, "");
  const queries: string[] = [];

  if (upc.length >= 12) queries.push(upc);
  if (brand && mpn) queries.push(`${brand} ${mpn}`);
  if (brand && model && model.toLowerCase() !== brand.toLowerCase()) {
    queries.push(`${brand} ${model}`);
  }
  if (mpn && mpn.length >= 3) queries.push(mpn);
  if (model && model.length >= 3 && !/\s/.test(model)) queries.push(model);

  const tokens = meaningfulTokens([brand, model, mpn, title].filter(Boolean).join(" "));
  if (brand) {
    const withoutBrand = tokens.filter(
      (t) => t.toLowerCase() !== brand.toLowerCase(),
    );
    const short = [brand, ...withoutBrand.slice(0, 5)].join(" ").trim();
    if (short.length >= 4) queries.push(short);
    const shorter = [brand, ...withoutBrand.slice(0, 3)].join(" ").trim();
    if (shorter.length >= 4) queries.push(shorter);
  } else if (tokens.length) {
    queries.push(tokens.slice(0, 7).join(" "));
    queries.push(tokens.slice(0, 4).join(" "));
  }

  return uniq(queries).slice(0, 6);
}

/** 0–1 overlap of meaningful tokens (case-insensitive). */
export function retailTitleScore(
  candidateTitle: string,
  hints: RetailMatchHints,
): number {
  const cand = new Set(
    meaningfulTokens(candidateTitle).map((t) => t.toLowerCase()),
  );
  if (!cand.size) return 0;
  const want = meaningfulTokens(
    [hints.brand, hints.model, hints.mpn, hints.title].filter(Boolean).join(" "),
  ).map((t) => t.toLowerCase());
  if (!want.length) return 0;
  let hits = 0;
  for (const t of want) {
    if (cand.has(t)) hits += 1;
  }
  const brand = String(hints.brand || "").trim().toLowerCase();
  let score = hits / want.length;
  if (brand && [...cand].some((t) => t.includes(brand) || brand.includes(t))) {
    score += 0.15;
  }
  const model = String(hints.model || hints.mpn || "")
    .trim()
    .toLowerCase();
  if (model && model.length >= 3) {
    const compactCand = candidateTitle.toLowerCase().replace(/[^a-z0-9]/g, "");
    const compactModel = model.replace(/[^a-z0-9]/g, "");
    if (compactModel && compactCand.includes(compactModel)) score += 0.25;
  }
  return Math.min(1, score);
}

export function pickBestRetailHit<T extends { title: string; upc?: string }>(
  hits: T[],
  hints: RetailMatchHints,
  opts?: { minScore?: number },
): { hit: T; score: number; matchedBy: "upc" | "title" } | null {
  if (!hits.length) return null;
  const upc = String(hints.upc || "").replace(/\D/g, "");
  const brand = String(hints.brand || "").trim();
  const model = String(hints.mpn || hints.model || "").trim();
  // Strict default — prefer no match over a lookalike.
  const minScore = opts?.minScore ?? 0.42;

  if (upc.length >= 12) {
    const byUpc = hits.find(
      (h) => String(h.upc || "").replace(/\D/g, "") === upc,
    );
    if (byUpc) return { hit: byUpc, score: 1, matchedBy: "upc" };
  }

  let best: { hit: T; score: number } | null = null;
  const compactModel =
    model.length >= 3
      ? model.toLowerCase().replace(/[^a-z0-9]/g, "")
      : "";
  const anyHasModel =
    Boolean(compactModel) &&
    hits.some((h) =>
      h.title.toLowerCase().replace(/[^a-z0-9]/g, "").includes(compactModel),
    );

  for (const hit of hits) {
    const score = retailTitleScore(hit.title, hints);
    const hay = hit.title.toLowerCase();
    if (brand && !hay.includes(brand.toLowerCase())) continue;
    if (anyHasModel) {
      const compactTitle = hay.replace(/[^a-z0-9]/g, "");
      if (!compactTitle.includes(compactModel)) continue;
    }
    if (!best || score > best.score) best = { hit, score };
  }
  if (!best || best.score < minScore) return null;
  return { hit: best.hit, score: best.score, matchedBy: "title" };
}
