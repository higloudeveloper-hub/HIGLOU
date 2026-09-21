import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import {
  checkRateLimit,
  clientKeyFromRequest,
} from "@/lib/api/rate-limit";
import { findAmazonWinners } from "@/lib/amazon/find-winners";
import { loadWinnerMarketTokens } from "@/lib/amazon/winner-tokens";
import { attachOpportunityBoards } from "@/lib/opportunity/attach-boards";
import {
  isPlatformWinner,
  sortPlatformWinners,
} from "@/lib/opportunity/platform-winner";
import type { OpportunityMode } from "@/lib/opportunity/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * General opportunity scan — no category, no query.
 * Credits only stick when we return real winners; empty/error → refund.
 */
const bodySchema = z.object({
  limit: z.coerce.number().int().min(1).max(12).optional().default(8),
  mode: z
    .enum([
      "amazon",
      "amazon_to_ebay",
      "supplier",
      "ebay_to_amazon",
      "homedepot_to_ebay",
      "homedepot_to_amazon",
      "walmart_to_ebay",
      "walmart_to_amazon",
    ])
    .optional()
    .default("amazon_to_ebay"),
  seed: z.coerce.number().int().optional().default(0),
  excludeAsins: z
    .array(z.string().min(10).max(12))
    .max(80)
    .optional()
    .default([]),
});

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Sign in to scan opportunities." },
      { status: 503 },
    );
  }

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const rate = checkRateLimit({
    key: `winners-scan:${clientKeyFromRequest(request, auth.user.id)}`,
    limit: 8,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many scans. Wait a minute and try again." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000) || 1),
        },
      },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json().catch(() => ({})));
  } catch {
    return NextResponse.json(
      { error: "No se pudo iniciar el escaneo. Intenta de nuevo." },
      { status: 400 },
    );
  }

  const { spendCredits, refundCredits } = await import("@/lib/credits/wallet");
  const spent = await spendCredits({
    userId: auth.user.id,
    action: "winners_scan",
    reason: "Find Winners scan",
    meta: { mode: body.mode },
  });
  if (!spent.ok) {
    return NextResponse.json(
      {
        error: spent.error,
        code: spent.code || "credits",
        balance: spent.balance,
        needed: spent.needed,
        rechargeHref: "/credits",
      },
      { status: spent.code === "insufficient" ? 402 : 503 },
    );
  }

  const mode = body.mode as OpportunityMode;
  const refundScan = async (why: string) => {
    if (spent.spent <= 0) return;
    await refundCredits({
      userId: auth.user.id,
      action: "winners_scan",
      amount: spent.spent,
      reason: why,
      meta: { mode },
    });
  };

  try {
    const tokens = await loadWinnerMarketTokens(auth.supabase, auth.user.id);
    const owned = await auth.supabase
      .from("products")
      .select("amazon_asin")
      .eq("user_id", auth.user.id);
    const excludeAsins = [
      ...new Set([
        ...(owned.data || [])
          .map((row) => String(row.amazon_asin || "").trim().toUpperCase())
          .filter((id) => /^[A-Z0-9]{10}$/.test(id)),
        ...body.excludeAsins
          .map((id) => id.trim().toUpperCase())
          .filter((id) => /^[A-Z0-9]{10}$/.test(id)),
      ]),
    ];

    const found = await findAmazonWinners({
      query: "",
      category: "",
      categoryId: "all",
      keepaRoot: "",
      limit: body.limit,
      pageOrigin: new URL(request.url).origin,
      amazonToken: tokens.amazonToken,
      marketplaceId: tokens.marketplaceId,
      sellingPartnerId: tokens.sellingPartnerId,
      ebayToken: tokens.ebayToken,
      mode,
      onlySellable: false,
      seed: body.seed,
      excludeAsins,
      keepaMode: "full",
      keepaPurpose: "manual",
    });

    const winners = sortPlatformWinners(
      (found.products || []).filter((hit) => isPlatformWinner(hit, mode)),
    ).slice(0, body.limit);

    if (!winners.length) {
      await refundScan("Empty scan refund");
      return NextResponse.json({
        ok: true,
        products: [],
        code: "no_results",
        charged: false,
        message:
          mode === "amazon_to_ebay"
            ? "Sin arbitraje esta ronda. No cobramos. Probá otra vez o buscá un producto/ASIN."
            : "Sin demanda Keepa esta ronda. No cobramos. Probá otra vez o buscá un ASIN.",
        sources: found.sources,
        filteredOut: found.filteredOut,
        queries: found.queries,
        analyzed: found.analyzed,
        scope: "general",
        limit: body.limit,
        balance: spent.wallet.balance + spent.spent,
      });
    }

    const withBoards = await attachOpportunityBoards(winners, {
      amazonToken: tokens.amazonToken,
      marketplaceId: tokens.marketplaceId,
      ebayToken: tokens.ebayToken,
      deep: true,
    });

    if (!withBoards.length) {
      await refundScan("Empty board refund");
      return NextResponse.json({
        ok: true,
        products: [],
        code: "no_results",
        charged: false,
        message: "Sin winners listos. No cobramos esta ronda.",
        sources: found.sources,
        analyzed: found.analyzed,
        scope: "general",
        limit: body.limit,
      });
    }

    // Keepa Amazon winners → affiliate + smart /go (ready for Facebook ads)
    let affiliate: {
      created: number;
      reused: number;
      skipped: number;
      error?: string;
    } | null = null;
    try {
      const { ensureAffiliateLinksFromKeepaWinners } = await import(
        "@/lib/monetization/affiliate/from-keepa-winners"
      );
      const aff = await ensureAffiliateLinksFromKeepaWinners(auth.supabase, {
        userId: auth.user.id,
        hits: withBoards,
        source: "keepa_scan",
        campaignName: "Keepa winners → Facebook",
        limit: body.limit,
      });
      affiliate = {
        created: aff.created,
        reused: aff.reused,
        skipped: aff.skipped,
        error: aff.error,
      };
    } catch {
      affiliate = null;
    }

    return NextResponse.json({
      ok: true,
      products: withBoards,
      charged: true,
      spent: spent.spent,
      affiliate,
      sources: {
        ...found.sources,
        retailSearch: withBoards.some((h) =>
          h.priceBoard.platforms.some(
            (p) =>
              (p.platform === "walmart" || p.platform === "homedepot") &&
              p.price != null,
          ),
        ),
      },
      filteredOut: found.filteredOut,
      queries: found.queries,
      analyzed: found.analyzed,
      scope: "general",
      limit: body.limit,
    });
  } catch (error) {
    await refundScan("Failed scan refund");
    const message =
      error instanceof Error ? error.message : "Opportunity scan failed";
    const keepaHint = /keepa/i.test(message)
      ? " Conectá Keepa en Settings o buscá un producto concreto."
      : "";
    return NextResponse.json(
      {
        error: `${message}${keepaHint}`,
        code: "scan_failed",
        charged: false,
      },
      { status: 422 },
    );
  }
}
