import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { resolveUserAssociateTag } from "@/lib/monetization/affiliate/links";
import { tryRonVariationPack } from "@/lib/ron/variation-pack";
import { RON_DEFAULT_LEARNING } from "@/lib/ron/types";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  asin: z.string().min(10).max(12),
  title: z.string().max(200).optional(),
  brand: z.string().max(120).optional(),
  imageUrl: z.string().url().optional(),
  linkUrl: z.string().url().optional(),
  priceLabel: z.string().max(40).optional(),
});

/**
 * Expand one Amazon ASIN into a Keepa variation carousel/vitrina pack.
 * Used by Facebook Ads studio + RON for consistent Color/Size families.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase required" }, { status: 503 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: 'Send { asin: "B0…" }' },
      { status: 400 },
    );
  }

  const asin = body.asin.trim().toUpperCase();
  const tag = await resolveUserAssociateTag(auth.supabase, auth.user.id);
  if (!tag) {
    return NextResponse.json(
      { error: "Falta Associate tag en Settings → Money" },
      { status: 400 },
    );
  }

  const seedCard = {
    id: `seed:${asin}`,
    title: body.title || `Deal ${asin}`,
    brand: body.brand || null,
    asin,
    imageUrl:
      body.imageUrl ||
      `https://m.media-amazon.com/images/I/01RmK+J4pJL._AC_SL1500_.jpg`,
    linkUrl: body.linkUrl || `https://www.amazon.com/dp/${asin}`,
    priceLabel: body.priceLabel || null,
    meta: body.brand || asin,
    imageFallbacks: [] as string[],
    discountPercent: null as number | null,
    sourcePlatform: "Amazon",
  };

  const pack = await tryRonVariationPack({
    supabase: auth.supabase,
    userId: auth.user.id,
    seedCards: [seedCard],
    learning: RON_DEFAULT_LEARNING,
    associateTag: tag,
    seed: Date.now(),
  });

  if (!pack || pack.action !== "publish") {
    return NextResponse.json({
      ok: false,
      error:
        "Keepa no trajo variaciones (Color/Size) para este ASIN. Probá otro ganador.",
      cards: [],
    });
  }

  return NextResponse.json({
    ok: true,
    format: pack.format,
    reason: pack.reason,
    niche: pack.niche,
    message: pack.message,
    collectionTitle: pack.collectionTitle,
    cards: pack.cards.map((c) => ({
      id: c.id,
      title: c.title,
      brand: c.brand,
      asin: c.asin,
      imageUrl: c.imageUrl,
      linkUrl: c.linkUrl,
      priceLabel: c.priceLabel,
      meta: c.meta,
      imageFallbacks: c.imageFallbacks,
      discountPercent: c.discountPercent,
      sourcePlatform: c.sourcePlatform,
    })),
  });
}
