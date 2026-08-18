import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import {
  checkRateLimit,
  clientKeyFromRequest,
} from "@/lib/api/rate-limit";
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

  const query = body.query.trim();
  const category = body.category.trim();
  if (!query && !category) {
    return NextResponse.json(
      { error: "Type the product you want Higlou to find." },
      { status: 400 },
    );
  }

  try {
    const products = await findAmazonWinners({
      query,
      category,
      limit: 12,
      pageOrigin: new URL(request.url).origin,
    });
    if (!products.length) {
      return NextResponse.json(
        {
          error:
            "Amazon found no matching products. Try a clearer product name.",
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
