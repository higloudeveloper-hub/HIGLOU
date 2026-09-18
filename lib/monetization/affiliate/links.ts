import { customAlphabet } from "nanoid";
import {
  getAmazonAssociateTag,
  getAffiliateProvider,
  isAmazonAssociatesConfigured,
} from "@/lib/monetization/affiliate/amazon-associates";
import { buildAmazonAssociatesUrl } from "@/lib/monetization/channels/affiliate";
import { getMonetizationFlags } from "@/lib/monetization/flags";
import { logMonetizationEvent } from "@/lib/monetization/observability";
import type { SupabaseClient } from "@supabase/supabase-js";

const trackingId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 10);

export type CreateAffiliateLinkInput = {
  userId: string;
  productId?: string | null;
  asin: string;
  campaignId?: string | null;
  campaignName?: string | null;
  source?: string | null;
  providerId?: string;
  associateTag?: string | null;
};

export type AffiliateLinkRow = {
  id: string;
  tracking_id: string;
  provider_id: string;
  product_id: string | null;
  asin: string | null;
  destination_url: string;
  associate_tag: string;
  campaign_id: string | null;
  source: string | null;
  click_count: number;
  created_at: string;
};

async function resolveAssociateTag(
  supabase: SupabaseClient,
  userId: string,
  override?: string | null,
): Promise<string> {
  const direct = getAmazonAssociateTag(override);
  if (direct) return direct;
  try {
    const { data } = await supabase
      .from("money_machine_settings")
      .select("associate_tag")
      .eq("user_id", userId)
      .maybeSingle();
    return getAmazonAssociateTag(data?.associate_tag);
  } catch {
    return "";
  }
}

export async function createAffiliateLink(
  supabase: SupabaseClient,
  input: CreateAffiliateLinkInput,
): Promise<{ ok: true; link: AffiliateLinkRow } | { ok: false; error: string }> {
  const flags = getMonetizationFlags();
  if (!flags.moneyEngine || !flags.affiliateEngine) {
    return { ok: false, error: "Affiliate Engine is disabled" };
  }

  const providerId = input.providerId || "amazon_associates";
  const associateTag = await resolveAssociateTag(
    supabase,
    input.userId,
    input.associateTag,
  );
  if (!isAmazonAssociatesConfigured(associateTag)) {
    return {
      ok: false,
      error:
        "Associate tag missing — paste it in Settings → Money, or set AMAZON_ASSOCIATE_TAG",
    };
  }

  const asin = String(input.asin || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) {
    return { ok: false, error: "Valid ASIN required" };
  }

  const provider = getAffiliateProvider(providerId);
  const destinationUrl =
    provider?.buildProductUrl({ asinOrSku: asin, campaignId: input.campaignId }) ||
    buildAmazonAssociatesUrl({ asin, associateTag });
  if (!destinationUrl) {
    return { ok: false, error: "Could not build destination URL" };
  }

  let campaignId = input.campaignId || null;
  if (!campaignId && input.campaignName) {
    const { data: campaign, error: campErr } = await supabase
      .from("affiliate_campaigns")
      .insert({
        user_id: input.userId,
        name: input.campaignName.slice(0, 120),
        provider_id: providerId,
        source: input.source || null,
      })
      .select("id")
      .single();
    if (campErr) {
      logMonetizationEvent({
        level: "error",
        event: "campaign_create_failed",
        detail: { message: campErr.message },
      });
      return { ok: false, error: "Could not create campaign" };
    }
    campaignId = campaign.id;
  }

  const track = trackingId();

  const { data, error } = await supabase
    .from("affiliate_links")
    .insert({
      user_id: input.userId,
      tracking_id: track,
      provider_id: providerId,
      product_id: input.productId || null,
      asin,
      destination_url: destinationUrl,
      associate_tag: associateTag,
      campaign_id: campaignId,
      source: input.source || "manual",
    })
    .select(
      "id, tracking_id, provider_id, product_id, asin, destination_url, associate_tag, campaign_id, source, click_count, created_at",
    )
    .single();

  if (error || !data) {
    logMonetizationEvent({
      level: "error",
      event: "affiliate_link_create_failed",
      detail: { message: error?.message || "unknown" },
    });
    return {
      ok: false,
      error:
        error?.message?.includes("affiliate_links")
          ? "Affiliate tables missing — apply supabase/migrations/20260916_monetization.sql"
          : error?.message || "Could not create affiliate link",
    };
  }

  logMonetizationEvent({
    level: "info",
    event: "affiliate_link_created",
    detail: {
      trackingId: data.tracking_id,
      providerId,
      asin,
      productId: input.productId ?? null,
    },
  });

  return { ok: true, link: data as AffiliateLinkRow };
}
