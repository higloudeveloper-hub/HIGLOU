import type { OpportunityProduct } from "@/lib/opportunity/types";
import {
  dedupePromoCards,
  isCoherentPromoPack,
  suggestPromoPacks,
  type PromoGroupCard,
  type PromoPackSuggestion,
} from "@/lib/facebook/promo-groups";
import {
  buildFacebookPromoCopy,
  defaultFacebookCollectionTitle,
} from "@/lib/facebook/promo-copy";
import { promoPriceLabelForLink } from "@/lib/facebook/destination-price";
import {
  keepaOffPercent,
  pickProductTitle,
} from "@/lib/facebook/promo-title";
import {
  platformDisplayName,
  resolveSourcePlatform,
} from "@/lib/facebook/source-platform";
import {
  isRecentNiche,
  rememberPublish,
  scoreAsin,
  scoreFormat,
  scoreNiche,
} from "@/lib/ron/learn";
import { ronImagePack } from "@/lib/ron/normalize-hit";
import type { RonFormat, RonLearning } from "@/lib/ron/types";

export type RonCandidateCard = PromoGroupCard & {
  imageUrl: string;
  linkUrl: string;
  priceLabel?: string | null;
  imageFallbacks?: string[];
  discountPercent?: number | null;
  /** Where we found it — Amazon / eBay / Walmart / Home Depot */
  sourcePlatform?: string | null;
};

export type RonDecision =
  | {
      action: "publish";
      format: RonFormat;
      cards: RonCandidateCard[];
      message: string;
      collectionTitle?: string | null;
      coverImageUrl?: string | null;
      niche: string;
      reason: string;
    }
  | { action: "skip"; reason: string };

function moneyLabel(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function absoluteLink(linkUrl: string, appOrigin: string): string {
  if (linkUrl.startsWith("/")) return `${appOrigin}${linkUrl}`;
  return linkUrl;
}

function pushCard(
  cards: RonCandidateCard[],
  seen: Set<string>,
  opts: {
    asin: string;
    title: string;
    brand?: string | null;
    imageUrl: string;
    imageFallbacks: string[];
    linkUrl: string;
    priceLabel?: string | null;
    discountPercent?: number | null;
    meta?: string;
    sourcePlatform?: string | null;
  },
) {
  if (seen.has(opts.asin)) return;
  if (!/^https?:\/\//i.test(opts.imageUrl)) return;
  if (!/^https?:\/\//i.test(opts.linkUrl)) return;
  seen.add(opts.asin);
  cards.push({
    id: `ron:${opts.asin}`,
    title: pickProductTitle(opts.title).slice(0, 80),
    brand: opts.brand || null,
    asin: opts.asin,
    imageUrl: opts.imageUrl,
    linkUrl: opts.linkUrl,
    priceLabel: opts.priceLabel ?? null,
    meta: opts.meta || opts.brand || opts.asin,
    imageFallbacks: opts.imageFallbacks,
    discountPercent: opts.discountPercent ?? null,
    sourcePlatform: opts.sourcePlatform || "Amazon",
  });
}

/**
 * Build publishable cards.
 * Primary source = affiliate / smart links (already earning clicks).
 * Keepa ledger enriches title / price / image / % OFF when present.
 */
export function buildRonCatalog(opts: {
  hits: OpportunityProduct[];
  affiliateByAsin: Map<
    string,
    {
      linkUrl: string;
      imageUrl?: string | null;
      title?: string | null;
      brand?: string | null;
      priceLabel?: string | null;
      clickCount?: number;
    }
  >;
  appOrigin: string;
}): RonCandidateCard[] {
  const hitByAsin = new Map<string, OpportunityProduct>();
  for (const hit of opts.hits) {
    const asin = String(hit.asin || "")
      .trim()
      .toUpperCase();
    if (/^[A-Z0-9]{10}$/.test(asin)) hitByAsin.set(asin, hit);
  }

  const cards: RonCandidateCard[] = [];
  const seen = new Set<string>();

  const affEntries = [...opts.affiliateByAsin.entries()].sort(
    (a, b) => (b[1].clickCount || 0) - (a[1].clickCount || 0),
  );
  for (const [asinRaw, aff] of affEntries) {
    const asin = String(asinRaw || "")
      .trim()
      .toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin)) continue;
    if (!aff?.linkUrl) continue;
    const hit = hitByAsin.get(asin);
    const preferred = String(aff.imageUrl || hit?.imageUrl || "").trim();
    const pack = ronImagePack(asin, preferred);
    const title = pickProductTitle(
      hit?.title,
      hit?.ebayTitle,
      aff.title,
      `Deal ${asin}`,
    );
    const price =
      aff.priceLabel ||
      moneyLabel(hit?.buyBoxPrice ?? hit?.amazonPrice) ||
      promoPriceLabelForLink({
        linkUrl: aff.linkUrl,
        amazonPrice: hit?.buyBoxPrice ?? hit?.amazonPrice,
      });
    const platform = platformDisplayName(
      resolveSourcePlatform({
        sourceMarket: hit?.sourceMarket,
        mode: hit?.mode,
      }),
    );
    pushCard(cards, seen, {
      asin,
      title,
      brand: aff.brand || hit?.brand || null,
      imageUrl: pack.imageUrl,
      imageFallbacks: pack.imageFallbacks,
      linkUrl: absoluteLink(aff.linkUrl, opts.appOrigin),
      priceLabel: price,
      discountPercent: hit ? keepaOffPercent(hit) : null,
      meta: aff.brand || hit?.brand || asin,
      sourcePlatform: platform,
    });
  }

  for (const hit of opts.hits) {
    const asin = String(hit.asin || "")
      .trim()
      .toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin) || seen.has(asin)) continue;
    const aff = opts.affiliateByAsin.get(asin);
    if (!aff?.linkUrl) continue;
    const pack = ronImagePack(asin, hit.imageUrl || aff.imageUrl);
    const platform = platformDisplayName(
      resolveSourcePlatform({
        sourceMarket: hit.sourceMarket,
        mode: hit.mode,
      }),
    );
    pushCard(cards, seen, {
      asin,
      title: pickProductTitle(hit.title, hit.ebayTitle, aff.title),
      brand: hit.brand || null,
      imageUrl: pack.imageUrl,
      imageFallbacks: pack.imageFallbacks,
      linkUrl: absoluteLink(aff.linkUrl, opts.appOrigin),
      priceLabel:
        moneyLabel(hit.buyBoxPrice ?? hit.amazonPrice) ||
        promoPriceLabelForLink({
          linkUrl: aff.linkUrl,
          amazonPrice: hit.buyBoxPrice ?? hit.amazonPrice,
        }),
      discountPercent: keepaOffPercent(hit),
      meta: hit.brand || asin,
      sourcePlatform: platform,
    });
  }

  return dedupePromoCards(cards) as RonCandidateCard[];
}

