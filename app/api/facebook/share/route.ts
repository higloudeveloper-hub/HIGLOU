import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { shareAffiliateToFacebook } from "@/lib/facebook/share";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const bodySchema = z.object({
  url: z.string().url(),
  message: z.string().max(500).optional(),
  asin: z.string().max(12).optional(),
});

/**
 * Share an affiliate smart link to Facebook (Page post or sharer dialog).
 * Available to every signed-in user — not owner-gated.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase required for Facebook share" },
      { status: 503 },
    );
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Send { url } — absolute affiliate or smart link" },
      { status: 400 },
    );
  }

  const result = await shareAffiliateToFacebook(auth.supabase, {
    userId: auth.user.id,
    url: parsed.url,
    message: parsed.message,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
