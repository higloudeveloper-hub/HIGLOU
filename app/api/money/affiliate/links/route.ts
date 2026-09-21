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

  const links = data || [];
  const ids = links.map((l) => l.id).filter(Boolean);
  const productIds = [
    ...new Set(
      links
        .map((l) => String((l as { product_id?: string | null }).product_id || "").trim())
        .filter(Boolean),
    ),
  ];
  const asins = [
    ...new Set(
      links
        .map((l) => String(l.asin || "").trim().toUpperCase())
        .filter((a) => /^[A-Z0-9]{10}$/.test(a)),
    ),
  ];

  const smartByAff = new Map<string, string>();
  const imageByProduct = new Map<string, string>();
  const imageByAsin = new Map<string, string>();

  if (ids.length) {
    const { data: smartRows } = await auth.supabase
      .from("smart_links")
      .select("affiliate_link_id, slug")
      .eq("user_id", auth.user.id)
      .in("affiliate_link_id", ids);
    for (const row of smartRows || []) {
      const affId = String(
        (row as { affiliate_link_id?: string }).affiliate_link_id || "",
      );
      const slug = String((row as { slug?: string }).slug || "").trim();
      if (affId && slug && !smartByAff.has(affId)) {
        smartByAff.set(affId, `/go/${slug}`);
      }
    }
  }

  if (productIds.length) {
    const { data: images } = await auth.supabase
      .from("product_images")
      .select("product_id, public_url, is_primary, sort_order")
      .in("product_id", productIds)
      .order("sort_order", { ascending: true });
    const sorted = [...(images || [])].sort((a, b) => {
      const primaryA = a.is_primary ? 0 : 1;
      const primaryB = b.is_primary ? 0 : 1;
      if (primaryA !== primaryB) return primaryA - primaryB;
      return Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
    });
    for (const img of sorted) {
      const pid = String(img.product_id || "");
      const url = String(img.public_url || "").replace(/[\r\n\t]+/g, "").trim();
      if (pid && url && !imageByProduct.has(pid)) imageByProduct.set(pid, url);
    }
  }

  if (asins.length) {
    const { data: ledger } = await auth.supabase
      .from("opportunity_ledger")
      .select("asin, payload")
      .eq("user_id", auth.user.id)
      .in("asin", asins)
      .limit(80);
    for (const row of ledger || []) {
      const asin = String(row.asin || "").trim().toUpperCase();
      const payload = (row.payload || {}) as { imageUrl?: string };
      const photo = String(payload.imageUrl || "").trim();
      if (asin && /^https?:\/\//i.test(photo) && !imageByAsin.has(asin)) {
        imageByAsin.set(asin, photo);
      }
    }
  }

  return NextResponse.json({
    links: links.map((link) => {
      const productId = String(
        (link as { product_id?: string | null }).product_id || "",
      ).trim();
      const asin = String(link.asin || "").trim().toUpperCase();
      const imageUrl =
        (productId && imageByProduct.get(productId)) ||
        imageByAsin.get(asin) ||
        null;
      return {
        ...link,
        smartPath: smartByAff.get(link.id) || null,
        imageUrl,
      };
    }),
  });
}
