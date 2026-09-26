import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildFacebookPromoCopy,
  defaultFacebookCollectionTitle,
} from "@/lib/facebook/promo-copy";
import { keepaVariationSet } from "@/lib/keepa/variations";
import { keepaProducts } from "@/lib/keepa/finder";
import {
  ensureAffiliateLinksFromKeepaWinners,
  keepaAffiliateShareUrl,
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
import { hasHttpsProductImage } from "@/lib/admin/purge-listings-winners";

const MAX_VARIATION_CARDS = 8;
const MIN_VARIATION_CARDS = 2;

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

/**
 * Expand a Keepa winner into a carousel/vitrina of ALL its Color/Size options.
 * Consistency wow: shoppers swipe the full family, not random unrelated ASINs.
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

  // Prefer the strongest money card as the parent seed
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
    if (!variationSet || variationSet.variants.length < MIN_VARIATION_CARDS) {
      continue;
    }

    // Prefer diverse Color options first, then Size
    const variants = [...variationSet.variants].sort((a, b) => {
      const ac = a.aspects.Color || "";
      const bc = b.aspects.Color || "";
      if (ac !== bc) return ac.localeCompare(bc);
      return (a.aspects.Size || "").localeCompare(b.aspects.Size || "");
    });

    const asins = [
      ...new Set(
        variants
          .map((v) => String(v.asin || "").toUpperCase())
          .filter((a) => /^[A-Z0-9]{10}$/.test(a)),
      ),
    ].slice(0, MAX_VARIATION_CARDS + 4);

    if (asins.length < MIN_VARIATION_CARDS) continue;

    const snaps = await keepaProducts(asins);
    const snapByAsin = new Map(
      snaps.map((s) => [String(s.asin).toUpperCase(), s]),
    );

    // Synthetic Keepa hits so affiliate mint works
    const hits: OpportunityProduct[] = [];
    for (const asin of asins) {
      const snap = snapByAsin.get(asin);
      const variant = variants.find(
        (v) => String(v.asin).toUpperCase() === asin,
      );
      const imageUrl =
        String(variant?.imageUrls?.[0] || snap?.imageUrl || "").trim() ||
        ronImagePack(asin).imageUrl;
      if (!hasHttpsProductImage(imageUrl)) continue;
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

    if (hits.length < MIN_VARIATION_CARDS) continue;

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
    const seen = new Set<string>();

    for (const hit of hits) {
      if (cards.length >= MAX_VARIATION_CARDS) break;
      if (seen.has(hit.asin)) continue;
      const link = linkByAsin.get(hit.asin);
      let linkUrl = link ? keepaAffiliateShareUrl(link) : "";
      if (!/^https?:\/\//i.test(linkUrl)) {
        linkUrl =
          ensureTaggedAmazonDestination({
            asin: hit.asin,
            associateTag: opts.associateTag,
          }) || "";
      }
      if (!/^https?:\/\//i.test(linkUrl)) continue;

      const variant = variants.find(
        (v) => String(v.asin).toUpperCase() === hit.asin,
      );
      const aspect = variant ? aspectLabel(variant.aspects) : "";
      const pack = ronImagePack(
        hit.asin,
        variant?.imageUrls?.[0] || hit.imageUrl,
      );
      if (!/^https?:\/\//i.test(pack.imageUrl)) continue;

      const title = aspect
        ? `${baseProductName(hit.title)} · ${aspect}`.slice(0, 80)
        : hit.title.slice(0, 80);

      seen.add(hit.asin);
      cards.push({
        id: `ron-var:${hit.asin}`,
        title,
        brand: hit.brand || seed.brand || null,
        asin: hit.asin,
        imageUrl: pack.imageUrl,
        linkUrl: linkUrl.startsWith("/") ? `${origin}${linkUrl}` : linkUrl,
        priceLabel: moneyLabel(hit.buyBoxPrice ?? hit.amazonPrice),
        meta: aspect || hit.brand || hit.asin,
        imageFallbacks: pack.imageFallbacks,
        discountPercent:
          hit.discount90 != null && hit.discount90 > 0.05
            ? Math.round(hit.discount90 * 100)
            : null,
        sourcePlatform: "Amazon",
      });
    }

    if (cards.length < MIN_VARIATION_CARDS) continue;

    const format: RonFormat = cards.length >= 3 ? "vitrina" : "carousel";
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

    // Variation-family copy — consistency signal
    const axisLine = variationSet.axisNames.length
      ? variationSet.axisNames.map((a) => a.toUpperCase()).join(" · ")
      : "OPCIONES";
    const message = [
      copy.message.split("\n")[0] || niche.toUpperCase(),
      "",
      `TODAS LAS VARIACIONES · ${axisLine}`,
      `${cards.length} opciones · misma familia Keepa`,
      "SWIPE → ELEGÍ LA TUYA",
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
      reason: `Variaciones Keepa · ${format} · ${cards.length} opciones · ${axes} · score ${money}`,
    };
  }

  return null;
}
