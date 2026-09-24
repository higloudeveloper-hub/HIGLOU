import type { OpportunityProduct } from "@/lib/opportunity/types";
import {
  dedupePromoCards,
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
  rememberPublish,
  scoreAsin,
  scoreFormat,
  scoreNiche,
} from "@/lib/ron/learn";
import type { RonFormat, RonLearning } from "@/lib/ron/types";

export type RonCandidateCard = PromoGroupCard & {
  imageUrl: string;
  linkUrl: string;
  priceLabel?: string | null;
  imageFallbacks?: string[];
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

/** Build publishable cards from Keepa ledger + affiliate smart links. */
export function buildRonCatalog(opts: {
  hits: OpportunityProduct[];
  affiliateByAsin: Map<
    string,
    { linkUrl: string; imageUrl?: string | null; title?: string | null }
  >;
  appOrigin: string;
}): RonCandidateCard[] {
  const cards: RonCandidateCard[] = [];
  for (const hit of opts.hits) {
    const asin = String(hit.asin || "")
      .trim()
      .toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin)) continue;
    const aff = opts.affiliateByAsin.get(asin);
    if (!aff?.linkUrl) continue;
    const imageUrl =
      String(aff.imageUrl || hit.imageUrl || "").trim() || "";
    if (!/^https?:\/\//i.test(imageUrl)) continue;
    const title =
      String(aff.title || hit.title || hit.ebayTitle || "").trim() ||
      `Deal ${asin}`;
    const price =
      moneyLabel(hit.buyBoxPrice ?? hit.amazonPrice) ||
      promoPriceLabelForLink({
        linkUrl: aff.linkUrl,
        amazonPrice: hit.buyBoxPrice ?? hit.amazonPrice,
      });
    let linkUrl = aff.linkUrl;
    if (linkUrl.startsWith("/")) {
      linkUrl = `${opts.appOrigin}${linkUrl}`;
    }
    cards.push({
      id: `ron:${asin}`,
      title: title.slice(0, 80),
      brand: hit.brand || null,
      asin,
      imageUrl,
      linkUrl,
      priceLabel: price,
      meta: hit.brand || asin,
      imageFallbacks: imageUrl ? [imageUrl] : [],
    });
  }
  return dedupePromoCards(cards) as RonCandidateCard[];
}

function pickBestPack(
  packs: PromoPackSuggestion[],
  learning: RonLearning,
  catalog: RonCandidateCard[],
): { pack: PromoPackSuggestion; score: number } | null {
  let best: { pack: PromoPackSuggestion; score: number } | null = null;
  for (const pack of packs) {
    const cards = pack.cardIds
      .map((id) => catalog.find((c) => c.id === id))
      .filter((c): c is RonCandidateCard => Boolean(c));
    if (!cards.length) continue;
    const asinBoost = cards.reduce(
      (s, c) => s + scoreAsin(learning, c.asin),
      0,
    );
    const score =
      pack.score * 10 +
      scoreFormat(learning, pack.format) * 2 +
      scoreNiche(learning, pack.niche) * 1.5 +
      asinBoost * 0.4;
    if (!best || score > best.score) best = { pack, score };
  }
  return best;
}

/**
 * Decide the next Facebook post. Prefers vitrinas/carousels from related
 * Keepa winners; falls back to a single-product ads card.
 */
export function decideRonPublish(opts: {
  catalog: RonCandidateCard[];
  learning: RonLearning;
  seed?: number;
}): RonDecision {
  const catalog = opts.catalog.filter(
    (c) =>
      /^https?:\/\//i.test(c.imageUrl) && /^https?:\/\//i.test(c.linkUrl),
  );
  if (!catalog.length) {
    return {
      action: "skip",
      reason:
        "Sin productos Keepa con link de afiliado listo. Escaneá Find Winners.",
    };
  }

  const packs = suggestPromoPacks(catalog, { limit: 8 });
  const best = pickBestPack(packs, opts.learning, catalog);

  if (best) {
    const cards = best.pack.cardIds
      .map((id) => catalog.find((c) => c.id === id))
      .filter((c): c is RonCandidateCard => Boolean(c));
    const copy = buildFacebookPromoCopy({
      format: best.pack.format,
      titles: cards.map((c) => c.title),
      prices: cards.map((c) => c.priceLabel),
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
      reason: `Pack ${best.pack.format} · ${best.pack.niche} (score ${best.score.toFixed(1)})`,
    };
  }

  // Single product — pick highest learned ASIN / first strong image
  const ranked = [...catalog].sort(
    (a, b) => scoreAsin(opts.learning, b.asin) - scoreAsin(opts.learning, a.asin),
  );
  const one = ranked[0]!;
  const copy = buildFacebookPromoCopy({
    format: "ads",
    titles: [one.title],
    prices: [one.priceLabel],
    seed: opts.seed ?? Date.now(),
  });
  return {
    action: "publish",
    format: "ads",
    cards: [one],
    message: copy.message,
    niche: one.brand || "Deal",
    reason: `1 producto · ${one.title.slice(0, 40)}`,
  };
}

export { rememberPublish };
