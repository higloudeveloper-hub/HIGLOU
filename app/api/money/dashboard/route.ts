import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getMonetizationFlags, isMoneyEngineEnabled } from "@/lib/monetization/flags";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Aggregated Money Center metrics — only real rows.
 * Missing sources → null / Not Available (never fake revenue).
 */
export async function GET() {
  if (!isMoneyEngineEnabled()) {
    return NextResponse.json({ enabled: false }, { status: 404 });
  }
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const flags = getMonetizationFlags();

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      enabled: true,
      flags,
      revenue: {
        amazonSales: null,
        ebaySales: null,
        affiliateRevenue: null,
        availability: "not_available" as const,
      },
      profit: {
        estimatedGross: null,
        estimatedNet: null,
        availability: "insufficient" as const,
      },
      performance: {
        clicks: 0,
        uniqueClicks: null,
        conversions: null,
        conversionRate: null,
        revenuePerClick: null,
      },
      inventory: {
        activeProducts: null,
        lowStock: null,
        potentialWinners: null,
      },
      opportunities: { SELL: 0, AFFILIATE: 0, BOTH: 0, WATCH: 0, SKIP: 0 },
      demo: false,
    });
  }

  const userId = auth.user.id;

  const [
    productsRes,
    linksRes,
    clicksRes,
    conversionsRes,
    oppRes,
    winnersRes,
  ] = await Promise.all([
    auth.supabase
      .from("products")
      .select("id, quantity, status, ebay_sold_qty, price", { count: "exact" })
      .eq("user_id", userId),
    auth.supabase
      .from("affiliate_links")
      .select("id, click_count")
      .eq("user_id", userId),
    auth.supabase
      .from("affiliate_clicks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    auth.supabase
      .from("affiliate_conversions")
      .select("id, revenue, attributed")
      .eq("user_id", userId),
    auth.supabase
      .from("monetization_opportunities")
      .select("recommendation")
      .eq("user_id", userId)
      .limit(200),
    auth.supabase
      .from("opportunity_ledger")
      .select("asin", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);

  const products = productsRes.data || [];
  const activeProducts = products.length;
  const lowStock = products.filter((p) => (p.quantity ?? 0) > 0 && (p.quantity ?? 0) <= 2)
    .length;

  let ebaySales: number | null = null;
  const soldLines = products.filter((p) => (p.ebay_sold_qty ?? 0) > 0);
  if (soldLines.length) {
    ebaySales = soldLines.reduce((sum, p) => {
      const qty = Number(p.ebay_sold_qty) || 0;
      const price = p.price != null ? Number(p.price) : 0;
      return sum + qty * price;
    }, 0);
    ebaySales = Math.round(ebaySales * 100) / 100;
  }

  const clicksFromLinks = (linksRes.data || []).reduce(
    (sum, row) => sum + (Number(row.click_count) || 0),
    0,
  );
  const clicks =
    typeof clicksRes.count === "number" ? clicksRes.count : clicksFromLinks;

  const attributed = (conversionsRes.data || []).filter((c) => c.attributed);
  const affiliateRevenue = attributed.length
    ? attributed.reduce((sum, c) => sum + (c.revenue != null ? Number(c.revenue) : 0), 0)
    : null;

  const opportunities = { SELL: 0, AFFILIATE: 0, BOTH: 0, WATCH: 0, SKIP: 0 };
  for (const row of oppRes.data || []) {
    const key = String(row.recommendation || "").toUpperCase();
    if (key in opportunities) {
      opportunities[key as keyof typeof opportunities] += 1;
    }
  }

  return NextResponse.json({
    enabled: true,
    flags,
    revenue: {
      amazonSales: null as number | null,
      ebaySales,
      affiliateRevenue,
      availability:
        ebaySales != null || affiliateRevenue != null
          ? ("partial" as const)
          : ("not_available" as const),
      notes: [
        "Amazon sales: Not Available until SP-API order sync is wired",
        "Affiliate revenue: only attributed rows from provider reports (never invented)",
      ],
    },
    profit: {
      estimatedGross: null as number | null,
      estimatedNet: null as number | null,
      availability: "insufficient" as const,
      note: "Insufficient Data — product cost not stored on listings yet",
    },
    performance: {
      clicks,
      uniqueClicks: null as number | null,
      conversions: attributed.length ? attributed.length : null,
      conversionRate: null as number | null,
      revenuePerClick:
        affiliateRevenue != null && clicks > 0
          ? Math.round((affiliateRevenue / clicks) * 10000) / 10000
          : null,
      notes: [
        "Unique clicks / conversion rate require provider attribution — Not Available until verified",
      ],
    },
    inventory: {
      activeProducts,
      lowStock,
      potentialWinners: winnersRes.count ?? null,
    },
    opportunities,
    demo: false,
  });
}
