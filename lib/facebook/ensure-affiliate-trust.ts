import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createAffiliateLink,
  resolveUserAssociateTag,
} from "@/lib/monetization/affiliate/links";
import {
  amazonUrlHasAssociateTag,
  ensureTaggedAmazonDestination,
  extractAsinFromAmazonUrl,
  isAmazonProductUrl,
  isSmartGoPath,
  isValidAsin,
  smartGoSlug,
} from "@/lib/monetization/affiliate/tagged-url";
import { getMonetizationFlags } from "@/lib/monetization/flags";
import { createSmartLink } from "@/lib/monetization/smart-links";

export type TrustPromoCard = {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string;
  priceLabel?: string | null;
  asin?: string | null;
  imageFallbacks?: string[] | null;
  discountPercent?: number | null;
  sourcePlatform?: string | null;
};

function appOrigin(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, "")}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }
  return "https://higlou.vercel.app";
}

function absoluteGoPath(path: string): string {
  const origin = appOrigin();
  if (origin) return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
  return path.startsWith("/") ? path : `/${path}`;
}

async function findExistingSmartPath(
  supabase: SupabaseClient,
  userId: string,
  asin: string,
): Promise<{
  path: string;
  destinationUrl: string;
  affiliateLinkId: string | null;
} | null> {
  const { data: link } = await supabase
    .from("affiliate_links")
    .select("id, destination_url, associate_tag")
    .eq("user_id", userId)
    .eq("asin", asin)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!link?.id) return null;

  const { data: smart } = await supabase
    .from("smart_links")
    .select("slug, destination_url")
    .eq("user_id", userId)
    .eq("affiliate_link_id", link.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (smart?.slug) {
    return {
      path: `/go/${smart.slug}`,
      destinationUrl: String(smart.destination_url || link.destination_url || ""),
      affiliateLinkId: link.id,
    };
  }
  return {
    path: "",
    destinationUrl: String(link.destination_url || ""),
    affiliateLinkId: link.id,
  };
}

/**
 * Before Facebook publish: every Amazon-bound card must land on amazon.com?tag=.
 * Prefers smart /go/ links (click tracking + guaranteed tag hop).
 * Fails closed if Associate tag is missing for Amazon products.
 */
export async function ensureFacebookPromoAffiliateTrust(
  supabase: SupabaseClient,
  opts: { userId: string; cards: TrustPromoCard[] },
): Promise<
  | { ok: true; cards: TrustPromoCard[]; associateTag: string }
  | { ok: false; error: string }
