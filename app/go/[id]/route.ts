import { NextResponse } from "next/server";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";
import { resolveAndTrackSmartLink } from "@/lib/monetization/smart-links";
import { isMoneyEngineEnabled, getMonetizationFlags } from "@/lib/monetization/flags";
import { logMonetizationEvent } from "@/lib/monetization/observability";
import {
  amazonAppBridgeHtml,
  buildAmazonAppDeepLinks,
  isAmazonAppCrawler,
  isMobileClient,
} from "@/lib/amazon/app-deep-link";
import { isAmazonProductUrl } from "@/lib/monetization/affiliate/tagged-url";

export const runtime = "nodejs";

/**
 * Public redirect for Smart Links.
 * On mobile Amazon destinations → open the Amazon app (deep link bridge).
 * Crawlers / desktop → normal 302 to tagged https.
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

  const url = new URL(request.url);
  const source = url.searchParams.get("src");
  const forceWeb = url.searchParams.get("web") === "1";
  const ua = request.headers.get("user-agent");

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

    const destination = resolved.destinationUrl;

    // Prefer Amazon Shopping app for mobile shoppers (Facebook taps)
    if (
      !forceWeb &&
      !isAmazonAppCrawler(ua) &&
      isMobileClient(ua) &&
      isAmazonProductUrl(destination)
    ) {
      const links = buildAmazonAppDeepLinks(destination);
      if (links) {
        return new NextResponse(amazonAppBridgeHtml(links), {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "private, no-store",
            "Referrer-Policy": "no-referrer-when-downgrade",
          },
        });
      }
    }

    return NextResponse.redirect(destination, 302);
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
