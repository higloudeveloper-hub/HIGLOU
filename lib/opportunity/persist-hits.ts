import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpportunityProduct } from "@/lib/opportunity/types";
import { hasHttpsProductImage } from "@/lib/admin/purge-listings-winners";

/**
 * Persist Find Winners / Keepa hits to opportunity_ledger (server-side).
 * Market + Facebook affiliates read from here — never rely on browser-only save.
 */
export async function persistOpportunityHits(
  admin: SupabaseClient,
  opts: {
    userId: string;
    hits: OpportunityProduct[];
    mode?: OpportunityProduct["mode"];
    limit?: number;
  },
): Promise<{ saved: number }> {
  const limit = Math.min(Math.max(opts.limit || 40, 1), 80);
  const { amazonAsinPrimaryImage } = await import("@/lib/amazon/asin-image");
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const rows: Array<Record<string, unknown>> = [];

  for (const hit of opts.hits) {
    if (rows.length >= limit) break;
    const asin = String(hit.asin || "")
      .trim()
      .toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin) || seen.has(asin)) continue;
    seen.add(asin);
    const imageUrl =
      String(hit.imageUrl || "").trim() || amazonAsinPrimaryImage(asin);
    if (!hasHttpsProductImage(imageUrl)) continue;
    const mode = hit.mode || opts.mode || "amazon";
    rows.push({
      user_id: opts.userId,
      mode,
      asin,
      query: "",
      title: hit.title || "",
      brand: hit.brand || "",
      image_url: imageUrl,
      amazon_price: hit.amazonPrice ?? hit.buyBoxPrice ?? null,
      ebay_price: hit.ebayActiveMedian ?? hit.ebayPrice ?? null,
      net_profit: hit.netProfit ?? null,
      roi: hit.roi ?? null,
      score: hit.score ?? null,
      ebay_count: hit.ebayActiveCount ?? null,
      payload: { ...hit, asin, imageUrl, mode, keepa: hit.keepa ?? true },
      last_seen_at: now,
    });
  }

  if (!rows.length) return { saved: 0 };
  const { error } = await admin.from("opportunity_ledger").upsert(rows, {
    onConflict: "user_id,mode,asin",
  });
  if (error) return { saved: 0 };
  return { saved: rows.length };
}
