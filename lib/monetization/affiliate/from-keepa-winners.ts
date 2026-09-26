import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isAmazonProductWinner,
  isKeepaBuyVelocityWinner,
} from "@/lib/opportunity/amazon-product-winner";
import type { OpportunityProduct } from "@/lib/opportunity/types";
import {
  createAffiliateLink,
  resolveUserAssociateTag,
} from "@/lib/monetization/affiliate/links";
import { getMonetizationFlags } from "@/lib/monetization/flags";
import { logMonetizationEvent } from "@/lib/monetization/observability";
import { createSmartLink } from "@/lib/monetization/smart-links";
import { ensureTaggedAmazonDestination } from "@/lib/monetization/affiliate/tagged-url";

export type KeepaAffiliateLinkResult = {
  asin: string;
  affiliateLinkId: string;
  destinationUrl: string;
  smartPath: string | null;
  created: boolean;
};

export type EnsureKeepaAffiliatesResult = {
  ok: boolean;
  created: number;
  reused: number;
  skipped: number;
  links: KeepaAffiliateLinkResult[];
  error?: string;
};

/**
 * Keepa Amazon winners (demand / buy-velocity) → affiliate links for Facebook ads.
 * Arbitrage-only hits without Keepa signal are left alone.
 */
export function isKeepaAmazonAffiliateCandidate(
  hit: OpportunityProduct,
): boolean {
  const asin = String(hit.asin || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) return false;
  if (hit.keepa) return true;
  if (isAmazonProductWinner(hit)) return true;
  if (isKeepaBuyVelocityWinner(hit)) return true;
  // Explicit Amazon-demand mode rows often carry Keepa drops without the flag
  if (
    hit.mode === "amazon" &&
    (hit.bsrDrops90 ?? 0) >= 5 &&
    (hit.buyBoxPrice ?? hit.amazonPrice) != null
  ) {
    return true;
  }
  return false;
}

