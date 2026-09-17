import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { isMoneyEngineEnabled } from "@/lib/monetization/flags";
import { logMonetizationEvent } from "@/lib/monetization/observability";

export const runtime = "nodejs";

const bodySchema = z.object({
  productId: z.string().uuid(),
  asin: z.string().max(20).optional().nullable(),
  note: z.string().max(300).optional(),
});

export async function POST(request: Request) {
  if (!isMoneyEngineEnabled()) {
    return NextResponse.json({ error: "Money Engine disabled" }, { status: 404 });
  }
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid watchlist payload" }, { status: 400 });
  }

  const { error } = await auth.supabase.from("product_watchlist").upsert(
    {
      user_id: auth.user.id,
      product_id: parsed.productId,
      asin: parsed.asin || null,
      note: parsed.note || "",
    },
    { onConflict: "user_id,product_id" },
  );

  if (error) {
    logMonetizationEvent({
      level: "error",
      event: "watchlist_failed",
      detail: { message: error.message },
    });
    return NextResponse.json(
      {
        error: error.message.includes("product_watchlist")
          ? "Watchlist table missing — apply 20260916_monetization.sql"
          : error.message,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  if (!isMoneyEngineEnabled()) {
    return NextResponse.json({ error: "Money Engine disabled" }, { status: 404 });
  }
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { data, error } = await auth.supabase
    .from("product_watchlist")
    .select("id, product_id, asin, note, created_at")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ items: [] });
  return NextResponse.json({ items: data || [] });
}
