import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { hasHttpsProductImage } from "@/lib/admin/purge-listings-winners";
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
    // Never auto-purge on ledger read — that wiped Keepa winners after every scan.
    const { data, error } = await admin
      .from("opportunity_ledger")
      .select("asin, payload, net_profit, last_seen_at, query, image_url")
      .eq("user_id", auth.user.id)
      .eq("mode", mode)
      .order("net_profit", { ascending: false })
      .limit(80);
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
        .map((row) => {
          const hit = row.payload as OpportunityProduct;
          if (!hit) return null;
          const asin = String(hit.asin || row.asin || "")
            .trim()
            .toUpperCase();
          if (!/^[A-Z0-9]{10}$/i.test(asin)) return null;
          const imageUrl = String(
            hit.imageUrl || row.image_url || "",
          ).trim();
          if (!hasHttpsProductImage(imageUrl)) return null;
          return { ...hit, asin, imageUrl };
        })
        .filter(Boolean),
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
      const { amazonAsinPrimaryImage } = await import(
        "@/lib/amazon/asin-image"
      );
      const rows = hits
        .filter((hit) => /^[A-Z0-9]{10}$/i.test(String(hit.asin || "")))
        .map((hit) => {
          const asin = String(hit.asin).toUpperCase();
          const imageUrl =
            String(hit.imageUrl || "").trim() || amazonAsinPrimaryImage(asin);
          return {
            user_id: auth.user.id,
            mode: parsed.mode,
            asin,
            query: "",
            title: hit.title || "",
            brand: hit.brand || "",
            image_url: imageUrl,
            amazon_price: hit.amazonPrice,
            ebay_price: hit.ebayActiveMedian ?? hit.ebayPrice,
            net_profit: hit.netProfit,
            roi: hit.roi,
            score: hit.score,
            ebay_count: hit.ebayActiveCount,
            payload: { ...hit, asin, imageUrl },
            last_seen_at: now,
          };
        })
        .filter((row) => /^https?:\/\//i.test(row.image_url));
      if (rows.length) {
        await admin.from("opportunity_ledger").upsert(rows, {
          onConflict: "user_id,mode,asin",
        });
      }

      // Keepa Amazon winners in the ledger → affiliate links for Facebook
      try {
        const { ensureAffiliateLinksFromKeepaWinners } = await import(
          "@/lib/monetization/affiliate/from-keepa-winners"
        );
        await ensureAffiliateLinksFromKeepaWinners(auth.supabase, {
          userId: auth.user.id,
          hits: hits.filter((h) =>
            /^[A-Z0-9]{10}$/i.test(String(h.asin || "")),
          ),
          source: "keepa_ledger",
          campaignName: "Keepa winners → Facebook",
          limit: 40,
        });
      } catch {
        /* affiliate optional — ledger already saved */
      }
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
