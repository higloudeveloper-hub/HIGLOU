import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { saveAmazonSelfAuthorizeToken } from "@/lib/amazon/sp-oauth";

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let parsed: { refreshToken: string; sellingPartnerId?: string };
  try {
    parsed = z
      .object({
        refreshToken: z.string().min(20).max(4000),
        sellingPartnerId: z.string().max(64).optional(),
      })
      .parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Paste the Amazon refresh token from Authorize application." },
      { status: 400 },
    );
  }

  try {
    await saveAmazonSelfAuthorizeToken(
      auth.supabase,
      auth.user.id,
      parsed.refreshToken,
      parsed.sellingPartnerId,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save Amazon refresh token",
      },
      { status: 422 },
    );
  }
}
