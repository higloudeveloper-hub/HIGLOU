import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildFacebookPromoCopy,
  defaultFacebookCollectionTitle,
} from "@/lib/facebook/promo-copy";
import {
  productImageKey,
  productTitleKey,
} from "@/lib/facebook/promo-groups";
import { isWeakFacebookPictureUrl } from "@/lib/facebook/promo-media";
import { keepaVariationSet } from "@/lib/keepa/variations";
import { keepaProducts } from "@/lib/keepa/finder";
import {
  ensureAffiliateLinksFromKeepaWinners,
  keepaAffiliateShareUrl,
  type KeepaAffiliateLinkResult,
} from "@/lib/monetization/affiliate/from-keepa-winners";
import { ensureTaggedAmazonDestination } from "@/lib/monetization/affiliate/tagged-url";
import type { OpportunityProduct } from "@/lib/opportunity/types";
import {
  type RonCandidateCard,
  type RonDecision,
} from "@/lib/ron/brain";
import { ronImagePack } from "@/lib/ron/normalize-hit";
import {
  scoreCardMoneyOpportunity,
  scorePackMoneyOpportunity,
} from "@/lib/ron/marketplace-logic";
import type { RonFormat, RonLearning } from "@/lib/ron/types";
import type { ListingVariation } from "@/types/product";

/** Original + 3 visibly different variations (color-first). */
const MIN_EXTRA_VARIATIONS = 3;
const MIN_TOTAL_CARDS = 1 + MIN_EXTRA_VARIATIONS;
const MAX_VARIATION_CARDS = 8;

