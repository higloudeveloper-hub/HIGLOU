import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import {
  ebayOAuthMissingReason,
  isEbayOAuthConfigured,
} from "@/lib/ebay/config";
import { buildEbayAuthorizeUrl } from "@/lib/ebay/oauth";

const OAUTH_NEXT_COOKIE = "higlou_oauth_next";

function safeOAuthNext(value: string | null) {
  return value === "/home" ? "/home" : null;
}

/** Start eBay OAuth — redirects the browser to eBay consent. */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  if (!isEbayOAuthConfigured()) {
    return NextResponse.json(
      { error: ebayOAuthMissingReason() },
      { status: 503 },
    );
  }

  try {
    const { url } = buildEbayAuthorizeUrl(auth.user.id);
    const res = NextResponse.redirect(url);
    const next = safeOAuthNext(new URL(request.url).searchParams.get("next"));
    if (next) {
      res.cookies.set(OAUTH_NEXT_COOKIE, next, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 600,
        path: "/",
      });
    } else {
      res.cookies.delete(OAUTH_NEXT_COOKIE);
    }
    return res;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to start eBay OAuth",
      },
      { status: 500 },
    );
  }
}
