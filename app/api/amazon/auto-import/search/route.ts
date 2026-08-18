import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import {
  checkRateLimit,
  clientKeyFromRequest,
} from "@/lib/api/rate-limit";
import {
  amazonSpMissingReason,
  getAmazonSpConfig,
  isAmazonSpConfigured,
} from "@/lib/amazon/sp-config";
import {
  getAmazonConnectionPublic,
  getValidAmazonAccessToken,
} from "@/lib/amazon/sp-oauth";
import { findAmazonWinners } from "@/lib/amazon/find-winners";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  query: z.string().max(200).optional().default(""),
  category: z.string().max(120).optional().default(""),
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

  if (!isAmazonSpConfigured()) {
    return NextResponse.json(
      { error: amazonSpMissingReason(), code: "AMAZON_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const connection = await getAmazonConnectionPublic(
    auth.supabase,
    auth.user.id,
  );
  if (!connection.connected) {
    return NextResponse.json(
      {
        error: "Connect your Amazon seller account in Settings to search the catalog.",
        code: "AMAZON_NOT_CONNECTED",
      },
      { status: 409 },
    );
  }

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
      { error: "Send JSON { query, category }." },
      { status: 400 },
    );
  }

  const query = body.query.trim();
  const category = body.category.trim();
  if (!query && !category) {
    return NextResponse.json(
      { error: "Enter a product number or a category." },
      { status: 400 },
    );
  }

  try {
    const { token } = await getValidAmazonAccessToken(
      auth.supabase,
      auth.user.id,
    );
    const cfg = getAmazonSpConfig();
    const products = await findAmazonWinners({
      accessToken: token,
      marketplaceId: cfg.marketplaceId,
      query,
      category,
    });
    if (!products.length) {
      return NextResponse.json(
        {
          error:
            "Amazon found no matching products. Try a clearer model number or category.",
        },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, products });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Amazon search failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
