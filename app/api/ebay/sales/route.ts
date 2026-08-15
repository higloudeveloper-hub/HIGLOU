import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import {
  getEbayConnectionPublic,
  getValidAccessToken,
} from "@/lib/ebay/oauth";
import { emptySalesSnapshot, syncEbaySalesForUser } from "@/lib/ebay/sales-sync";

/** Live eBay sales + reflect sold items onto Higlou products. */
export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const connection = await getEbayConnectionPublic(
      auth.supabase,
      auth.user.id,
    );
    if (!connection.connected) {
      return NextResponse.json(emptySalesSnapshot());
    }

    const token = await getValidAccessToken(auth.supabase, auth.user.id);
    const snapshot = await syncEbaySalesForUser(
      auth.supabase,
      auth.user.id,
      token,
    );
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load eBay sales";
    const needsReconnect = /scope|permission|401|403|Connect your eBay/i.test(
      message,
    );
    return NextResponse.json(
      emptySalesSnapshot({
        error: needsReconnect
          ? "Reconnect eBay in Settings so Higlou can read orders and inventory."
          : message,
      }),
      { status: 200 },
    );
  }
}
