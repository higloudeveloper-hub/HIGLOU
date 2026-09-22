import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { publishDonBaratonPromoCarousel } from "@/lib/don-baraton/facebook-promo";
import { getDonBaratonConfig } from "@/lib/don-baraton/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z
  .object({
    productIds: z.array(z.string().min(1)).min(2).max(10),
    message: z.string().optional(),
    format: z.enum(["carousel", "collection"]).optional(),
    coverProductId: z.string().optional(),
    coverImageUrl: z.string().optional(),
    coverImageBase64: z.string().optional(),
    collectionTitle: z.string().optional(),
    linkDestination: z.enum(["shop", "ebay"]).optional(),
    productLinks: z.record(z.string(), z.string()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.format === "collection" && data.productIds.length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La vitrina necesita al menos 3 productos.",
        path: ["productIds"],
      });
    }
  });

/** Unlocked for every signed-in Higlou account (was owner-only). */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Authentication required" }, { status: 503 });
  }
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const config = getDonBaratonConfig();
  if (!config.enabled) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Don Baratón está desconectado de Higlou. Publicá afiliados desde /facebook.",
        killed: true,
      },
      { status: 410 },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Elegí 2 a 10 productos (3 si es vitrina)." },
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
