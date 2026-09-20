import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { mergeMarketFeed } from "@/lib/market/from-opportunity";
import { resolveUserAssociateTag } from "@/lib/monetization/affiliate/links";
import { isPlatformWinner } from "@/lib/opportunity/platform-winner";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { OpportunityMode, OpportunityProduct } from "@/lib/opportunity/types";

export const runtime = "nodejs";

async function loadLedgerHits(userId: string): Promise<OpportunityProduct[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("opportunity_ledger")
      .select("asin, payload, net_profit, mode")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
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
      const hit: OpportunityProduct = {
        ...payload,
        asin,
        mode,
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

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const [tag, ledgerHits] = await Promise.all([
    resolveUserAssociateTag(auth.supabase, auth.user.id),
    loadLedgerHits(auth.user.id),
  ]);

  const merged = mergeMarketFeed({
    ledgerHits,
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
    note:
      merged.ledgerCount > 0
        ? `${merged.ledgerCount} Higlou-verified winner${merged.ledgerCount === 1 ? "" : "s"} (arbitrage + Keepa Amazon)`
        : "Market is empty until Find Winners verifies arbitrage keep or Keepa Amazon demand. No demo products.",
  });
}
