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
import {
  isPlatformWinner,
  sortPlatformWinners,
} from "@/lib/opportunity/platform-winner";
import type { OpportunityMode } from "@/lib/opportunity/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * General opportunity scan — no category, no query.
 * Keepa Product Finder rotates roots + eBay asks; returns up to 5 real winners.
 */
const bodySchema = z.object({
  limit: z.coerce.number().int().min(1).max(5).optional().default(5),
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
      { error: "Send JSON { limit: 1-5 }." },
      { status: 400 },
    );
  }

  const mode = body.mode as OpportunityMode;

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

    return NextResponse.json({
      ok: true,
      products: winners,
      sources: found.sources,
      filteredOut: found.filteredOut,
      queries: found.queries,
      analyzed: found.analyzed,
      scope: "general",
      limit: body.limit,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Opportunity scan failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
