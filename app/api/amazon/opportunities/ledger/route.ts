import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { OpportunityProduct } from "@/lib/opportunity/types";

export const runtime = "nodejs";

const modeSchema = z.enum(["amazon", "amazon_to_ebay", "supplier"]);

const bodySchema = z.object({
  mode: modeSchema,
  hits: z.array(z.unknown()).max(40),
  learn: z
    .array(
      z.object({
        query: z.string().max(200),
        categoryId: z.string().max(40).optional().default(""),
        scans: z.number().int().min(0),
        confirmed: z.number().int().min(0),
        bestKeep: z.number(),
      }),
    )
    .max(40)
    .optional()
    .default([]),
  analyzed: z.number().int().min(0).optional().default(0),
});

export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ hits: [], learn: [], analyzed: 0 });
  }
  const requested = new URL(request.url).searchParams.get("mode") || "amazon_to_ebay";
  const mode = modeSchema.safeParse(requested).success
    ? (requested as z.infer<typeof modeSchema>)
    : "amazon_to_ebay";
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("opportunity_ledger")
      .select("asin, payload, net_profit, last_seen_at, query")
      .eq("user_id", auth.user.id)
      .eq("mode", mode)
      .order("net_profit", { ascending: false })
      .limit(40);
    if (error) {
      return NextResponse.json({ hits: [], learn: [], analyzed: 0, mode });
    }
    const { data: learnRows } = await admin
      .from("opportunity_niche_stats")
      .select("query, category_id, scans, confirmed, best_keep")
      .eq("user_id", auth.user.id)
      .eq("mode", mode)
      .order("confirmed", { ascending: false })
      .limit(40);
    return NextResponse.json({
      mode,
      hits: (data || [])
        .map((row) => row.payload as OpportunityProduct)
        .filter((hit) => hit && /^[A-Z0-9]{10}$/i.test(String(hit.asin || ""))),
      learn: (learnRows || []).map((row) => ({
        query: row.query,
        categoryId: row.category_id || "",
        scans: row.scans || 0,
        confirmed: row.confirmed || 0,
        bestKeep: Number(row.best_keep) || 0,
      })),
      analyzed: 0,
      updatedAt: Date.now(),
    });
  } catch {
    return NextResponse.json({ hits: [], learn: [], analyzed: 0, mode });
  }
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, persisted: false });
  }
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Send the saved opportunities." }, { status: 400 });
  }
  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const hits = parsed.hits as OpportunityProduct[];
    if (hits.length) {
      const rows = hits
        .filter((hit) => /^[A-Z0-9]{10}$/i.test(String(hit.asin || "")))
        .map((hit) => ({
          user_id: auth.user.id,
          mode: parsed.mode,
          asin: String(hit.asin).toUpperCase(),
          query: "",
          title: hit.title || "",
          brand: hit.brand || "",
          image_url: hit.imageUrl || "",
          amazon_price: hit.amazonPrice,
          ebay_price: hit.ebayActiveMedian ?? hit.ebayPrice,
          net_profit: hit.netProfit,
          roi: hit.roi,
          score: hit.score,
          ebay_count: hit.ebayActiveCount,
          payload: hit,
          last_seen_at: now,
        }));
      await admin.from("opportunity_ledger").upsert(rows, {
        onConflict: "user_id,mode,asin",
      });
    }
    if (parsed.learn.length) {
      await admin.from("opportunity_niche_stats").upsert(
        parsed.learn.map((row) => ({
          user_id: auth.user.id,
          mode: parsed.mode,
          query: row.query,
          category_id: row.categoryId || "",
          scans: row.scans,
          confirmed: row.confirmed,
          best_keep: row.bestKeep,
          updated_at: now,
        })),
        { onConflict: "user_id,mode,query" },
      );
    }
    return NextResponse.json({ ok: true, persisted: true });
  } catch {
    return NextResponse.json({ ok: true, persisted: false });
  }
}