function appOrigin(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, "")}`;
  }
  return "https://higlou.vercel.app";
}

/**
 * Convert Keepa Amazon winners into tagged Associates links (+ smart /go).
 * Idempotent per ASIN. Never throws — scan/ledger must not fail if Money is off.
 */
export async function ensureAffiliateLinksFromKeepaWinners(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    hits: OpportunityProduct[];
    source?: string;
    campaignName?: string;
    limit?: number;
  },
): Promise<EnsureKeepaAffiliatesResult> {
  const flags = getMonetizationFlags();
  if (!flags.moneyEngine || !flags.affiliateEngine) {
    return {
      ok: false,
      created: 0,
      reused: 0,
      skipped: opts.hits.length,
      links: [],
      error: "Affiliate Engine off — enable MONEY_ENGINE + AFFILIATE_ENGINE",
    };
  }

  const associateTag = await resolveUserAssociateTag(supabase, opts.userId);
  if (!associateTag) {
    return {
      ok: false,
      created: 0,
      reused: 0,
      skipped: opts.hits.length,
      links: [],
      error: "Associate tag missing — paste it in Affiliate / Settings → Money",
    };
  }

  const candidates = opts.hits
    .filter(isKeepaAmazonAffiliateCandidate)
    .slice(0, Math.min(Math.max(opts.limit || 80, 1), 80));

  if (!candidates.length) {
    return { ok: true, created: 0, reused: 0, skipped: 0, links: [] };
  }

  const asins = [
    ...new Set(
      candidates.map((h) => String(h.asin).trim().toUpperCase()),
    ),
  ];

  const { data: existingRows } = await supabase
    .from("affiliate_links")
    .select("id, asin, destination_url, associate_tag")
    .eq("user_id", opts.userId)
    .in("asin", asins);

  const existingByAsin = new Map(
    (existingRows || []).map((row) => [
      String(row.asin || "")
        .trim()
        .toUpperCase(),
      row,
    ]),
  );

  const existingIds = (existingRows || []).map((r) => r.id).filter(Boolean);
  const smartByAff = new Map<string, string>();
  if (existingIds.length) {
    const { data: smarts } = await supabase
      .from("smart_links")
      .select("affiliate_link_id, slug")
      .eq("user_id", opts.userId)
      .in("affiliate_link_id", existingIds);
    for (const s of smarts || []) {
      const affId = String(s.affiliate_link_id || "");
      const slug = String(s.slug || "").trim();
      if (affId && slug && !smartByAff.has(affId)) {
        smartByAff.set(affId, `/go/${slug}`);
      }
    }
  }

  const source = (opts.source || "keepa_winners").slice(0, 40);
  const campaignName = (opts.campaignName || "Keepa winners → Facebook").slice(
    0,
    120,
  );

  let created = 0;
  let reused = 0;
  let skipped = 0;
  const links: KeepaAffiliateLinkResult[] = [];

  for (const hit of candidates) {
    const asin = String(hit.asin).trim().toUpperCase();
    const tagged = ensureTaggedAmazonDestination({
      asin,
      associateTag,
    });
    if (!tagged) {
      skipped += 1;
      continue;
    }

    const existing = existingByAsin.get(asin);
    if (existing?.id) {
      // Heal destination tag if needed
      if (
        !String(existing.destination_url || "").includes(`tag=${associateTag}`)
      ) {
        await supabase
          .from("affiliate_links")
          .update({
            destination_url: tagged,
            associate_tag: associateTag,
          })
          .eq("id", existing.id);
      }

      let smartPath = smartByAff.get(existing.id) || null;
      if (!smartPath && flags.smartLinks) {
        const smart = await createSmartLink(supabase, {
          userId: opts.userId,
          affiliateLinkId: existing.id,
          label: hit.title || asin,
          platform: "facebook",
          destinationUrl: tagged,
        });
        if (smart.ok) {
          smartPath = smart.path;
          smartByAff.set(existing.id, smart.path);
        }
      }

      reused += 1;
      links.push({
        asin,
        affiliateLinkId: existing.id,
        destinationUrl: tagged,
        smartPath,
        created: false,
      });
      continue;
    }

    const made = await createAffiliateLink(supabase, {
      userId: opts.userId,
      asin,
      campaignName,
      source,
      associateTag,
    });
    if (!made.ok) {
      skipped += 1;
      continue;
    }

    // Ensure destination uses the resolved user tag
    if (made.link.destination_url !== tagged) {
      await supabase
        .from("affiliate_links")
        .update({ destination_url: tagged, associate_tag: associateTag })
        .eq("id", made.link.id);
    }

    let smartPath: string | null = null;
    if (flags.smartLinks) {
      const smart = await createSmartLink(supabase, {
        userId: opts.userId,
        affiliateLinkId: made.link.id,
        label: hit.title || asin,
        platform: "facebook",
        destinationUrl: tagged,
      });
      if (smart.ok) smartPath = smart.path;
    }

    existingByAsin.set(asin, {
      id: made.link.id,
      asin,
      destination_url: tagged,
      associate_tag: associateTag,
    });
    created += 1;
    links.push({
      asin,
      affiliateLinkId: made.link.id,
      destinationUrl: tagged,
      smartPath,
      created: true,
    });
  }

  logMonetizationEvent({
    level: "info",
    event: "keepa_winners_to_affiliate",
    detail: {
      userId: opts.userId,
      created,
      reused,
      skipped,
      sample: links.slice(0, 5).map((l) => ({
        asin: l.asin,
        smartPath: l.smartPath,
        created: l.created,
      })),
    },
  });

  return { ok: true, created, reused, skipped, links };
}

/** Absolute share URL for Facebook (smart /go preferred). */
export function keepaAffiliateShareUrl(row: KeepaAffiliateLinkResult): string {
  if (row.smartPath) {
    return `${appOrigin()}${row.smartPath}`;
  }
  return row.destinationUrl;
}
