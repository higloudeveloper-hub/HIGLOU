import {
  meaningfulTokens,
  retailTitleScore,
  type RetailMatchHints,
} from "@/lib/opportunity/retail-match";

export type SourcingIdentityHints = RetailMatchHints & {
  visionModels?: string[];
};

function compact(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Prefer brand + catalog/MPN — never a long Amazon marketing title. */
export function buildExactSourcingQuery(hints: SourcingIdentityHints): {
  primary: string;
  alternates: string[];
} {
  const brand = String(hints.brand || "").trim();
  const model = String(hints.mpn || hints.model || "").trim();
  const visionModel = (hints.visionModels || []).find((m) => m.length >= 3) || "";
  const code = model || visionModel;
  const alternates: string[] = [];

  if (brand && code) {
    const primary = `${brand} ${code}`.trim();
    if (code.includes("-")) alternates.push(`"${brand}" "${code}"`);
    alternates.push(code);
    // Short noun phrase from title (max 3 content words) + brand + code
    const nouns = meaningfulTokens(hints.title || "")
      .filter(
        (t) =>
          t.toLowerCase() !== brand.toLowerCase() &&
          compact(t) !== compact(code) &&
          !/^\d+$/.test(t),
      )
      .slice(0, 3);
    if (nouns.length) {
      alternates.push(`${brand} ${code} ${nouns.join(" ")}`);
    }
    return { primary, alternates: [...new Set(alternates)].slice(0, 4) };
  }

  if (code) {
    return { primary: code, alternates: brand ? [`${brand} ${code}`] : [] };
  }

  // No model — brand + 4 strongest title tokens only (avoid vague category searches).
  const tokens = meaningfulTokens(hints.title || "").slice(0, 5);
  const primary = [brand, ...tokens.filter((t) => t.toLowerCase() !== brand.toLowerCase())]
    .filter(Boolean)
    .join(" ")
    .trim();
  return { primary: primary || String(hints.title || "").slice(0, 60), alternates: [] };
}

/**
 * True only when the offer looks like the SAME SKU — brand + model/MPN preferred.
 * Rejects "similar category" junk that Alibaba dumps on broad queries.
 */
export function isSameProductOffer(
  offerTitle: string,
  hints: SourcingIdentityHints,
): { ok: boolean; score: number; reason: string } {
  const title = String(offerTitle || "").trim();
  if (title.length < 4) {
    return { ok: false, score: 0, reason: "empty title" };
  }

  const brand = String(hints.brand || "").trim();
  const model = String(hints.mpn || hints.model || "").trim();
  const visionModels = hints.visionModels || [];
  const codes = [model, ...visionModels].filter((c) => c.length >= 3);
  const hay = compact(title);
  const score = retailTitleScore(title, {
    title: hints.title,
    brand,
    model: model || visionModels[0],
    mpn: model,
  });

  // Strong path: catalog / MPN / Vision model code appears in the offer title.
  // Brand is mandatory when known — never accept a model hit on a different brand.
  for (const code of codes) {
    const c = compact(code);
    if (c.length >= 4 && hay.includes(c)) {
      if (brand) {
        const b = compact(brand);
        if (b.length >= 2 && !hay.includes(b)) {
          return { ok: false, score, reason: "model without brand" };
        }
      }
      return { ok: true, score: Math.max(score, 0.9), reason: "model code" };
    }
  }

  // Brand required when we know it.
  if (brand) {
    const b = compact(brand);
    if (b.length >= 2 && !hay.includes(b)) {
      return { ok: false, score, reason: "missing brand" };
    }
  }

  // Without a model code, demand high title overlap (same product words).
  if (!codes.length) {
    if (score >= 0.55) {
      return { ok: true, score, reason: "title overlap" };
    }
    return { ok: false, score, reason: "weak title match" };
  }

  // Have a model but it wasn't in the title — reject (wrong SKU).
  return { ok: false, score, reason: "model not in title" };
}

export function filterSameProductOffers<T extends { title: string }>(
  offers: T[],
  hints: SourcingIdentityHints,
): Array<T & { matchScore: number; matchReason: string }> {
  const kept: Array<T & { matchScore: number; matchReason: string }> = [];
  for (const offer of offers) {
    const verdict = isSameProductOffer(offer.title, hints);
    if (!verdict.ok) continue;
    kept.push({
      ...offer,
      matchScore: verdict.score,
      matchReason: verdict.reason,
    });
  }
  return kept.sort((a, b) => b.matchScore - a.matchScore);
}
