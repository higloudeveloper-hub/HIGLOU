import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import {
  exchangeAuthorizationCode,
  fetchEbayUserIdentity,
  parseOAuthState,
  upsertEbayConnection,
} from "@/lib/ebay/oauth";

const OAUTH_NEXT_COOKIE = "higlou_oauth_next";

function appOrigin(request: Request) {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    new URL(request.url).origin
  );
}

function redirectAfterEbay(
  request: NextRequest,
  origin: string,
  query: Record<string, string>,
) {
  const next = request.cookies.get(OAUTH_NEXT_COOKIE)?.value;
  const params = new URLSearchParams(query);
  const dest =
    next === "/home"
      ? `${origin}/home?${params.toString()}`
      : `${origin}/settings#ebay-store?${params.toString()}`;
  const res = NextResponse.redirect(dest);
  res.cookies.delete(OAUTH_NEXT_COOKIE);
  return res;
}

/** eBay OAuth callback — exchange code, store encrypted tokens, return to Home or Settings. */
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  const origin = appOrigin(request);

  if (!auth.ok) {
    return NextResponse.redirect(
      `${origin}/login?redirect=${encodeURIComponent("/home")}`,
    );
  }

  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const errorDesc = url.searchParams.get("error_description");
  if (error) {
    return redirectAfterEbay(request, origin, {
      ebay_error: errorDesc || error,
    });
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return redirectAfterEbay(request, origin, {
      ebay_error: "Missing OAuth code or state",
    });
  }

  const parsed = parseOAuthState(state);
  if (!parsed || parsed.userId !== auth.user.id) {
    return redirectAfterEbay(request, origin, {
      ebay_error: "Invalid or expired OAuth state",
    });
  }

  try {
    const tokens = await exchangeAuthorizationCode(code);
    const identity = await fetchEbayUserIdentity(tokens.access_token);
    await upsertEbayConnection(auth.supabase, auth.user.id, tokens, identity);
    return redirectAfterEbay(request, origin, { ebay_connected: "1" });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "eBay OAuth exchange failed";
    return redirectAfterEbay(request, origin, { ebay_error: message });
  }
}
