import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { hasHttpsProductImage } from "@/lib/admin/purge-listings-winners";
import { mergeMarketFeed } from "@/lib/market/from-opportunity";
import { resolveUserAssociateTag } from "@/lib/monetization/affiliate/links";
import { isPlatformWinner } from "@/lib/opportunity/platform-winner";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { OpportunityMode, OpportunityProduct } from "@/lib/opportunity/types";

export const runtime = "nodejs";
export const maxDuration = 60;

async function loadLedgerHits(userId: string): Promise<OpportunityProduct[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("opportunity_ledger")
      .select("asin, payload, net_profit, mode, image_url")
      .eq("user_id", userId)
      .order("last_seen_at", { ascending: false })
      .limit(120);
    if (error || !data?.length) return [];
    const out: OpportunityProduct[] = [];
    const seen = new Set<string>();
    for (const row of data) {
      const asin = String(row.asin || "")
        .trim()
        .toUpperCase();
      if (!/^[A-Z0-9]{10}$/.test(asin) || seen.has(asin)) continue;
      const payload = (row.payload || {}) as OpportunityProduct;
      const mode = (row.mode || payload.mode || "amazon_to_ebay") as OpportunityMode;
      const imageUrl = String(
        payload.imageUrl || row.image_url || "",
      ).trim();
      if (!hasHttpsProductImage(imageUrl)) continue;
      const hit: OpportunityProduct = {
        ...payload,
        asin,
        mode,
        imageUrl,
        netProfit:
          payload.netProfit ??
          (row.net_profit != null ? Number(row.net_profit) : null),
      };
      if (!isPlatformWinner(hit, mode)) continue;
      out.push(hit);
      seen.add(asin);
    }
    return out;
  } catch {
    return [];
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    promise
      .then((value) => {
        clearTimeout(t);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(t);
        resolve(fallback);
      });
  });
}

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const [tag, ledgerHits] = await Promise.all([
    withTimeout(resolveUserAssociateTag(auth.supabase, auth.user.id), 4000, null),
    withTimeout(loadLedgerHits(auth.user.id), 8000, [] as OpportunityProduct[]),
  ]);

  // After ghost purge the ledger can be empty — seed Keepa once so Market isn't blank
  let seedNote: string | null = null;
  let hits = ledgerHits;
  if (!hits.length && isSupabaseConfigured()) {
    try {
      const { maybeSeedEmptyFloor } = await import(
        "@/lib/opportunity/seed-floor"
      );
      const seeded = await maybeSeedEmptyFloor(createAdminClient(), {
        userId: auth.user.id,
        supabase: auth.supabase,
        limit: 12,
      });
      if (seeded.seeded) {
        seedNote = `Floor sembrado · ${seeded.saved} Keepa · ${seeded.affiliates} afiliados`;
        hits = await withTimeout(
          loadLedgerHits(auth.user.id),
          8000,
          [] as OpportunityProduct[],
        );
      }
    } catch {
      /* seed optional */
    }
  }

  const merged = mergeMarketFeed({
    ledgerHits: hits,
    associateTag: tag,
    limit: 40,
  });

  return NextResponse.json({
    ok: true,
    affiliateTagConfigured: Boolean(tag),
    associateTagHint: tag ? `${tag.slice(0, 3)}…` : null,
    ledgerCount: merged.ledgerCount,
    curatedCount: 0,
    floorSize: merged.drops.length,
    analyzing: false,
    drops: merged.drops,
    seedNote,
    note:
      seedNote ||
      (merged.ledgerCount > 0
        ? `${merged.ledgerCount} Higlou-verified winner${merged.ledgerCount === 1 ? "" : "s"} (arbitrage + Keepa Amazon)`
        : "Market is empty until Find Winners verifies arbitrage keep or Keepa Amazon demand. No demo products."),
  });
}
