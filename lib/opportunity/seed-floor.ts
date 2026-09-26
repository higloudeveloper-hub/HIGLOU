import type { SupabaseClient } from "@supabase/supabase-js";
import { findAmazonWinners } from "@/lib/amazon/find-winners";
import { ensureAffiliateLinksFromKeepaWinners } from "@/lib/monetization/affiliate/from-keepa-winners";
import { persistOpportunityHits } from "@/lib/opportunity/persist-hits";
import {
  isPlatformWinner,
  sortPlatformWinners,
} from "@/lib/opportunity/platform-winner";
import { RON_MEMORY_RESET_VERSION } from "@/lib/admin/purge-listings-winners";

/** One-shot: refill empty floor after the ghost purge wiped Keepa winners. */
export const FLOOR_SEED_VERSION = "2026-09-26-v2-ron-refill";

/**
 * If this user's opportunity_ledger is empty, seed real Keepa winners once
 * and mint affiliate /go links so Market + Facebook + Find Winners are not blank.
 */
export async function maybeSeedEmptyFloor(
  admin: SupabaseClient,
  opts: {
    userId: string;
    supabase: SupabaseClient;
    limit?: number;
    pageOrigin?: string;
    /** Ignore prior floorSeedVersion stamp (RON Forzar ciclo) */
    force?: boolean;
  },
): Promise<{
  seeded: boolean;
  saved: number;
  affiliates: number;
  skipped?: string;
}> {
  const { count, error: countErr } = await admin
    .from("opportunity_ledger")
    .select("*", { count: "exact", head: true })
    .eq("user_id", opts.userId);
  if (countErr) {
    return { seeded: false, saved: 0, affiliates: 0, skipped: countErr.message };
  }
  if ((count ?? 0) > 0) {
    return { seeded: false, saved: 0, affiliates: 0, skipped: "ledger_has_rows" };
  }

  const { data: ron } = await admin
    .from("ron_agent_state")
    .select("learning")
    .eq("user_id", opts.userId)
    .maybeSingle();
  const learning =
    ron?.learning && typeof ron.learning === "object"
      ? (ron.learning as Record<string, unknown>)
      : {};
  if (!opts.force && learning.floorSeedVersion === FLOOR_SEED_VERSION) {
    return { seeded: false, saved: 0, affiliates: 0, skipped: "already_seeded" };
  }

  const limit = Math.min(Math.max(opts.limit || 12, 4), 16);
  const pageOrigin = opts.pageOrigin || "https://higlou.vercel.app";

  let winners: Awaited<ReturnType<typeof findAmazonWinners>>["products"] = [];
  try {
    // Try hot_deals first, then velocity — both must pass isPlatformWinner
    for (const strategy of ["hot_deals", "velocity", "price_drop"] as const) {
      const found = await findAmazonWinners({
        query: "",
        category: "",
        categoryId: "all",
        keepaRoot: "",
        limit,
        pageOrigin,
        mode: "amazon",
        onlySellable: false,
        seed: Date.now() % 97,
        excludeAsins: [],
        keepaMode: "full",
        keepaPurpose: "live",
        keepaStrategy: strategy,
      });
      winners = sortPlatformWinners(
        (found.products || []).filter((hit) => isPlatformWinner(hit, "amazon")),
      ).slice(0, limit);
      if (winners.length >= 4) break;
    }
  } catch {
    return { seeded: false, saved: 0, affiliates: 0, skipped: "keepa_scan_failed" };
  }

  if (!winners.length) {
    // Still stamp so we don't hammer Keepa every Market refresh
    await stampFloorSeed(admin, opts.userId, learning, 0);
    return { seeded: false, saved: 0, affiliates: 0, skipped: "no_winners" };
  }

  const { saved } = await persistOpportunityHits(admin, {
    userId: opts.userId,
    hits: winners,
    mode: "amazon",
    limit,
  });

  let affiliates = 0;
  try {
    const aff = await ensureAffiliateLinksFromKeepaWinners(opts.supabase, {
      userId: opts.userId,
      hits: winners,
      source: "floor_seed",
      campaignName: "Keepa floor seed → Facebook",
      limit,
    });
    affiliates = aff.created + aff.reused;
  } catch {
    /* affiliate optional */
  }

  await stampFloorSeed(admin, opts.userId, learning, saved);

  return { seeded: saved > 0, saved, affiliates };
}

async function stampFloorSeed(
  admin: SupabaseClient,
  userId: string,
  learning: Record<string, unknown>,
  saved: number,
) {
  const nextLearning = {
    ...learning,
    floorSeedVersion: FLOOR_SEED_VERSION,
    memoryResetVersion: RON_MEMORY_RESET_VERSION,
    historyPurgeVersion:
      learning.historyPurgeVersion || "2026-09-24-v2-vitrinas",
  };
  await admin.from("ron_agent_state").upsert(
    {
      user_id: userId,
      learning: nextLearning,
      status_message:
        saved > 0
          ? `Floor sembrado · ${saved} Keepa listos`
          : "Floor vacío · Keepa sin winners esta ronda",
      last_error: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}
