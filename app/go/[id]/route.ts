import { NextResponse } from "next/server";
import { amazonAsinImageCandidates } from "@/lib/amazon/asin-image";
import { isWeakFacebookPictureUrl } from "@/lib/facebook/promo-media";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";
import {
  peekSmartLink,
  resolveAndTrackSmartLink,
} from "@/lib/monetization/smart-links";
import { isMoneyEngineEnabled, getMonetizationFlags } from "@/lib/monetization/flags";
import { logMonetizationEvent } from "@/lib/monetization/observability";
import { isJunkPromoTitle, pickProductTitle } from "@/lib/facebook/promo-title";

export const runtime = "nodejs";

function isLinkPreviewCrawler(ua: string): boolean {
  return /facebookexternalhit|facebot|meta-externalagent|twitterbot|linkedinbot|slackbot|discordbot|whatsapp/i.test(
    ua,
  );
}

function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Never hand Facebook ads-system / 1×1 P-ASIN stubs as og:image. */
function facebookSafeOgImage(
  preferred: string | null | undefined,
  asin: string | null | undefined,
): string {
  const direct = String(preferred || "").trim();
  if (/^https?:\/\//i.test(direct) && !isWeakFacebookPictureUrl(direct)) {
    return direct;
  }
  const id = String(asin || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(id)) return "";
  const strong = amazonAsinImageCandidates(id).find(
    (u) => !isWeakFacebookPictureUrl(u),
  );
  // Prefer nothing over a gray-card stub — child_attachments carry the photo
  return strong || "";
}

/**
 * Public redirect for Smart Links.
 * Humans → 302 to tagged Amazon (official product page).
 * Facebook crawler → OG HTML so the Page post gets a tappable link card.
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

  const ua = request.headers.get("user-agent") || "";
  const source = new URL(request.url).searchParams.get("src");
  const selfUrl = new URL(request.url);
  const publicUrl = `${selfUrl.origin}/go/${slug}`;

  try {
    const admin = createAdminClient();

    // Facebook / messengers need OG tags to build a clickable preview card
    if (isLinkPreviewCrawler(ua)) {
      const peeked = await peekSmartLink(admin, slug);
      if (!peeked.ok) {
        return NextResponse.json(
          { error: peeked.error },
          { status: peeked.status },
        );
      }
      const rawTitle = peeked.title;
      const title = pickProductTitle(
        rawTitle && !isJunkPromoTitle(rawTitle) ? rawTitle : null,
        peeked.asin ? `Deal ${peeked.asin}` : "Deal",
      );
      const image = facebookSafeOgImage(peeked.imageUrl, peeked.asin);
      const desc = "Toca para ver el producto";
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(title)}</title>
<meta property="og:type" content="website"/>
<meta property="og:title" content="${escapeHtml(title)}"/>
<meta property="og:description" content="${escapeHtml(desc)}"/>
<meta property="og:url" content="${escapeHtml(publicUrl)}"/>
${image ? `<meta property="og:image" content="${escapeHtml(image)}"/>` : ""}
${image ? `<meta property="og:image:secure_url" content="${escapeHtml(image)}"/>` : ""}
${image ? `<meta property="og:image:width" content="1200"/>` : ""}
${image ? `<meta property="og:image:height" content="1200"/>` : ""}
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${escapeHtml(title)}"/>
<link rel="canonical" href="${escapeHtml(publicUrl)}"/>
</head>
<body>
<a href="${escapeHtml(peeked.destinationUrl)}">${escapeHtml(title)}</a>
</body>
</html>`;
      return new NextResponse(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=300",
        },
      });
    }

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
