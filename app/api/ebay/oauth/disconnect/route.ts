import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { revokeEbayConnection } from "@/lib/ebay/oauth";

/** Disconnect eBay store for the current user (keeps row, clears tokens). */
export async function POST() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    await revokeEbayConnection(auth.supabase, auth.user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to disconnect eBay",
      },
      { status: 500 },
    );
  }
}
