import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getEbayConnectionPublic } from "@/lib/ebay/oauth";

/** Public connection status for Settings / Export UI. */
export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const connection = await getEbayConnectionPublic(
      auth.supabase,
      auth.user.id,
    );
    return NextResponse.json({ connection });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load eBay connection",
      },
      { status: 500 },
    );
  }
}
