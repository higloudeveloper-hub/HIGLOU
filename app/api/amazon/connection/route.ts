import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getAmazonConnectionPublic } from "@/lib/amazon/sp-oauth";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const connection = await getAmazonConnectionPublic(
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
            : "Failed to load Amazon connection",
      },
      { status: 500 },
    );
  }
}
