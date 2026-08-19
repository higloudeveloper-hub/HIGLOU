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
    .enum(["amazon", "amazon_to_ebay", "supplier"])
    .optional()
    .default("amazon_to_ebay"),
  onlySellable: z.boolean().optional().default(true),
  cost: z.number().positive().max(100000).optional(),
  seed: z.coerce.number().int().optional().default(0),
  excludeAsins: z.array(z.string().min(10).max(12)).max(80).optional().default([]),
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

  const fromId = opportunitySearchText(body.categoryId, body.query);
  const query = body.query.trim() || fromId.query;
  const category = body.category.trim() || fromId.category;
  if (!query && !category && !fromId.keepaRoot) {
    return NextResponse.json(
      { error: "Pick a category or type the product you want Higlou to find." },
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
      categoryId: body.categoryId,
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
    });
    return NextResponse.json({
      ok: true,
      products: found.products,
      sources: found.sources,
      filteredOut: found.filteredOut,
      queries: found.queries,
      analyzed: found.analyzed,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Amazon search failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
