import { customAlphabet } from "nanoid";
import { getMonetizationFlags } from "@/lib/monetization/flags";
import { logMonetizationEvent } from "@/lib/monetization/observability";
import {
  ensureTaggedAmazonDestination,
  extractAsinFromAmazonUrl,
  isAmazonProductUrl,
} from "@/lib/monetization/affiliate/tagged-url";
import type { SupabaseClient } from "@supabase/supabase-js";

const slugId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);

export const SMART_LINK_SOURCES = [
  "tiktok",
  "facebook",
  "instagram",
  "qr",
  "website",
  "manual",
  "other",
] as const;

export type SmartLinkSource = (typeof SMART_LINK_SOURCES)[number];

export async function createSmartLink(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    affiliateLinkId: string;
    productId?: string | null;
    label?: string;
    platform?: string;
    destinationUrl: string;
  },
): Promise<
  | { ok: true; slug: string; path: string; id: string }
  | { ok: false; error: string }
> {
  const flags = getMonetizationFlags();
  if (!flags.moneyEngine || !flags.smartLinks) {
    return { ok: false, error: "Smart Links are disabled" };
  }

  const slug = slugId();
  const { data, error } = await supabase
    .from("smart_links")
    .insert({
      user_id: opts.userId,
      slug,
      affiliate_link_id: opts.affiliateLinkId,
      product_id: opts.productId || null,
      label: (opts.label || "").slice(0, 160),
      platform: (opts.platform || "manual").slice(0, 40),
      destination_url: opts.destinationUrl,
    })
    .select("id, slug")
    .single();

  if (error || !data) {
    logMonetizationEvent({
      level: "error",
      event: "smart_link_create_failed",
      detail: { message: error?.message || "unknown" },
    });
    return {
      ok: false,
      error:
        error?.message?.includes("smart_links")
          ? "Smart link tables missing — apply 20260916_monetization.sql"
          : error?.message || "Could not create smart link",
    };
  }

  logMonetizationEvent({
    level: "info",
    event: "smart_link_created",
    detail: { slug: data.slug, affiliateLinkId: opts.affiliateLinkId },
  });

  return { ok: true, id: data.id, slug: data.slug, path: `/go/${data.slug}` };
}

export async function resolveAndTrackSmartLink(
  supabase: SupabaseClient,
  slug: string,
  opts?: { source?: string | null },
): Promise<
  | {
      ok: true;
      destinationUrl: string;
      linkId: string;
      userId: string;
      asin: string | null;
      title: string | null;
      productId: string | null;
    }
  | { ok: false; error: string; status: number }
> {
  const flags = getMonetizationFlags();
  if (!flags.moneyEngine || !flags.smartLinks) {
    return { ok: false, error: "Smart Links are disabled", status: 404 };
  }

  const { data: smart, error } = await supabase
    .from("smart_links")
    .select(
      "id, user_id, affiliate_link_id, product_id, destination_url, platform, click_count, label",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error || !smart) {
    return { ok: false, error: "Link not found", status: 404 };
  }

  const destinationUrl = smart.destination_url;
  if (!destinationUrl || !/^https:\/\//i.test(destinationUrl)) {
    logMonetizationEvent({
      level: "error",
      event: "smart_link_bad_destination",
      detail: { slug },
    });
    return { ok: false, error: "Invalid destination", status: 502 };
  }

  // Heal Amazon destinations missing/wrong Associate tag before redirect
  let finalDestination = destinationUrl;
  let asin: string | null = null;
  if (smart.affiliate_link_id) {
    const { data: aff } = await supabase
      .from("affiliate_links")
      .select("id, click_count, campaign_id, user_id, asin, associate_tag, destination_url")
      .eq("id", smart.affiliate_link_id)
      .maybeSingle();
    if (aff) {
      asin = String(aff.asin || "")
        .trim()
        .toUpperCase() || null;
      const tag = String(aff.associate_tag || "").trim();
      const healed =
        tag && (isAmazonProductUrl(destinationUrl) || aff.asin)
          ? ensureTaggedAmazonDestination({
              asin: aff.asin,
              destinationUrl: aff.destination_url || destinationUrl,
              associateTag: tag,
            })
          : null;
      if (healed && healed !== destinationUrl) {
        finalDestination = healed;
        await supabase
          .from("smart_links")
          .update({ destination_url: healed })
          .eq("id", smart.id);
        await supabase
          .from("affiliate_links")
          .update({ destination_url: healed })
          .eq("id", aff.id);
      }

      await supabase
        .from("smart_links")
        .update({ click_count: (smart.click_count || 0) + 1 })
        .eq("id", smart.id);

      await supabase
        .from("affiliate_links")
        .update({ click_count: (aff.click_count || 0) + 1 })
        .eq("id", aff.id);
      await supabase.from("affiliate_clicks").insert({
        link_id: aff.id,
        user_id: smart.user_id,
        source: opts?.source || smart.platform || "other",
        campaign_id: aff.campaign_id,
        product_id: smart.product_id,
        destination_url: finalDestination,
        is_unique: false,
      });
    } else {
      await supabase
        .from("smart_links")
        .update({ click_count: (smart.click_count || 0) + 1 })
        .eq("id", smart.id);
    }
  } else {
    await supabase
      .from("smart_links")
      .update({ click_count: (smart.click_count || 0) + 1 })
      .eq("id", smart.id);
  }

  if (!asin) {
    const fromDest = extractAsinFromAmazonUrl(finalDestination);
    if (fromDest) asin = fromDest;
  }

  logMonetizationEvent({
    level: "info",
    event: "smart_link_redirect",
    detail: { slug, source: opts?.source || smart.platform || null },
  });

  return {
    ok: true,
    destinationUrl: finalDestination,
    linkId: smart.id,
    userId: smart.user_id,
    asin,
    title: String(smart.label || "").trim() || null,
    productId: smart.product_id || null,
  };
}

