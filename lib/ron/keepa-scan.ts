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
import {
  KEEPA_STRATEGY_IDS,
  type KeepaStrategyId,
} from "@/lib/keepa/strategies";
import {
  mergeRonKeepaStrategyHits,
  pickRonKeepaDecisions,
  summarizeStrategyCounts,
} from "@/lib/ron/keepa-rank";
import type { RonLearning } from "@/lib/ron/types";
import { RON_DEFAULT_LEARNING, RON_KEEPA_SCAN_MIN_MINUTES } from "@/lib/ron/types";

export type RonKeepaScanResult = {
  ran: boolean;
  winners: OpportunityProduct[];
  analyzed: number;
  /** Primary strategy label for UI — always "general" when multi ran */
  strategy: KeepaStrategyId | "general";
  strategiesRun: KeepaStrategyId[];
  strategyHits: Partial<Record<KeepaStrategyId, number>>;
  affiliateCreated: number;
  reason?: string;
  charged: boolean;
  learning: RonLearning;
};

function minutesSince(iso: string | null | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return (Date.now() - t) / 60_000;
}

function reinforceStrategies(
  learning: RonLearning,
  winners: OpportunityProduct[],
): RonLearning {
  const next: RonLearning = {
    ...learning,
    strategies: {
      ...RON_DEFAULT_LEARNING.strategies,
      ...(learning.strategies || {}),
    },
  };
  for (const hit of winners) {
    const id = String(hit.keepaStrategy || "").trim();
    if (!(KEEPA_STRATEGY_IDS as readonly string[]).includes(id)) continue;
    next.strategies![id] = (next.strategies![id] || 1) + 0.2;
  }
  return next;
}

