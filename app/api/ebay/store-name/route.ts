import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { fetchEbayStoreName } from "@/lib/ebay/fetch-store-name";
import {
  getEbayConnectionPublic,
  getValidAccessToken,
} from "@/lib/ebay/oauth";
import { displayNameFromEbayUsername } from "@/lib/ebay/store-display-name";

/** Connected eBay store name for listing HTML / Publish UI. */
export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const connection = await getEbayConnectionPublic(
      auth.supabase,
      auth.user.id,
    );
    if (!connection.connected) {
      return NextResponse.json({
        storeName: null,
        username: null,
        source: "none",
      });
    }

    const username = connection.ebayUsername?.trim() || null;
    let storeName: string | null = null;
    try {
      const token = await getValidAccessToken(auth.supabase, auth.user.id);
      storeName = await fetchEbayStoreName(token);
    } catch {
      storeName = null;
    }

    const resolved =
      storeName ||
      (username ? displayNameFromEbayUsername(username) : null);

    return NextResponse.json({
      storeName: resolved,
      username,
      source: storeName ? "ebay-store" : username ? "ebay-user" : "none",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load eBay store name",
      },
      { status: 500 },
    );
  }
}
