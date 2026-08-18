import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import {
  amazonSpMissingReason,
  isAmazonSpConfigured,
} from "@/lib/amazon/sp-config";
import { buildAmazonAuthorizeUrl } from "@/lib/amazon/sp-oauth";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  if (!isAmazonSpConfigured()) {
    return NextResponse.json(
      { error: amazonSpMissingReason() },
      { status: 503 },
    );
  }

  try {
    const { url } = buildAmazonAuthorizeUrl(auth.user.id);
    const res = NextResponse.redirect(url);
    res.headers.set("Referrer-Policy", "no-referrer");
    return res;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to start Amazon OAuth",
      },
      { status: 500 },
    );
  }
}
