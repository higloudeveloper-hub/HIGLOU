import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { spendCredits } from "@/lib/credits/wallet";
import { publishFacebookPromo } from "@/lib/facebook/promo";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 90;

const cardSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  imageUrl: z.string().url(),
  linkUrl: z.string().url(),
  priceLabel: z.string().max(40).optional().nullable(),
  asin: z.string().max(12).optional().nullable(),
  imageFallbacks: z.array(z.string().url()).max(8).optional().nullable(),
});

const bodySchema = z
  .object({
    format: z.enum(["ads", "carousel", "vitrina"]),
    message: z.string().max(2000).optional().default(""),
    cards: z.array(cardSchema).min(1).max(10),
    coverImageUrl: z.string().url().optional().nullable(),
    collectionTitle: z.string().max(120).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.format === "carousel" && data.cards.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Carrusel: elegí 2 a 10 productos.",
        path: ["cards"],
      });
    }
    if (data.format === "vitrina" && data.cards.length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vitrina: elegí al menos 3 productos.",
        path: ["cards"],
      });
    }
  });

/** Publish Ads / Carrusel / Vitrina to the user's Facebook Page. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase required" }, { status: 503 });
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch (err) {
    const msg =
      err && typeof err === "object" && "issues" in err
        ? String(
            (err as { issues?: Array<{ message?: string }> }).issues?.[0]
              ?.message || "",
          )
        : "";
    return NextResponse.json(
      { error: msg || "Send { format, cards }" },
      { status: 400 },
    );
  }

  const spent = await spendCredits({
    userId: auth.user.id,
    action: "facebook_share",
    reason: `Facebook ${parsed.format}`,
    meta: { format: parsed.format, count: parsed.cards.length },
  });
  if (!spent.ok && spent.code === "insufficient") {
    return NextResponse.json(
      {
        error: spent.error,
        code: "insufficient",
        balance: spent.balance,
        needed: spent.needed,
        rechargeHref: "/credits",
      },
      { status: 402 },
    );
  }

  const result = await publishFacebookPromo(auth.supabase, {
    userId: auth.user.id,
    format: parsed.format,
    message: parsed.message,
    cards: parsed.cards,
    coverImageUrl: parsed.coverImageUrl,
    collectionTitle: parsed.collectionTitle,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
