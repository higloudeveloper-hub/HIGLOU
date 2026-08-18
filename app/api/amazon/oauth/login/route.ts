import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { amazonCallbackUrl, getAmazonSpConfig } from "@/lib/amazon/sp-config";
import { buildAmazonAuthorizeUrl } from "@/lib/amazon/sp-oauth";

function appOrigin(request: Request) {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    new URL(request.url).origin
  );
}

/**
 * Amazon hits this Login URI first with amazon_callback_uri + amazon_state.
 * Bounce the signed-in Higlou user back to Amazon to finish consent.
 */
export async function GET(request: NextRequest) {
  const origin = appOrigin(request);
  const url = new URL(request.url);
  const amazonCallback = url.searchParams.get("amazon_callback_uri") || "";
  const amazonState = url.searchParams.get("amazon_state") || "";
  const version = url.searchParams.get("version") || "";

  if (!amazonCallback || !amazonState) {
    return NextResponse.redirect(`${origin}/settings?amazon_error=${encodeURIComponent("Amazon login is missing callback parameters")}`);
  }

  const auth = await requireUser();
  if (!auth.ok) {
    const next = `/api/amazon/oauth/login?${url.searchParams.toString()}`;
    return NextResponse.redirect(
      `${origin}/login?redirect=${encodeURIComponent(next)}`,
    );
  }

  const { state } = buildAmazonAuthorizeUrl(auth.user.id);
  const bounce = new URL(amazonCallback);
  bounce.searchParams.set("amazon_state", amazonState);
  bounce.searchParams.set("state", state);
  bounce.searchParams.set("redirect_uri", amazonCallbackUrl(origin));
  if (version === "beta" || getAmazonSpConfig().draftApp) {
    bounce.searchParams.set("version", "beta");
  }

  const res = NextResponse.redirect(bounce.toString());
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
