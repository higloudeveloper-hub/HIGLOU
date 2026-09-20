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
import { opportunitySearchText } from "@/lib/opportunity/categories";
import { onlySellableForMode } from "@/lib/opportunity/mode-copy";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  query: z.string().max(200).optional().default(""),
  category: z.string().max(120).optional().default(""),
  categoryId: z.string().max(40).optional().default(""),
  limit: z.coerce.number().int().min(1).max(8).optional().default(8),
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
  onlySellable: z.boolean().optional().default(true),
  cost: z.number().positive().max(100000).optional(),
  seed: z.coerce.number().int().optional().default(0),
  excludeAsins: z.array(z.string().min(10).max(12)).max(80).optional().default([]),
  /** off = free Amazon path (live loop). full = Keepa finder. enrich = hydrate only. */
  keepaMode: z.enum(["off", "enrich", "full"]).optional(),
  keepaPurpose: z.enum(["live", "manual", "enrich"]).optional().default("manual"),
});

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Sign in to search Amazon." },
      { status: 503 },
    );
  }

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const rate = checkRateLimit({
    key: `amazon-auto-search:${clientKeyFromRequest(request, auth.user.id)}`,
    limit: 6,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many Amazon searches. Wait a minute and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000) || 1) },
      },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Send JSON { query }." },
      { status: 400 },
    );
  }

  const fromId = opportunitySearchText(body.categoryId || "all", body.query);
  const query = body.query.trim() || fromId.query;
  const category = body.category.trim() || fromId.category;
  const categoryId = body.categoryId.trim() || "all";
  const globalScan = categoryId === "all";
  // Global Keepa scan needs no typed query — opportunity-first.
  if (!globalScan && !query && !category && !fromId.keepaRoot) {
    return NextResponse.json(
      { error: "Pick All Amazon or type a product to scan." },
      { status: 400 },
    );
  }

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
      query,
      category,
      categoryId,
      keepaRoot: fromId.keepaRoot,
      limit: body.limit,
      pageOrigin: new URL(request.url).origin,
      amazonToken: tokens.amazonToken,
      marketplaceId: tokens.marketplaceId,
      sellingPartnerId: tokens.sellingPartnerId,
      ebayToken: tokens.ebayToken,
      mode: body.mode,
      onlySellable: onlySellableForMode(body.mode, body.onlySellable),
      supplierCost: body.cost,
      seed: body.seed,
      excludeAsins,
      keepaMode: body.keepaMode,
      keepaPurpose: body.keepaPurpose,
    });
    return NextResponse.json({
      ok: true,
      products: found.products,
      sources: found.sources,
      filteredOut: found.filteredOut,
      queries: found.queries,
      analyzed: found.analyzed,
      scope: globalScan ? "global" : "category",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Amazon search failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
