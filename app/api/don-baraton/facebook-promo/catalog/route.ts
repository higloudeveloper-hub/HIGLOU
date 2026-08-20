import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/owner";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { fetchDonBaratonPromoCatalog } from "@/lib/don-baraton/facebook-promo";
import { getDonBaratonConfig } from "@/lib/don-baraton/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Authentication required" }, { status: 503 });
  }
  const auth = await requireOwner();
  if (!auth.ok) return auth.response;

  const config = getDonBaratonConfig();
  if (!config.enabled) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Don Baratón sync is not configured. Set DON_BARATON_API_URL and DON_BARATON_IMPORT_TOKEN.",
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const skus = (url.searchParams.get("skus") ?? "")
    .split(",")
    .map((sku) => sku.trim())
    .filter(Boolean);

  const result = await fetchDonBaratonPromoCatalog({ query, skus });
  if (result.status === "ok") {
    return NextResponse.json({ ok: true, products: result.products });
  }

  return NextResponse.json(
    {
      ok: false,
      error: result.status === "error" ? result.message : result.reason,
    },
    { status: result.status === "error" ? 502 : 503 },
  );
}
