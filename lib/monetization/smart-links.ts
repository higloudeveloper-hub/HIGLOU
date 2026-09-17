import { customAlphabet } from "nanoid";
import { getMonetizationFlags } from "@/lib/monetization/flags";
import { logMonetizationEvent } from "@/lib/monetization/observability";
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
  | { ok: true; destinationUrl: string; linkId: string; userId: string }
  | { ok: false; error: string; status: number }
> {
  const flags = getMonetizationFlags();
  if (!flags.moneyEngine || !flags.smartLinks) {
    return { ok: false, error: "Smart Links are disabled", status: 404 };
  }

  const { data: smart, error } = await supabase
    .from("smart_links")
    .select(
      "id, user_id, affiliate_link_id, product_id, destination_url, platform, click_count",
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

  // Increment counters (best-effort)
  await supabase
    .from("smart_links")
    .update({ click_count: (smart.click_count || 0) + 1 })
    .eq("id", smart.id);

  if (smart.affiliate_link_id) {
    const { data: aff } = await supabase
      .from("affiliate_links")
      .select("id, click_count, campaign_id, user_id")
      .eq("id", smart.affiliate_link_id)
      .maybeSingle();
    if (aff) {
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
        destination_url: destinationUrl,
        is_unique: false,
      });
    }
  }

  logMonetizationEvent({
    level: "info",
    event: "smart_link_redirect",
    detail: { slug, source: opts?.source || smart.platform || null },
  });

  return {
    ok: true,
    destinationUrl,
    linkId: smart.id,
    userId: smart.user_id,
  };
}
