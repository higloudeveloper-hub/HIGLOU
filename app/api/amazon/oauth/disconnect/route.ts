import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { revokeAmazonConnection } from "@/lib/amazon/sp-oauth";

export async function POST() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    await revokeAmazonConnection(auth.supabase, auth.user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to disconnect Amazon",
      },
      { status: 500 },
    );
  }
}
