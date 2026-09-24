import { NextResponse } from "next/server";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";
import { resolveAndTrackSmartLink } from "@/lib/monetization/smart-links";
import { isMoneyEngineEnabled, getMonetizationFlags } from "@/lib/monetization/flags";
import { logMonetizationEvent } from "@/lib/monetization/observability";

export const runtime = "nodejs";

/**
 * Public redirect for Smart Links.
 * Facebook tap → official Amazon product page (tagged Associates URL).
 * No intermediate Higlou landing, no auto app deep-link.
 * Amazon’s own site / app handles “open in app” after the shopper is there.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const slug = String(id || "").trim().toLowerCase();
  if (!slug) {
    return NextResponse.json({ error: "Missing link id" }, { status: 400 });
  }

  if (!isMoneyEngineEnabled() || !getMonetizationFlags().smartLinks) {
    return NextResponse.json({ error: "Smart Links disabled" }, { status: 404 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Storage unavailable" }, { status: 503 });
  }

  const source = new URL(request.url).searchParams.get("src");

  try {
    const admin = createAdminClient();
    const resolved = await resolveAndTrackSmartLink(admin, slug, {
      source,
    });
    if (!resolved.ok) {
      return NextResponse.json(
        { error: resolved.error },
        { status: resolved.status },
      );
    }
    return NextResponse.redirect(resolved.destinationUrl, 302);
  } catch (error) {
    logMonetizationEvent({
      level: "error",
      event: "smart_link_redirect_failed",
      detail: {
        slug,
        message: error instanceof Error ? error.message : "unknown",
      },
    });
    return NextResponse.json({ error: "Redirect failed" }, { status: 500 });
  }
}
