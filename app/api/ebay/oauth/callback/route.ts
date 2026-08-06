import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import {
  exchangeAuthorizationCode,
  fetchEbayUserIdentity,
  parseOAuthState,
  upsertEbayConnection,
} from "@/lib/ebay/oauth";

function appOrigin(request: Request) {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    new URL(request.url).origin
  );
}

/** eBay OAuth callback — exchange code, store encrypted tokens, redirect to Settings. */
export async function GET(request: Request) {
  const auth = await requireUser();
  const origin = appOrigin(request);
  const settingsUrl = `${origin}/settings#ebay-store`;

  if (!auth.ok) {
    return NextResponse.redirect(
      `${origin}/login?redirect=${encodeURIComponent("/settings#ebay-store")}`,
    );
  }

  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const errorDesc = url.searchParams.get("error_description");
  if (error) {
    return NextResponse.redirect(
      `${settingsUrl}?ebay_error=${encodeURIComponent(errorDesc || error)}`,
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.redirect(
      `${settingsUrl}?ebay_error=${encodeURIComponent("Missing OAuth code or state")}`,
    );
  }

  const parsed = parseOAuthState(state);
  if (!parsed || parsed.userId !== auth.user.id) {
    return NextResponse.redirect(
      `${settingsUrl}?ebay_error=${encodeURIComponent("Invalid or expired OAuth state")}`,
    );
  }

  try {
    const tokens = await exchangeAuthorizationCode(code);
    const identity = await fetchEbayUserIdentity(tokens.access_token);
    await upsertEbayConnection(auth.supabase, auth.user.id, tokens, identity);
    return NextResponse.redirect(
      `${settingsUrl}?ebay_connected=1`,
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "eBay OAuth exchange failed";
    return NextResponse.redirect(
      `${settingsUrl}?ebay_error=${encodeURIComponent(message)}`,
    );
  }
}
