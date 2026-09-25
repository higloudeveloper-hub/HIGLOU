import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { hasHttpsProductImage } from "@/lib/admin/purge-listings-winners";
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
    withTimeout(loadLedgerHits(auth.user.id), 5000, [] as OpportunityProduct[]),
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
