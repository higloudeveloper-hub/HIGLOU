import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { ensureAffiliateLinksFromKeepaWinners } from "@/lib/monetization/affiliate/from-keepa-winners";
import {
  getMonetizationFlags,
  isMoneyEngineEnabled,
} from "@/lib/monetization/flags";
import type { OpportunityProduct } from "@/lib/opportunity/types";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Backfill: every Keepa Amazon winner already in the ledger → affiliate + /go.
 * Safe to call from Facebook Ads studio on load.
 */
export async function POST() {
  if (!isMoneyEngineEnabled() || !getMonetizationFlags().affiliateEngine) {
    return NextResponse.json(
      { error: "Affiliate Engine disabled" },
      { status: 404 },
    );
  }
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase required" }, { status: 503 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("opportunity_ledger")
    .select("asin, payload, mode")
    .eq("user_id", auth.user.id)
    .order("last_seen_at", { ascending: false })
    .limit(80);

  const hits: OpportunityProduct[] = [];
  const seen = new Set<string>();
  for (const row of data || []) {
    const payload = (row.payload || {}) as OpportunityProduct;
    const asin = String(payload.asin || row.asin || "")
      .trim()
      .toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin) || seen.has(asin)) continue;
    seen.add(asin);
    hits.push({
      ...payload,
      asin,
      mode: (payload.mode || row.mode || "amazon") as OpportunityProduct["mode"],
    });
  }

  const result = await ensureAffiliateLinksFromKeepaWinners(auth.supabase, {
    userId: auth.user.id,
    hits,
    source: "keepa_backfill",
    campaignName: "Keepa winners → Facebook",
    limit: 40,
  });

  return NextResponse.json({
    ok: result.ok,
    created: result.created,
    reused: result.reused,
    skipped: result.skipped,
    totalCandidates: hits.length,
    error: result.error || null,
    readyForFacebook: result.created + result.reused,
  });
}
