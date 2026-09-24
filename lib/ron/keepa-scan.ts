import type { SupabaseClient } from "@supabase/supabase-js";
import { findAmazonWinners } from "@/lib/amazon/find-winners";
import { loadWinnerMarketTokens } from "@/lib/amazon/winner-tokens";
import { spendCredits, refundCredits } from "@/lib/credits/wallet";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";
import { attachOpportunityBoards } from "@/lib/opportunity/attach-boards";
import {
  isPlatformWinner,
  sortPlatformWinners,
} from "@/lib/opportunity/platform-winner";
import type { OpportunityProduct } from "@/lib/opportunity/types";
import { ensureAffiliateLinksFromKeepaWinners } from "@/lib/monetization/affiliate/from-keepa-winners";
import { KEEPA_STRATEGY_IDS, type KeepaStrategyId } from "@/lib/keepa/strategies";
import type { RonLearning } from "@/lib/ron/types";
import { RON_KEEPA_SCAN_MIN_MINUTES } from "@/lib/ron/types";

export type RonKeepaScanResult = {
  ran: boolean;
  winners: OpportunityProduct[];
  analyzed: number;
  strategy: KeepaStrategyId;
  affiliateCreated: number;
  reason?: string;
  charged: boolean;
  learning: RonLearning;
};

function pickStrategy(learning: RonLearning, seed: number): KeepaStrategyId {
  // Rotate strategies so RON learns different Keepa angles over time
  const preferred = ["velocity", "hot_deals", "price_drop", "rising_price"] as const;
  const idx = Math.abs((learning.cycles || 0) + seed) % preferred.length;
  const id = preferred[idx]!;
  return (KEEPA_STRATEGY_IDS as readonly string[]).includes(id)
    ? id
    : "velocity";
}

function minutesSince(iso: string | null | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return (Date.now() - t) / 60_000;
}

async function persistLedger(
  userId: string,
  hits: OpportunityProduct[],
): Promise<void> {
  if (!hits.length || !isSupabaseConfigured()) return;
  try {
    const admin = createAdminClient();
    const rows = hits.slice(0, 24).map((hit) => ({
      user_id: userId,
      mode: hit.mode || "amazon",
      asin: String(hit.asin || "")
        .trim()
        .toUpperCase(),
      title: hit.title || "",
      brand: hit.brand || "",
      image_url: hit.imageUrl || "",
      amazon_price: hit.amazonPrice ?? hit.buyBoxPrice,
      ebay_price: hit.ebayPrice,
      net_profit: hit.netProfit,
      score: hit.score,
      payload: hit,
      last_seen_at: new Date().toISOString(),
    }));
    await admin.from("opportunity_ledger").upsert(rows, {
      onConflict: "user_id,mode,asin",
    });
  } catch {
    /* ledger optional */
  }
}

/**
 * Live Keepa scan for RON — max once per hour (unless force).
 * Spends winners_scan credits only when winners come back.
 */
export async function maybeRunRonKeepaScan(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    learning: RonLearning;
    force?: boolean;
    pageOrigin?: string;
  },
): Promise<RonKeepaScanResult> {
  const learning = { ...opts.learning };
  const since = minutesSince(learning.lastKeepaScanAt);
  if (!opts.force && since < RON_KEEPA_SCAN_MIN_MINUTES) {
    return {
      ran: false,
      winners: [],
      analyzed: 0,
      strategy: "velocity",
      affiliateCreated: 0,
      charged: false,
      reason: `Keepa ok · próximo scan en ${Math.ceil(RON_KEEPA_SCAN_MIN_MINUTES - since)} min`,
      learning,
    };
  }

  const strategy = pickStrategy(learning, Date.now());
  const spent = await spendCredits({
    userId: opts.userId,
    action: "winners_scan",
    reason: "RON Keepa scan",
    meta: { agent: "ron", strategy },
  });
  if (!spent.ok) {
    return {
      ran: false,
      winners: [],
      analyzed: 0,
      strategy,
      affiliateCreated: 0,
      charged: false,
      reason:
        spent.code === "insufficient"
          ? "Sin créditos para scan Keepa"
          : spent.error || "No se pudo cobrar el scan",
      learning,
    };
  }

  const refund = async (why: string) => {
    if (spent.spent <= 0) return;
    await refundCredits({
      userId: opts.userId,
      action: "winners_scan",
      amount: spent.spent,
      reason: why,
      meta: { agent: "ron", strategy },
    });
  };

  try {
    const tokens = await loadWinnerMarketTokens(supabase, opts.userId);
    const owned = await supabase
      .from("products")
      .select("amazon_asin")
      .eq("user_id", opts.userId);
    const excludeAsins = (owned.data || [])
      .map((row) => String(row.amazon_asin || "").trim().toUpperCase())
      .filter((id) => /^[A-Z0-9]{10}$/.test(id));

    const found = await findAmazonWinners({
      query: "",
      category: "",
      categoryId: "all",
      keepaRoot: "",
      limit: 8,
      pageOrigin: opts.pageOrigin || "https://higlou.vercel.app",
      amazonToken: tokens.amazonToken,
      marketplaceId: tokens.marketplaceId,
      sellingPartnerId: tokens.sellingPartnerId,
      ebayToken: tokens.ebayToken,
      mode: "amazon",
      onlySellable: false,
      seed: learning.cycles || 0,
      excludeAsins,
      keepaMode: "full",
      keepaPurpose: "live",
      keepaStrategy: strategy,
    });

    const winners = sortPlatformWinners(
      (found.products || []).filter((hit) => isPlatformWinner(hit, "amazon")),
    ).slice(0, 8);

    learning.lastKeepaScanAt = new Date().toISOString();

    if (!winners.length) {
      await refund("RON empty Keepa scan refund");
      return {
        ran: true,
        winners: [],
        analyzed: found.analyzed || 0,
        strategy,
        affiliateCreated: 0,
        charged: false,
        reason: "Keepa sin winners esta hora · no cobré",
        learning,
      };
    }

    const withBoards = await attachOpportunityBoards(winners, {
      amazonToken: tokens.amazonToken,
      marketplaceId: tokens.marketplaceId,
      ebayToken: tokens.ebayToken,
      deep: false,
    });

    if (!withBoards.length) {
      await refund("RON empty board refund");
      return {
        ran: true,
        winners: [],
        analyzed: found.analyzed || 0,
        strategy,
        affiliateCreated: 0,
        charged: false,
        reason: "Keepa sin board listo · no cobré",
        learning,
      };
    }

    await persistLedger(opts.userId, withBoards);

    const aff = await ensureAffiliateLinksFromKeepaWinners(supabase, {
      userId: opts.userId,
      hits: withBoards,
      source: "ron_keepa",
      campaignName: "RON Keepa → Facebook",
      limit: 8,
    });

    return {
      ran: true,
      winners: withBoards,
      analyzed: found.analyzed || withBoards.length,
      strategy,
      affiliateCreated: aff.created,
      charged: true,
      reason: `Keepa ${strategy}: ${withBoards.length} trends · ${aff.created} links nuevos`,
      learning,
    };
  } catch (err) {
    await refund("RON Keepa scan failed refund");
    learning.lastKeepaScanAt = new Date().toISOString();
    return {
      ran: true,
      winners: [],
      analyzed: 0,
      strategy,
      affiliateCreated: 0,
      charged: false,
      reason:
        err instanceof Error
          ? `Keepa falló: ${err.message}`
          : "Keepa scan falló",
      learning,
    };
  }
}
