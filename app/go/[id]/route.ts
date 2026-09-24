import { NextResponse } from "next/server";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";
import { resolveAndTrackSmartLink } from "@/lib/monetization/smart-links";
import { isMoneyEngineEnabled, getMonetizationFlags } from "@/lib/monetization/flags";
import { logMonetizationEvent } from "@/lib/monetization/observability";
import {
  amazonProductLandingHtml,
  buildAmazonAppDeepLinks,
  isAmazonAppCrawler,
} from "@/lib/amazon/app-deep-link";
import { amazonAsinPrimaryImage } from "@/lib/amazon/asin-image";
import { isAmazonProductUrl } from "@/lib/monetization/affiliate/tagged-url";

export const runtime = "nodejs";

async function resolveProductVisual(
  admin: ReturnType<typeof createAdminClient>,
  opts: {
    userId: string;
    productId: string | null;
    asin: string | null;
    title: string | null;
  },
): Promise<{ title: string | null; imageUrl: string | null; priceLabel: string | null }> {
  let title = opts.title;
  let imageUrl: string | null = null;
  let priceLabel: string | null = null;

  if (opts.productId) {
    const { data: product } = await admin
      .from("products")
      .select("title")
      .eq("id", opts.productId)
      .eq("user_id", opts.userId)
      .maybeSingle();
    if (product) {
      title = title || String(product.title || "").trim() || null;
    }
    const { data: images } = await admin
      .from("product_images")
      .select("public_url, is_primary, sort_order")
      .eq("product_id", opts.productId)
      .eq("user_id", opts.userId)
      .order("sort_order", { ascending: true })
      .limit(8);
    const sorted = [...(images || [])].sort((a, b) => {
      const pa = a.is_primary ? 0 : 1;
      const pb = b.is_primary ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
    });
    const first = String(sorted[0]?.public_url || "").trim();
    if (first && /^https?:\/\//i.test(first)) imageUrl = first;
  }

  if (opts.asin) {
    const { data: ledger } = await admin
      .from("opportunity_ledger")
      .select("title, image_url, amazon_price, payload")
      .eq("user_id", opts.userId)
      .eq("asin", opts.asin)
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ledger) {
      title = title || String(ledger.title || "").trim() || null;
      const fromLedger = String(ledger.image_url || "").trim();
      if (fromLedger && /^https?:\/\//i.test(fromLedger)) imageUrl = imageUrl || fromLedger;
      const payload = (ledger.payload || {}) as {
        imageUrl?: string;
        buyBoxPrice?: number | null;
        amazonPrice?: number | null;
      };
      if (!imageUrl && payload.imageUrl) imageUrl = String(payload.imageUrl);
      const price =
        Number(ledger.amazon_price) ||
        Number(payload.buyBoxPrice) ||
        Number(payload.amazonPrice) ||
        0;
      if (price > 0) {
        priceLabel = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(price);
      }
    }
    if (!imageUrl) imageUrl = amazonAsinPrimaryImage(opts.asin) || null;
  }

  return { title, imageUrl, priceLabel };
}

/**
 * Public smart-link hop.
 * Amazon (humans): product page first → Comprar/Carrito opens Amazon app.
 * Crawlers / non-Amazon / ?web=1: plain 302 to tagged destination.
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

    // Humans tapping Amazon from Facebook: show product, then app on CTA
    if (
      !forceWeb &&
      !isAmazonAppCrawler(ua) &&
      isAmazonProductUrl(destination)
    ) {
      const links = buildAmazonAppDeepLinks(destination);
      if (links) {
        const visual = await resolveProductVisual(admin, {
          userId: resolved.userId,
          productId: resolved.productId,
          asin: resolved.asin || links.asin,
          title: resolved.title,
        });
        return new NextResponse(
          amazonProductLandingHtml({
            links,
            title: visual.title,
            imageUrl: visual.imageUrl,
            priceLabel: visual.priceLabel,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "private, no-store",
              "Referrer-Policy": "no-referrer-when-downgrade",
            },
          },
        );
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