function appOrigin(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, "")}`;
  }
  return "https://higlou.vercel.app";
}

function moneyLabel(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function aspectLabel(aspects: Record<string, string>): string {
  const preferred = ["Color", "Size", "Style", "Pattern"];
  const parts: string[] = [];
  for (const key of preferred) {
    if (aspects[key]) parts.push(aspects[key]);
  }
  if (!parts.length) {
    parts.push(...Object.values(aspects).filter(Boolean).slice(0, 2));
  }
  return parts.join(" · ").slice(0, 48);
}

function baseProductName(title: string): string {
  return String(title || "")
    .replace(/\b(pack of \d+|\d+\s*pack|set of \d+)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 60);
}

/** Real product photo only — never ads-system / P-ASIN gray stubs. */
export function strongVariationImage(
  preferred?: string | null,
  fallbacks: Array<string | null | undefined> = [],
  asin?: string | null,
): { imageUrl: string; imageFallbacks: string[] } | null {
  const pack = ronImagePack(String(asin || ""), preferred);
  const pool = [
    String(preferred || "").trim(),
    ...fallbacks.map((u) => String(u || "").trim()),
    pack.imageUrl,
    ...(pack.imageFallbacks || []),
  ].filter((u) => /^https?:\/\//i.test(u) && !isWeakFacebookPictureUrl(u));
  const unique = [...new Set(pool)];
  if (!unique.length) return null;
  return {
    imageUrl: unique[0]!,
    imageFallbacks: unique.slice(1, 6),
  };
}

function colorOf(v: ListingVariation): string {
  return String(v.aspects.Color || "")
    .trim()
    .toLowerCase();
}

/**
 * Pick extras after the original: prefer one card per Color so the
 * swipe shows a real visual difference (not Size twins of the same photo).
 */
export function pickDistinctVariationExtras(
  variants: ListingVariation[],
  opts: {
    seedAsin: string;
    seedImageKey: string;
    seedColor: string;
    limit: number;
  },
): ListingVariation[] {
  const seedAsin = opts.seedAsin.toUpperCase();
  const seenAsin = new Set<string>([seedAsin]);
  const seenImg = new Set<string>(
    opts.seedImageKey ? [opts.seedImageKey] : [],
  );
  const seenColor = new Set<string>(
    opts.seedColor ? [opts.seedColor] : [],
  );
  const out: ListingVariation[] = [];

  // Pass 1: Color-distinct + unique image
  const byColor = new Map<string, ListingVariation>();
  for (const v of variants) {
    const asin = String(v.asin || "")
      .trim()
      .toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin) || seenAsin.has(asin)) continue;
    const color = colorOf(v);
    if (!color || seenColor.has(color)) continue;
    const img = String(v.imageUrls?.[0] || "").trim();
    if (!img || isWeakFacebookPictureUrl(img)) continue;
    const imgKey = productImageKey(img);
    if (imgKey && seenImg.has(imgKey)) continue;
    if (byColor.has(color)) continue;
    byColor.set(color, v);
  }

  for (const v of byColor.values()) {
    if (out.length >= opts.limit) break;
    const asin = String(v.asin).toUpperCase();
    const color = colorOf(v);
    const imgKey = productImageKey(v.imageUrls?.[0]);
    seenAsin.add(asin);
    if (color) seenColor.add(color);
    if (imgKey) seenImg.add(imgKey);
    out.push(v);
  }

  // Pass 2: if still short, allow Style/Pattern with unique images
  if (out.length < opts.limit) {
    for (const v of variants) {
      if (out.length >= opts.limit) break;
      const asin = String(v.asin || "")
        .trim()
        .toUpperCase();
      if (!/^[A-Z0-9]{10}$/.test(asin) || seenAsin.has(asin)) continue;
      const img = String(v.imageUrls?.[0] || "").trim();
      if (!img || isWeakFacebookPictureUrl(img)) continue;
      const imgKey = productImageKey(img);
      if (imgKey && seenImg.has(imgKey)) continue;
      // Skip Size-only twins of an already-used color
      const color = colorOf(v);
      if (color && seenColor.has(color)) continue;
      seenAsin.add(asin);
      if (color) seenColor.add(color);
      if (imgKey) seenImg.add(imgKey);
      out.push(v);
    }
  }

  return out;
}

function resolveLinkUrl(
  linkByAsin: Map<string, KeepaAffiliateLinkResult>,
  asin: string,
  associateTag: string,
  origin: string,
): string {
  const link = linkByAsin.get(asin);
  let linkUrl = link ? keepaAffiliateShareUrl(link) : "";
  if (!/^https?:\/\//i.test(linkUrl)) {
    linkUrl =
      ensureTaggedAmazonDestination({
        asin,
        associateTag,
      }) || "";
  }
  if (!/^https?:\/\//i.test(linkUrl)) return "";
  return linkUrl.startsWith("/") ? `${origin}${linkUrl}` : linkUrl;
}

/**
 * Expand a Keepa winner into: [original product] + 3+ Color variations.
 * First card is always the seed. Extra cards must show a real photo
 * difference (Color-first). Never ships gray / missing images.
 */
export async function tryRonVariationPack(opts: {
  supabase: SupabaseClient;
  userId: string;
  seedCards: RonCandidateCard[];
  learning: RonLearning;
  associateTag: string;
  seed?: number;
}): Promise<RonDecision | null> {
  if (!opts.seedCards.length) return null;

  const ranked = [...opts.seedCards].sort(
    (a, b) =>
      scoreCardMoneyOpportunity(b, opts.learning) -
      scoreCardMoneyOpportunity(a, opts.learning),
  );

  for (const seed of ranked.slice(0, 4)) {
    const seedAsin = String(seed.asin || "")
      .trim()
      .toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(seedAsin)) continue;

    const seedPhotos = strongVariationImage(
      seed.imageUrl,
      seed.imageFallbacks || [],
      seedAsin,
    );
    if (!seedPhotos) continue;

    let variationSet: Awaited<ReturnType<typeof keepaVariationSet>> = null;
    try {
      variationSet = await keepaVariationSet(seedAsin, { force: true });
    } catch {
      continue;
    }
    if (!variationSet || variationSet.variants.length < MIN_EXTRA_VARIATIONS) {
      continue;
    }

    const seedVariant = variationSet.variants.find(
      (v) => String(v.asin).toUpperCase() === seedAsin,
    );
    const seedColor = seedVariant ? colorOf(seedVariant) : "";
    const seedImgKey = productImageKey(seedPhotos.imageUrl);

    const extras = pickDistinctVariationExtras(variationSet.variants, {
      seedAsin,
      seedImageKey: seedImgKey,
      seedColor,
      limit: MAX_VARIATION_CARDS - 1,
    });

    if (extras.length < MIN_EXTRA_VARIATIONS) continue;

    const allAsins = [
      seedAsin,
      ...extras.map((v) => String(v.asin).toUpperCase()),
    ];

    const snaps = await keepaProducts(allAsins);
    const snapByAsin = new Map(
      snaps.map((s) => [String(s.asin).toUpperCase(), s]),
    );

    const hits: OpportunityProduct[] = [];
    for (const asin of allAsins) {
      const snap = snapByAsin.get(asin);
      const variant =
        asin === seedAsin
          ? seedVariant
          : extras.find((v) => String(v.asin).toUpperCase() === asin);
      const preferredImg =
        asin === seedAsin
          ? seedPhotos.imageUrl
          : String(variant?.imageUrls?.[0] || snap?.imageUrl || "").trim();
      const photos = strongVariationImage(
        preferredImg,
        asin === seedAsin ? seedPhotos.imageFallbacks : [],
        asin,
      );
      if (!photos) continue;
      const price = snap?.buyBoxPrice ?? snap?.newPrice ?? null;
      hits.push({
        asin,
        title: snap?.title || seed.title,
        brand: snap?.brand || seed.brand || "",
        imageUrl: photos.imageUrl,
        mode: "amazon",
        sourceMarket: "amazon",
        sourceId: asin,
        destMarket: "ebay",
        keepa: true,
        amazonPrice: price,
        buyBoxPrice: snap?.buyBoxPrice ?? price,
        discount90: snap?.discount90 ?? null,
        salesRank: snap?.salesRank ?? null,
        bsrDrops90: snap?.bsrDrops90 ?? null,
        monthlySold: snap?.monthlySold ?? null,
        sellerCount: snap?.sellerCount ?? null,
        rating: snap?.rating ?? null,
        reviewCount: snap?.reviewCount ?? null,
        score: 1,
        opportunity: "now",
        upc: snap?.upc || "",
        mpn: snap?.mpn || "",
      } as OpportunityProduct);
    }

    // Must still have seed + 3 extras with real photos
    const hitAsins = new Set(hits.map((h) => h.asin));
    if (!hitAsins.has(seedAsin)) continue;
    const extraHits = extras.filter((v) =>
      hitAsins.has(String(v.asin).toUpperCase()),
    );
    if (extraHits.length < MIN_EXTRA_VARIATIONS) continue;

    const synced = await ensureAffiliateLinksFromKeepaWinners(opts.supabase, {
      userId: opts.userId,
      hits,
      source: "ron_variations",
      campaignName: `${baseProductName(seed.title)} variaciones`,
      limit: MAX_VARIATION_CARDS,
    });

    const linkByAsin = new Map(
      synced.links.map((l) => [String(l.asin).toUpperCase(), l]),
    );
    const origin = appOrigin();

    const cards: RonCandidateCard[] = [];
    const seenAsin = new Set<string>();
    const seenImg = new Set<string>();
    const seenTitle = new Set<string>();

    const pushCard = (
      hit: OpportunityProduct,
      variant: ListingVariation | undefined,
      isSeed: boolean,
    ): boolean => {
      if (cards.length >= MAX_VARIATION_CARDS) return false;
      if (seenAsin.has(hit.asin)) return false;
      const linkUrl = resolveLinkUrl(
        linkByAsin,
        hit.asin,
        opts.associateTag,
        origin,
      );
      if (!linkUrl) return false;

      const photos = strongVariationImage(
        hit.imageUrl,
        isSeed ? seed.imageFallbacks || [] : variant?.imageUrls || [],
        hit.asin,
      );
      if (!photos) return false;

      const aspect = variant ? aspectLabel(variant.aspects) : "";
      const title = isSeed
        ? baseProductName(hit.title) || hit.title.slice(0, 80)
        : aspect
          ? `${baseProductName(hit.title)} · ${aspect}`.slice(0, 80)
          : hit.title.slice(0, 80);

      const imgKey = productImageKey(photos.imageUrl);
      const titleKey = productTitleKey(title);
      if (imgKey && seenImg.has(imgKey)) return false;
      if (titleKey && seenTitle.has(titleKey)) return false;

      seenAsin.add(hit.asin);
      if (imgKey) seenImg.add(imgKey);
      if (titleKey) seenTitle.add(titleKey);
      cards.push({
        id: isSeed ? `ron-seed:${hit.asin}` : `ron-var:${hit.asin}`,
        title,
        brand: hit.brand || seed.brand || null,
        asin: hit.asin,
        imageUrl: photos.imageUrl,
        linkUrl,
        priceLabel: moneyLabel(hit.buyBoxPrice ?? hit.amazonPrice),
        meta: aspect || hit.brand || hit.asin,
        imageFallbacks: photos.imageFallbacks,
        discountPercent:
          hit.discount90 != null && hit.discount90 > 0.05
            ? Math.round(hit.discount90 * 100)
            : null,
        sourcePlatform: "Amazon",
      });
      return true;
    };

    // 1) ORIGINAL product first — always card 0 / cover
    const seedHit = hits.find((h) => h.asin === seedAsin);
    if (!seedHit) continue;
    if (!pushCard(seedHit, seedVariant, true)) continue;

    // 2) Then 3+ visibly different variations
    for (const v of extraHits) {
      if (cards.length >= MAX_VARIATION_CARDS) break;
      const asin = String(v.asin).toUpperCase();
      const hit = hits.find((h) => h.asin === asin);
      if (!hit) continue;
      pushCard(hit, v, false);
    }

    if (cards.length < MIN_TOTAL_CARDS) continue;
    // Guard: first card must still be the original seed
    if (String(cards[0]?.asin || "").toUpperCase() !== seedAsin) continue;

    const format: RonFormat = cards.length >= 4 ? "vitrina" : "carousel";
    const axes = variationSet.axisNames.join(" · ") || "opciones";
    const niche = `${baseProductName(seed.title) || seed.brand || "Deal"} · ${axes}`;
    const money = scorePackMoneyOpportunity(cards, opts.learning);
    const copy = buildFacebookPromoCopy({
      format,
      titles: cards.map((c) => c.title),
      prices: cards.map((c) => c.priceLabel),
      discountPercents: cards.map((c) => c.discountPercent),
      platforms: cards.map(() => "Amazon"),
      niche,
      seed: opts.seed ?? Date.now(),
    });

    const axisLine = variationSet.axisNames.length
      ? variationSet.axisNames.map((a) => a.toUpperCase()).join(" · ")
      : "OPCIONES";
    const message = [
      copy.message.split("\n")[0] || niche.toUpperCase(),
      "",
      `ORIGINAL + ${cards.length - 1} VARIACIONES · ${axisLine}`,
      `${cards.length} opciones · misma familia Keepa`,
      "SWIPE → ELEGÍ COLOR / TALLE",
    ]
      .filter(Boolean)
      .join("\n");

    return {
      action: "publish",
      format,
      cards,
      message,
      collectionTitle:
        format === "vitrina"
          ? `${baseProductName(seed.title)} · ${axes}`.slice(0, 80) ||
            defaultFacebookCollectionTitle()
          : null,
      coverImageUrl: cards[0]?.imageUrl || null,
      niche,
      reason: `Variaciones Keepa · ${format} · original + ${cards.length - 1} colores · ${axes} · score ${money}`,
    };
  }

  return null;
}