function pickBestPack(
  packs: PromoPackSuggestion[],
  learning: RonLearning,
  catalog: RonCandidateCard[],
): { pack: PromoPackSuggestion; cards: RonCandidateCard[]; score: number } | null {
  let best: {
    pack: PromoPackSuggestion;
    cards: RonCandidateCard[];
    score: number;
  } | null = null;
  for (const pack of packs) {
    const cards = pack.cardIds
      .map((id) => catalog.find((c) => c.id === id))
      .filter((c): c is RonCandidateCard => Boolean(c));
    if (cards.length < (pack.format === "vitrina" ? 3 : 2)) continue;
    // Final gate: every pair must be the same product family
    if (!isCoherentPromoPack(cards)) continue;
    const asinBoost = cards.reduce(
      (s, c) => s + scoreAsin(learning, c.asin),
      0,
    );
    // Variety: soft-penalize niches we just published (unless learning loves them)
    const nichePenalty = isRecentNiche(learning, pack.niche) ? 8 : 0;
    const score =
      pack.score * 10 +
      scoreFormat(learning, pack.format) * 2 +
      scoreNiche(learning, pack.niche) * 1.5 +
      asinBoost * 0.4 -
      nichePenalty;
    if (!best || score > best.score) best = { pack, cards, score };
  }
  return best;
}

/**
 * Decide the next Facebook post.
 * Multi-card packs only (vitrina ≥3 or carousel ≥2). Never a solo product.
 */
export function decideRonPublish(opts: {
  catalog: RonCandidateCard[];
  learning: RonLearning;
  seed?: number;
  emptyReason?: string;
}): RonDecision {
  const catalog = opts.catalog.filter(
    (c) =>
      /^https?:\/\//i.test(c.imageUrl) && /^https?:\/\//i.test(c.linkUrl),
  );
  if (!catalog.length) {
    return {
      action: "skip",
      reason:
        opts.emptyReason ||
        "Sin oportunidades nuevas (todo lo listo ya se publicó). RON espera Keepa fresco.",
    };
  }

  // Pass 1 — tight related vitrinas/carousels
  let packs = suggestPromoPacks(catalog, {
    limit: 8,
    preferVitrina: true,
    minRelated: 0.48,
    disallowPriceBandFallback: true,
    strict: true,
  });
  let best = pickBestPack(packs, opts.learning, catalog);

  // Pass 2 — same family, slightly softer score so we still get carousels of 2+
  if (!best) {
    packs = suggestPromoPacks(catalog, {
      limit: 8,
      preferVitrina: true,
      minRelated: 0.36,
      disallowPriceBandFallback: true,
      strict: true,
    });
    best = pickBestPack(packs, opts.learning, catalog);
  }

  if (best && best.cards.length >= 2) {
    const cards = best.cards;
    const copy = buildFacebookPromoCopy({
      format: best.pack.format,
      titles: cards.map((c) => c.title),
      prices: cards.map((c) => c.priceLabel),
      discountPercents: cards.map((c) => c.discountPercent),
      platforms: cards.map((c) => c.sourcePlatform),
      niche: best.pack.niche,
      seed: opts.seed ?? Date.now(),
    });
    return {
      action: "publish",
      format: best.pack.format,
      cards,
      message: copy.message,
      collectionTitle:
        best.pack.format === "vitrina"
          ? copy.collectionTitle || defaultFacebookCollectionTitle()
          : null,
      coverImageUrl: cards[0]?.imageUrl || null,
      niche: best.pack.niche,
      reason: `Pack ${best.pack.format} · ${best.pack.niche} · ${cards.length} productos`,
    };
  }

  // Never publish a lone product — no clickable multi-card post possible
  return {
    action: "skip",
    reason:
      opts.emptyReason ||
      `Necesito ≥2 productos relacionados (tengo ${catalog.length} frescos sin cluster). No publico sueltos.`,
  };
}

export { rememberPublish };
