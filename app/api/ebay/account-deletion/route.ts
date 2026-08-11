import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * eBay Marketplace Account Deletion notification endpoint.
 * Required for public apps — acknowledge + delete stored seller data.
 * @see https://developer.ebay.com/marketplace-account-deletion
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const challenge = url.searchParams.get("challenge_code");
  const verification =
    process.env.EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN || "";

  if (!challenge) {
    return NextResponse.json(
      { error: "Missing challenge_code" },
      { status: 400 },
    );
  }

  // eBay challenge: hash(challengeCode + verificationToken + endpoint)
  // Endpoint MUST exactly match what is registered in the Developer portal.
  const endpoint = (
    process.env.EBAY_ACCOUNT_DELETION_ENDPOINT ||
    `${process.env.NEXT_PUBLIC_APP_URL || ""}/api/ebay/account-deletion`
  )
    .replace(/[\r\n\t]+/g, "")
    .trim()
    .replace(/\/+$/, "");

  if (!verification || !endpoint.startsWith("https://")) {
    return NextResponse.json(
      {
        error:
          "Set EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN and EBAY_ACCOUNT_DELETION_ENDPOINT (https) for marketplace deletion challenges",
      },
      { status: 503 },
    );
  }

  const hash = createHash("sha256")
    .update(challenge)
    .update(verification)
    .update(endpoint)
    .digest("hex");

  return NextResponse.json({ challengeResponse: hash });
}

export async function POST(request: Request) {
  let body: {
    notification?: {
      data?: { userId?: string; username?: string };
    };
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ebayUserId = String(body.notification?.data?.userId || "").trim();
  const ebayUsername = String(body.notification?.data?.username || "").trim();

  if (!ebayUserId && !ebayUsername) {
    // Acknowledge anyway so eBay does not retry forever on malformed payloads.
    return NextResponse.json({ ok: true });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true });
  }

  try {
    const admin = createAdminClient();
    let query = admin.from("ebay_connections").update({
      refresh_token_enc: "",
      access_token_enc: null,
      access_token_expires_at: null,
      revoked_at: new Date().toISOString(),
      last_error: "Revoked via eBay marketplace account deletion",
      updated_at: new Date().toISOString(),
    });

    if (ebayUserId) {
      query = query.eq("ebay_user_id", ebayUserId);
    } else {
      query = query.eq("ebay_username", ebayUsername);
    }

    await query;
  } catch (error) {
    console.error("[ebay/account-deletion]", error);
  }

  return NextResponse.json({ ok: true });
}
