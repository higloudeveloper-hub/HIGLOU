import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import {
  exchangeAmazonAuthorizationCode,
  parseAmazonOAuthState,
  upsertAmazonConnection,
} from "@/lib/amazon/sp-oauth";

function appOrigin(request: Request) {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    new URL(request.url).origin
  );
}

function redirectSettings(origin: string, query: Record<string, string>) {
  const params = new URLSearchParams(query);
  return NextResponse.redirect(
    `${origin}/settings?${params.toString()}#amazon-store`,
  );
}

export async function GET(request: NextRequest) {
  const origin = appOrigin(request);
  const auth = await requireUser();
  if (!auth.ok) {
    return NextResponse.redirect(
      `${origin}/login?redirect=${encodeURIComponent("/settings#amazon-store")}`,
    );
  }

  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const errorDesc = url.searchParams.get("error_description");
  if (error) {
    return redirectSettings(origin, {
      amazon_error: errorDesc || error,
    });
  }

  const code = url.searchParams.get("spapi_oauth_code");
  const state = url.searchParams.get("state");
  const sellingPartnerId = url.searchParams.get("selling_partner_id") || "";
  if (!code || !state) {
    return redirectSettings(origin, {
      amazon_error: "Missing Amazon authorization code",
    });
  }

  const parsed = parseAmazonOAuthState(state);
  if (!parsed || parsed.userId !== auth.user.id) {
    return redirectSettings(origin, {
      amazon_error: "Invalid or expired Amazon OAuth state",
    });
  }
  if (!sellingPartnerId) {
    return redirectSettings(origin, {
      amazon_error: "Amazon did not return a seller id",
    });
  }

  try {
    const tokens = await exchangeAmazonAuthorizationCode(code, origin);
    await upsertAmazonConnection(
      auth.supabase,
      auth.user.id,
      tokens,
      sellingPartnerId,
    );
    return redirectSettings(origin, { amazon_connected: "1" });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Amazon OAuth exchange failed";
    return redirectSettings(origin, { amazon_error: message });
  }
}
