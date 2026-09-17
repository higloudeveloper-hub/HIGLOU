import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { createAffiliateLink } from "@/lib/monetization/affiliate/links";
import { getMonetizationFlags, isMoneyEngineEnabled } from "@/lib/monetization/flags";
import { createSmartLink } from "@/lib/monetization/smart-links";
import { buildQrSvg, qrSvgToDataUrl } from "@/lib/monetization/qr";

export const runtime = "nodejs";

const createSchema = z.object({
  asin: z.string().min(10).max(12),
  productId: z.string().uuid().optional().nullable(),
  campaignName: z.string().max(120).optional(),
  campaignId: z.string().uuid().optional().nullable(),
  source: z.string().max(40).optional(),
  createSmartLink: z.boolean().optional().default(true),
  platform: z.string().max(40).optional(),
});

export async function POST(request: Request) {
  if (!isMoneyEngineEnabled() || !getMonetizationFlags().affiliateEngine) {
    return NextResponse.json(
      { error: "Affiliate Engine is disabled" },
      { status: 404 },
    );
  }
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let parsed: z.infer<typeof createSchema>;
  try {
    parsed = createSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid affiliate payload" }, { status: 400 });
  }

  const created = await createAffiliateLink(auth.supabase, {
    userId: auth.user.id,
    asin: parsed.asin,
    productId: parsed.productId,
    campaignName: parsed.campaignName || "Default",
    campaignId: parsed.campaignId,
    source: parsed.source || "manual",
  });
  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: 400 });
  }

  let smart: { path: string; slug: string; id: string } | null = null;
  let qrDataUrl: string | null = null;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

  if (parsed.createSmartLink && getMonetizationFlags().smartLinks) {
    const sl = await createSmartLink(auth.supabase, {
      userId: auth.user.id,
      affiliateLinkId: created.link.id,
      productId: parsed.productId,
      label: parsed.campaignName || created.link.asin || "",
      platform: parsed.platform || parsed.source || "manual",
      destinationUrl: created.link.destination_url,
    });
    if (sl.ok) {
      smart = { path: sl.path, slug: sl.slug, id: sl.id };
      const absolute = appUrl ? `${appUrl}${sl.path}` : sl.path;
      const qr = buildQrSvg(absolute);
      if (qr.ok) qrDataUrl = qrSvgToDataUrl(qr.svg);
    }
  }

  return NextResponse.json({
    ok: true,
    link: {
      id: created.link.id,
      trackingId: created.link.tracking_id,
      destinationUrl: created.link.destination_url,
      asin: created.link.asin,
      source: created.link.source,
      providerId: created.link.provider_id,
    },
    smartLink: smart,
    qrDataUrl,
    warnings: [
      "Commission is Unknown until verified in Amazon Associates reports",
      "Do not use self-purchase to generate commissions",
    ],
  });
}

export async function GET() {
  if (!isMoneyEngineEnabled() || !getMonetizationFlags().affiliateEngine) {
    return NextResponse.json({ error: "Affiliate Engine is disabled" }, { status: 404 });
  }
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("affiliate_links")
    .select(
      "id, tracking_id, asin, destination_url, source, click_count, created_at, product_id, provider_id",
    )
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({
      links: [],
      note: "Affiliate tables may be missing — apply 20260916_monetization.sql",
    });
  }
  return NextResponse.json({ links: data || [] });
}
