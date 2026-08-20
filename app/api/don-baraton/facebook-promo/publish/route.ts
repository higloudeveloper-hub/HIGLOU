import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/owner";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { publishDonBaratonPromoCarousel } from "@/lib/don-baraton/facebook-promo";
import { getDonBaratonConfig } from "@/lib/don-baraton/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  productIds: z.array(z.string().min(1)).min(2).max(10),
  message: z.string().optional(),
});

export async function POST(request: Request) {
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

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Pick 2 to 10 Don Baratón products." },
      { status: 400 },
    );
  }

  const result = await publishDonBaratonPromoCarousel(body);
  if (result.status === "ok") {
    return NextResponse.json({
      ok: true,
      postId: result.postId,
      postUrl: result.postUrl,
      cardCount: result.cardCount,
      visibilityNote: result.visibilityNote,
    });
  }

  return NextResponse.json(
    {
      ok: false,
      error: result.status === "error" ? result.message : result.reason,
    },
    { status: result.status === "error" ? 502 : 503 },
  );
}
