import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import {
  ebayOAuthMissingReason,
  isEbayOAuthConfigured,
} from "@/lib/ebay/config";
import { buildEbayAuthorizeUrl } from "@/lib/ebay/oauth";

/** Start eBay OAuth — redirects the browser to eBay consent. */
export async function GET() {
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
    return NextResponse.redirect(url);
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