async function persistLedger(
  userId: string,
  hits: OpportunityProduct[],
): Promise<void> {
  if (!hits.length || !isSupabaseConfigured()) return;
  try {
    const admin = createAdminClient();
    const { amazonAsinPrimaryImage } = await import("@/lib/amazon/asin-image");
    const rows = hits
      .slice(0, 40)
      .map((hit) => {
        const asin = String(hit.asin || "")
          .trim()
          .toUpperCase();
        if (!/^[A-Z0-9]{10}$/.test(asin)) return null;
        const imageUrl =
          String(hit.imageUrl || "").trim() || amazonAsinPrimaryImage(asin);
        if (!/^https?:\/\//i.test(imageUrl)) return null;
        return {
          user_id: userId,
          mode: hit.mode || "amazon",
          asin,
          title: hit.title || "",
          brand: hit.brand || "",
          image_url: imageUrl,
          amazon_price: hit.amazonPrice ?? hit.buyBoxPrice,
          ebay_price: hit.ebayPrice,
          net_profit: hit.netProfit,
          score: hit.score,
          payload: { ...hit, asin, imageUrl },
          last_seen_at: new Date().toISOString(),
        };
      })
      .filter(
        (row): row is NonNullable<typeof row> => row != null,
      );
    if (!rows.length) return;
    await admin.from("opportunity_ledger").upsert(rows, {
      onConflict: "user_id,mode,asin",
    });
  } catch {
    /* ledger optional */
  }
}

/**
 * RON general Keepa scan — runs ALL modalities in one pass,
 * merges consensus, ranks exact decisions, then affiliates.
 * Max once per hour (unless force). One winners_scan charge for the whole pass.
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
  const learning = {
    ...opts.learning,
    strategies: {
      ...RON_DEFAULT_LEARNING.strategies,
      ...(opts.learning.strategies || {}),
    },
  };
  const since = minutesSince(learning.lastKeepaScanAt);
  if (!opts.force && since < RON_KEEPA_SCAN_MIN_MINUTES) {
    return {
      ran: false,
      winners: [],
      analyzed: 0,
      strategy: "general",
      strategiesRun: [],
      strategyHits: {},
      affiliateCreated: 0,
      charged: false,
      reason: `Keepa ok · próximo escaneo general en ${Math.ceil(RON_KEEPA_SCAN_MIN_MINUTES - since)} min`,
      learning,
    };
  }

  const strategiesRun = [...KEEPA_STRATEGY_IDS];
  const spent = await spendCredits({
    userId: opts.userId,
    action: "winners_scan",
    reason: "RON Keepa escaneo general (todas las modalidades)",
    meta: { agent: "ron", strategy: "general", modalities: strategiesRun },
  });
  if (!spent.ok) {
    return {
      ran: false,
      winners: [],
      analyzed: 0,
      strategy: "general",
      strategiesRun: [],
      strategyHits: {},
      affiliateCreated: 0,
      charged: false,
      reason:
        spent.code === "insufficient"
          ? "Sin créditos para escaneo general Keepa"
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
      meta: { agent: "ron", strategy: "general" },
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

    const pageOrigin = opts.pageOrigin || "https://higlou.vercel.app";
    const byStrategy: Partial<Record<KeepaStrategyId, OpportunityProduct[]>> =
      {};
    const strategyHits: Partial<Record<KeepaStrategyId, number>> = {};
    let analyzed = 0;

    // Parallel modalities — one general scan interprets everything
    const settled = await Promise.allSettled(
      strategiesRun.map(async (strategy) => {
        const found = await findAmazonWinners({
          query: "",
          category: "",
          categoryId: "all",
          keepaRoot: "",
          limit: 5,
          pageOrigin,
          amazonToken: tokens.amazonToken,
          marketplaceId: tokens.marketplaceId,
          sellingPartnerId: tokens.sellingPartnerId,
          ebayToken: tokens.ebayToken,
          mode: "amazon",
          onlySellable: false,
          seed: (learning.cycles || 0) + strategiesRun.indexOf(strategy),
          excludeAsins,
          keepaMode: "full",
          keepaPurpose: "live",
          keepaStrategy: strategy,
        });
        const winners = sortPlatformWinners(
          (found.products || []).filter((hit) =>
            isPlatformWinner(hit, "amazon"),
          ),
        )
          .slice(0, 5)
          .map((hit) => ({
            ...hit,
            keepa: true,
            keepaStrategy: strategy,
          }));
        return {
          strategy,
          winners,
          analyzed: found.analyzed || winners.length,
        };
      }),
    );

    for (const result of settled) {
      if (result.status !== "fulfilled") continue;
      const { strategy, winners, analyzed: n } = result.value;
      byStrategy[strategy] = winners;
      strategyHits[strategy] = winners.length;
      analyzed += n;
    }

    learning.lastKeepaScanAt = new Date().toISOString();

    const merged = mergeRonKeepaStrategyHits(byStrategy, learning);
    const decisions = pickRonKeepaDecisions(merged, 12);

    if (!decisions.length) {
      await refund("RON empty Keepa general scan refund");
      return {
        ran: true,
        winners: [],
        analyzed,
        strategy: "general",
        strategiesRun,
        strategyHits,
        affiliateCreated: 0,
        charged: false,
        reason: `Escaneo general · ${summarizeStrategyCounts(byStrategy)} · sin winners · no cobré`,
        learning,
      };
    }

    const withBoards = await attachOpportunityBoards(decisions, {
      amazonToken: tokens.amazonToken,
      marketplaceId: tokens.marketplaceId,
      ebayToken: tokens.ebayToken,
      deep: false,
    });

    const finalHits = (withBoards.length ? withBoards : decisions).map(
      (hit) => {
        const asin = String(hit.asin || "")
          .trim()
          .toUpperCase();
        const ranked = decisions.find((d) => d.asin === asin);
        return {
          ...hit,
          keepa: true,
          keepaStrategy: ranked?.keepaStrategy || hit.keepaStrategy || null,
        };
      },
    );

    if (!finalHits.length) {
      await refund("RON empty board refund");
      return {
        ran: true,
        winners: [],
        analyzed,
        strategy: "general",
        strategiesRun,
        strategyHits,
        affiliateCreated: 0,
        charged: false,
        reason: "Escaneo general sin board listo · no cobré",
        learning,
      };
    }

    await persistLedger(opts.userId, finalHits);

    const aff = await ensureAffiliateLinksFromKeepaWinners(supabase, {
      userId: opts.userId,
      hits: finalHits,
      source: "ron_keepa",
      campaignName: "RON Keepa general → Facebook",
      limit: 16,
    });

    const nextLearning = reinforceStrategies(learning, finalHits);
    const multi = decisions.filter((d) => d.ronStrategies.length >= 2).length;

    return {
      ran: true,
      winners: finalHits,
      analyzed,
      strategy: "general",
      strategiesRun,
      strategyHits,
      affiliateCreated: aff.created,
      charged: true,
      reason: `Escaneo general · ${strategiesRun.length} modalidades · ${summarizeStrategyCounts(byStrategy)} · ${finalHits.length} decisiones (${multi} multi-señal) · ${aff.created} links`,
      learning: nextLearning,
    };
  } catch (err) {
    await refund("RON Keepa general scan failed refund");
    learning.lastKeepaScanAt = new Date().toISOString();
    return {
      ran: true,
      winners: [],
      analyzed: 0,
      strategy: "general",
      strategiesRun,
      strategyHits: {},
      affiliateCreated: 0,
      charged: false,
      reason:
        err instanceof Error
          ? `Keepa general falló: ${err.message}`
          : "Keepa escaneo general falló",
      learning,
    };
  }
}