> {
  const flags = getMonetizationFlags();
  const associateTag = await resolveUserAssociateTag(supabase, opts.userId);

  const needsAmazon = opts.cards.some((c) => {
    const asin = String(c.asin || "").trim().toUpperCase();
    if (isValidAsin(asin)) return true;
    if (isAmazonProductUrl(c.linkUrl)) return true;
    if (isSmartGoPath(c.linkUrl)) return true;
    return false;
  });

  if (needsAmazon && !associateTag) {
    return {
      ok: false,
      error:
        "Falta tu Associate tag — pegalo en Affiliate / Settings → Money antes de pagar ads. Sin tag= no hay comisión.",
    };
  }

  if (needsAmazon && (!flags.moneyEngine || !flags.affiliateEngine)) {
    // Still allow publish when every Amazon card is already a trusted hop
    // (/go smart link or amazon.com?tag=). Blocks only minting new rows.
    const allTrusted = opts.cards.every((c) => {
      const linkUrl = String(c.linkUrl || "").trim();
      if (isSmartGoPath(linkUrl)) return true;
      if (
        isAmazonProductUrl(linkUrl) &&
        amazonUrlHasAssociateTag(linkUrl, associateTag)
      ) {
        return true;
      }
      return false;
    });
    if (!allTrusted) {
      return {
        ok: false,
        error:
          "Affiliate Engine está apagado en el servidor (MONEY_ENGINE + AFFILIATE_ENGINE). Sin eso no se puede garantizar la comisión.",
      };
    }
  }

  const out: TrustPromoCard[] = [];

  for (const card of opts.cards) {
    const linkUrl = String(card.linkUrl || "").trim();
    let asin = String(card.asin || "").trim().toUpperCase();
    if (!isValidAsin(asin)) {
      asin = extractAsinFromAmazonUrl(linkUrl) || "";
    }

    // eBay / custom non-Amazon — leave alone
    const amazonBound =
      isValidAsin(asin) ||
      isAmazonProductUrl(linkUrl) ||
      isSmartGoPath(linkUrl);
    if (!amazonBound) {
      out.push(card);
      continue;
    }

    // Already a smart /go/ link → heal destination tag in DB, keep the share URL
    const slug = smartGoSlug(linkUrl);
    if (slug) {
      const healed = await healSmartLinkDestination(supabase, {
        slug,
        userId: opts.userId,
        associateTag,
        asin: isValidAsin(asin) ? asin : null,
      });
      if (!healed.ok) {
        return { ok: false, error: healed.error };
      }
      const abs = linkUrl.startsWith("http")
        ? linkUrl
        : absoluteGoPath(`/go/${slug}`);
      out.push({
        ...card,
        linkUrl: abs,
        asin: healed.asin || asin || null,
      });
      continue;
    }

    // Direct Amazon URL already correctly tagged → keep (still commission-safe)
    if (
      isAmazonProductUrl(linkUrl) &&
      amazonUrlHasAssociateTag(linkUrl, associateTag)
    ) {
      out.push({
        ...card,
        asin: asin || extractAsinFromAmazonUrl(linkUrl),
      });
      continue;
    }

    if (!isValidAsin(asin)) {
      return {
        ok: false,
        error:
          "Hay un producto Amazon sin ASIN — no se puede generar el link de afiliado con tag=.",
      };
    }

    // Reuse existing affiliate + smart link when possible
    const existing = await findExistingSmartPath(supabase, opts.userId, asin);
    const tagged =
      ensureTaggedAmazonDestination({
        asin,
        destinationUrl: existing?.destinationUrl || linkUrl,
        associateTag,
      }) || null;

    if (!tagged) {
      return {
        ok: false,
        error: `No se pudo etiquetar ASIN ${asin} con tu Associate tag.`,
      };
    }

    if (existing?.path) {
      // Heal stored destination if needed
      await supabase
        .from("smart_links")
        .update({ destination_url: tagged })
        .eq("user_id", opts.userId)
        .eq("slug", existing.path.replace(/^\/go\//, ""));
      await supabase
        .from("affiliate_links")
        .update({ destination_url: tagged, associate_tag: associateTag })
        .eq("user_id", opts.userId)
        .eq("asin", asin);
      out.push({
        ...card,
        linkUrl: absoluteGoPath(existing.path),
        asin,
      });
      continue;
    }

    // Have affiliate row but no smart link yet — attach /go without duplicating
    if (existing?.affiliateLinkId) {
      await supabase
        .from("affiliate_links")
        .update({ destination_url: tagged, associate_tag: associateTag })
        .eq("id", existing.affiliateLinkId);
      let shareUrl = tagged;
      if (flags.smartLinks) {
        const smart = await createSmartLink(supabase, {
          userId: opts.userId,
          affiliateLinkId: existing.affiliateLinkId,
          label: card.title || asin,
          platform: "facebook",
          destinationUrl: tagged,
        });
        if (smart.ok) shareUrl = absoluteGoPath(smart.path);
      }
      out.push({ ...card, linkUrl: shareUrl, asin });
      continue;
    }

    // Mint affiliate + smart link for Facebook Ads
    const created = await createAffiliateLink(supabase, {
      userId: opts.userId,
      asin,
      campaignName: String(card.title || asin).slice(0, 80) || "Affiliate",
      source: "facebook",
      associateTag,
    });
    if (!created.ok) {
      return { ok: false, error: created.error };
    }

    // Force destination to the resolved tagged URL (provider/env edge cases)
    if (created.link.destination_url !== tagged) {
      await supabase
        .from("affiliate_links")
        .update({ destination_url: tagged, associate_tag: associateTag })
        .eq("id", created.link.id);
    }

    let shareUrl = tagged;
    if (flags.smartLinks) {
      const smart = await createSmartLink(supabase, {
        userId: opts.userId,
        affiliateLinkId: created.link.id,
        label: card.title || asin,
        platform: "facebook",
        destinationUrl: tagged,
      });
      if (smart.ok) {
        shareUrl = absoluteGoPath(smart.path);
      }
    }

    if (
      isAmazonProductUrl(shareUrl) &&
      !amazonUrlHasAssociateTag(shareUrl, associateTag)
    ) {
      return {
        ok: false,
        error: `El link de ${asin} salió sin tag= — abortando publicación para no quemar ads.`,
      };
    }

    out.push({ ...card, linkUrl: shareUrl, asin });
  }

  return { ok: true, cards: out, associateTag };
}

async function healSmartLinkDestination(
  supabase: SupabaseClient,
  opts: {
    slug: string;
    userId: string;
    associateTag: string;
    asin?: string | null;
  },
): Promise<{ ok: true; asin: string | null } | { ok: false; error: string }> {
  const { data: smart } = await supabase
    .from("smart_links")
    .select("id, user_id, affiliate_link_id, destination_url")
    .eq("slug", opts.slug)
    .maybeSingle();

  if (!smart || smart.user_id !== opts.userId) {
    return {
      ok: false,
      error: `Smart link /go/${opts.slug} no existe o no es tuyo — no publiques ads con links ajenos.`,
    };
  }

  let asin = opts.asin || null;
  let tag = opts.associateTag;
  let dest = String(smart.destination_url || "");

  if (smart.affiliate_link_id) {
    const { data: aff } = await supabase
      .from("affiliate_links")
      .select("asin, associate_tag, destination_url")
      .eq("id", smart.affiliate_link_id)
      .maybeSingle();
    if (aff) {
      asin = String(aff.asin || asin || "")
        .trim()
        .toUpperCase() || null;
      tag = String(aff.associate_tag || tag).trim() || tag;
      dest = String(aff.destination_url || dest);
    }
  }

  const healed = ensureTaggedAmazonDestination({
    asin,
    destinationUrl: dest,
    associateTag: tag,
  });
  if (!healed) {
    return {
      ok: false,
      error: `Smart link /go/${opts.slug} no tiene destino Amazon con tag=. Revisá Affiliate.`,
    };
  }

  if (healed !== smart.destination_url) {
    await supabase
      .from("smart_links")
      .update({ destination_url: healed })
      .eq("id", smart.id);
  }
  if (smart.affiliate_link_id) {
    await supabase
      .from("affiliate_links")
      .update({ destination_url: healed, associate_tag: tag })
      .eq("id", smart.affiliate_link_id);
  }

  return { ok: true, asin: asin && isValidAsin(asin) ? asin : null };
}
