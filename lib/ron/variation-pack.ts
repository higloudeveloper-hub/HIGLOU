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

/** Original + exactly 3 visibly different Color variations. */
const MIN_EXTRA_VARIATIONS = 3;
const MAX_EXTRA_VARIATIONS = 3;
const MIN_TOTAL_CARDS = 1 + MIN_EXTRA_VARIATIONS;
const MAX_VARIATION_CARDS = MIN_TOTAL_CARDS;

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

/** Normalize Keepa / Amazon I/ URLs so FB + dedupe see one fingerprint. */
export function normalizeAmazonProductImage(url?: string | null): string {
  const raw = String(url || "").trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return "";
  if (isWeakFacebookPictureUrl(raw)) return "";
  const id = raw.match(/\/images\/I\/([^/?#]+)/i)?.[1];
  if (id) {
    const clean = id
      .replace(/\._.+$/i, "")
      .replace(/\.(jpe?g|png|webp|gif)$/i, "");
    if (clean.length >= 3) {
      return `https://m.media-amazon.com/images/I/${clean}._AC_SL1500_.jpg`;
    }
  }
  return raw;
}

/** Real product photo only — never ads-system / P-ASIN gray stubs. */
export function strongVariationImage(
  preferred?: string | null,
  fallbacks: Array<string | null | undefined> = [],
  asin?: string | null,
): { imageUrl: string; imageFallbacks: string[] } | null {
  const pack = ronImagePack(String(asin || ""), preferred);
  const pool = [
    normalizeAmazonProductImage(preferred),
    ...fallbacks.map((u) => normalizeAmazonProductImage(u)),
    normalizeAmazonProductImage(pack.imageUrl),
    ...(pack.imageFallbacks || []).map((u) => normalizeAmazonProductImage(u)),
  ].filter((u) => Boolean(u) && !isWeakFacebookPictureUrl(u));
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
 * Color candidates only (one ASIN per Color). Images are resolved later
 * from Keepa /product so we never trust empty/shared variation.image rows.
 */
export function pickColorVariationCandidates(
  variants: ListingVariation[],
  opts: { seedAsin: string; seedColor: string; limit: number },
): ListingVariation[] {
  const seedAsin = opts.seedAsin.toUpperCase();
  const seenColor = new Set<string>(
    opts.seedColor ? [opts.seedColor] : [],
  );
  const out: ListingVariation[] = [];

  for (const v of variants) {
    if (out.length >= opts.limit) break;
    const asin = String(v.asin || "")
      .trim()
      .toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin) || asin === seedAsin) continue;
    const color = colorOf(v);
    if (!color || seenColor.has(color)) continue;
    seenColor.add(color);
    out.push(v);
  }
  return out;
}

/**
 * After Keepa /product snaps arrive: keep only colors whose MAIN GALLERY
 * photo (not the color swatch) is different from the original and each other.
 */
export function pickDistinctVariationExtras(
  variants: ListingVariation[],
  opts: {
    seedAsin: string;
    seedImageKey: string;
    seedColor: string;
    limit: number;
    /** Resolved MAIN gallery URL per ASIN (from Keepa /product only). */
    imageByAsin: Map<string, string>;
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
  const imageOf = (v: ListingVariation): string => {
    const asin = String(v.asin || "")
      .trim()
      .toUpperCase();
    // NEVER fall back to variations[].image — that is the fabric swatch
    return normalizeAmazonProductImage(opts.imageByAsin.get(asin) || "");
  };

  // Pass 1: Color-distinct + unique main gallery photo
  for (const v of variants) {
    if (out.length >= opts.limit) break;
    const asin = String(v.asin || "")
      .trim()
      .toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin) || seenAsin.has(asin)) continue;
    const color = colorOf(v);
    if (!color || seenColor.has(color)) continue;
    const img = imageOf(v);
    if (!img || isWeakFacebookPictureUrl(img)) continue;
    const imgKey = productImageKey(img);
    if (!imgKey || seenImg.has(imgKey)) continue;
    // Reject if this "gallery" URL is actually the variation swatch
    const swatchKey = productImageKey(v.imageUrls?.[0]);
    if (swatchKey && imgKey === swatchKey) continue;
    seenAsin.add(asin);
    seenColor.add(color);
    seenImg.add(imgKey);
    out.push({
      ...v,
      imageUrls: [img],
    });
  }

  // Pass 2: Style/Pattern with unique gallery photos (no Size twins)
  if (out.length < opts.limit) {
    for (const v of variants) {
      if (out.length >= opts.limit) break;
      const asin = String(v.asin || "")
        .trim()
        .toUpperCase();
      if (!/^[A-Z0-9]{10}$/.test(asin) || seenAsin.has(asin)) continue;
      const color = colorOf(v);
      if (color && seenColor.has(color)) continue;
      const img = imageOf(v);
      if (!img || isWeakFacebookPictureUrl(img)) continue;
      const imgKey = productImageKey(img);
      if (!imgKey || seenImg.has(imgKey)) continue;
      const swatchKey = productImageKey(v.imageUrls?.[0]);
      if (swatchKey && imgKey === swatchKey) continue;
      seenAsin.add(asin);
      if (color) seenColor.add(color);
      seenImg.add(imgKey);
      out.push({
        ...v,
        imageUrls: [img],
      });
    }
  }

  return out;
}

/**
 * True when a URL matches the Keepa variations[].image swatch for this ASIN.
 * Those are fabric close-ups — never the main PDP hero.
 */
export function isVariationSwatchImage(
  url: string | null | undefined,
  variant?: ListingVariation | null,
): boolean {
  if (!url || !variant?.imageUrls?.[0]) return false;
  const a = productImageKey(url);
  const b = productImageKey(variant.imageUrls[0]);
  return Boolean(a && b && a === b);
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
 * Expand a Keepa winner into: [original] + 3 Color variations with
 * real different photos. Never ships blank / twin cards.
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

    // Color ASINs first, then resolve MAIN gallery photos via /product
    const colorPool = pickColorVariationCandidates(variationSet.variants, {
      seedAsin,
      seedColor,
      limit: 12,
    });
    if (colorPool.length < MIN_EXTRA_VARIATIONS) continue;

    const candidateAsins = [
      seedAsin,
      ...colorPool.map((v) => String(v.asin).toUpperCase()),
    ];

    const snaps = await keepaProducts(candidateAsins);
    const snapByAsin = new Map(
      snaps.map((s) => [String(s.asin).toUpperCase(), s]),
    );

    /**
     * ONLY Keepa /product gallery heroes (images[0]).
     * Never variations[].image — those are Amazon color swatches
     * (fabric swirls), not the lifestyle photo at the top of the PDP.
     */
    const imageByAsin = new Map<string, string>();
    for (const asin of candidateAsins) {
      const snap = snapByAsin.get(asin);
      const variant =
        asin === seedAsin
          ? seedVariant
          : colorPool.find((v) => String(v.asin).toUpperCase() === asin);
      const galleryHero = normalizeAmazonProductImage(snap?.imageUrl || "");
      const galleryFallbacks = (snap?.galleryImageUrls || [])
        .map((u) => normalizeAmazonProductImage(u))
        .filter(Boolean);

      // Seed may already carry a good mirrored hero — use it only if it is
      // NOT the variation swatch (fabric close-up).
      let preferred = galleryHero;
      if (asin === seedAsin) {
        const seedCandidate = normalizeAmazonProductImage(seed.imageUrl);
        if (
          seedCandidate &&
          !isVariationSwatchImage(seedCandidate, seedVariant)
        ) {
          // Prefer Keepa gallery; fall back to seed only when gallery missing
          preferred = galleryHero || seedCandidate;
        }
      }

      if (!preferred) continue;
      // Hard reject: if the only photo equals the color swatch, skip
      if (isVariationSwatchImage(preferred, variant)) {
        const alt = galleryFallbacks.find(
          (u) => u && !isVariationSwatchImage(u, variant),
        );
        if (!alt) continue;
        preferred = alt;
      }

      const photos = strongVariationImage(
        preferred,
        asin === seedAsin
          ? [
              ...galleryFallbacks,
              ...(seed.imageFallbacks || []).filter(
                (u) => !isVariationSwatchImage(u, seedVariant),
              ),
            ]
          : galleryFallbacks,
        asin,
      );
      if (!photos) continue;
      if (isVariationSwatchImage(photos.imageUrl, variant)) continue;
      imageByAsin.set(asin, photos.imageUrl);
    }

    if (!imageByAsin.has(seedAsin)) continue;
    const seedImgKey = productImageKey(imageByAsin.get(seedAsin)!);

    const extras = pickDistinctVariationExtras(variationSet.variants, {
      seedAsin,
      seedImageKey: seedImgKey,
      seedColor,
      limit: MAX_EXTRA_VARIATIONS,
      imageByAsin,
    });

    if (extras.length < MIN_EXTRA_VARIATIONS) continue;

    const allAsins = [
      seedAsin,
      ...extras.map((v) => String(v.asin).toUpperCase()),
    ];

    const hits: OpportunityProduct[] = [];
    for (const asin of allAsins) {
      const snap = snapByAsin.get(asin);
      const imageUrl = imageByAsin.get(asin);
      if (!imageUrl) continue;
      const price = snap?.buyBoxPrice ?? snap?.newPrice ?? null;
      hits.push({
        asin,
        title: snap?.title || seed.title,
        brand: snap?.brand || seed.brand || "",
        imageUrl,
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

      // hit.imageUrl is already the Keepa /product gallery hero — never swatch
      const photos = strongVariationImage(hit.imageUrl, [], hit.asin);
      if (!photos) return false;
      if (isVariationSwatchImage(photos.imageUrl, variant)) return false;

      const aspect = variant ? aspectLabel(variant.aspects) : "";
      const title = isSeed
        ? seedColor
          ? `${baseProductName(hit.title)} · ${seedColor.replace(/\b\w/g, (c) => c.toUpperCase())}`.slice(
              0,
              80,
            )
          : baseProductName(hit.title) || hit.title.slice(0, 80)
        : aspect
          ? `${baseProductName(hit.title)} · ${aspect}`.slice(0, 80)
          : hit.title.slice(0, 80);

      const imgKey = productImageKey(photos.imageUrl);
      const titleKey = productTitleKey(title);
      if (!imgKey || seenImg.has(imgKey)) return false;
      if (titleKey && seenTitle.has(titleKey)) return false;

      seenAsin.add(hit.asin);
      seenImg.add(imgKey);
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

    // 2) Then exactly 3 visibly different Color variations
    for (const v of extraHits) {
      if (cards.length >= MAX_VARIATION_CARDS) break;
      const asin = String(v.asin).toUpperCase();
      const hit = hits.find((h) => h.asin === asin);
      if (!hit) continue;
      pushCard(hit, v, false);
    }

    if (cards.length < MIN_TOTAL_CARDS) continue;
    if (String(cards[0]?.asin || "").toUpperCase() !== seedAsin) continue;

    // Final visual gate: every card must have a unique photo fingerprint
    const imgKeys = cards.map((c) => productImageKey(c.imageUrl));
    if (new Set(imgKeys).size !== cards.length) continue;

    const format: RonFormat = "vitrina";
    const niche =
      baseProductName(seed.title) || seed.brand || cards[0]?.title || "Deal";
    const money = scorePackMoneyOpportunity(cards, opts.learning);
    const copy = buildFacebookPromoCopy({
      format,
      titles: [seed.title, ...cards.map((c) => c.title)],
      prices: cards.map((c) => c.priceLabel),
      discountPercents: cards.map((c) => c.discountPercent),
      platforms: cards.map(() => "Amazon"),
      niche,
      seed: opts.seed ?? Date.now(),
    });

    // Customer-facing caption only — Amazon-style retail, never Keepa/ops jargon
    const message = copy.message;

    const colorLine = [
      seedColor || "original",
      ...extraHits.map((v) => colorOf(v)).filter(Boolean),
    ]
      .map((c) => c.toUpperCase())
      .slice(0, 4)
      .join(" · ");

    return {
      action: "publish",
      format,
      cards,
      message,
      collectionTitle:
        copy.collectionTitle ||
        baseProductName(seed.title).slice(0, 80) ||
        defaultFacebookCollectionTitle(),
      coverImageUrl: cards[0]?.imageUrl || null,
      niche,
      reason: `Variaciones Keepa · vitrina · original + 3 colores (${colorLine}) · score ${money}`,
    };
  }

  return null;
}