/**
 * Peek smart-link destination for Facebook/OG crawlers — no click counting.
 */
export async function peekSmartLink(
  supabase: SupabaseClient,
  slug: string,
): Promise<
  | {
      ok: true;
      destinationUrl: string;
      asin: string | null;
      title: string | null;
      imageUrl: string | null;
    }
  | { ok: false; error: string; status: number }
> {
  const flags = getMonetizationFlags();
  if (!flags.moneyEngine || !flags.smartLinks) {
    return { ok: false, error: "Smart Links are disabled", status: 404 };
  }

  let { data: smart, error } = await supabase
    .from("smart_links")
    .select(
      "id, affiliate_link_id, product_id, destination_url, label, og_image_url",
    )
    .eq("slug", slug)
    .maybeSingle();

  // Migration may not be applied yet — fall back without og_image_url
  if (error) {
    const retry = await supabase
      .from("smart_links")
      .select("id, affiliate_link_id, product_id, destination_url, label")
      .eq("slug", slug)
      .maybeSingle();
    smart = retry.data as typeof smart;
    error = retry.error;
  }

  if (error || !smart) {
    return { ok: false, error: "Link not found", status: 404 };
  }

  let destinationUrl = String(smart.destination_url || "").trim();
  let asin: string | null = null;
  let imageUrl: string | null = null;
  const title = String(smart.label || "").trim() || null;

  if (smart.affiliate_link_id) {
    const { data: aff } = await supabase
      .from("affiliate_links")
      .select("asin, associate_tag, destination_url")
      .eq("id", smart.affiliate_link_id)
      .maybeSingle();
    if (aff) {
      asin =
        String(aff.asin || "")
          .trim()
          .toUpperCase() || null;
      const tag = String(aff.associate_tag || "").trim();
      const healed =
        tag && (isAmazonProductUrl(destinationUrl) || aff.asin)
          ? ensureTaggedAmazonDestination({
              asin: aff.asin,
              destinationUrl: aff.destination_url || destinationUrl,
              associateTag: tag,
            })
          : null;
      if (healed) destinationUrl = healed;
    }
  }

  if (!asin) asin = extractAsinFromAmazonUrl(destinationUrl);

  if (smart.product_id) {
    const { data: img } = await supabase
      .from("product_images")
      .select("public_url")
      .eq("product_id", smart.product_id)
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle();
    const url = String(img?.public_url || "").trim();
    if (/^https?:\/\//i.test(url)) imageUrl = url;
  }

  // Rehosted Facebook CDN wins over listing photos
  const ogStored = String(
    (smart as { og_image_url?: string | null }).og_image_url || "",
  ).trim();
  if (/^https?:\/\//i.test(ogStored)) imageUrl = ogStored;

  if (!destinationUrl || !/^https:\/\//i.test(destinationUrl)) {
    return { ok: false, error: "Invalid destination", status: 502 };
  }

  return { ok: true, destinationUrl, asin, title, imageUrl };
}
