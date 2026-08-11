import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import {
  listSellerBusinessPolicies,
  resolveSellerBusinessPolicyIds,
} from "@/lib/ebay/account-policies";
import {
  getEbayConnectionPublic,
  getValidAccessToken,
} from "@/lib/ebay/oauth";
import { DEFAULT_VALUES } from "@/config/default-values";

/** List business policies from the connected eBay seller account. */
export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const connection = await getEbayConnectionPublic(
      auth.supabase,
      auth.user.id,
    );
    if (!connection.connected) {
      return NextResponse.json(
        { error: "Connect your eBay store in Settings first." },
        { status: 400 },
      );
    }

    const accessToken = await getValidAccessToken(
      auth.supabase,
      auth.user.id,
    );
    const policies = await listSellerBusinessPolicies(
      accessToken,
      connection.marketplaceId || "EBAY_US",
    );

    return NextResponse.json({ policies, connection });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load eBay business policies",
      },
      { status: 502 },
    );
  }
}

/**
 * Import default shipping/payment/return policy IDs from eBay into
 * ebay_policy_settings (keeps location / handling defaults if already set).
 */
export async function POST() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const connection = await getEbayConnectionPublic(
      auth.supabase,
      auth.user.id,
    );
    if (!connection.connected) {
      return NextResponse.json(
        { error: "Connect your eBay store in Settings first." },
        { status: 400 },
      );
    }

    const accessToken = await getValidAccessToken(
      auth.supabase,
      auth.user.id,
    );

    const { data: existing } = await auth.supabase
      .from("ebay_policy_settings")
      .select("*")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    const listed = await listSellerBusinessPolicies(
      accessToken,
      connection.marketplaceId || "EBAY_US",
    );

    const resolved = await resolveSellerBusinessPolicyIds(accessToken, {
      marketplaceId: connection.marketplaceId || "EBAY_US",
      preferred: {
        shippingPolicyId: String(existing?.shipping_policy_id ?? ""),
        paymentPolicyId: String(existing?.payment_policy_id ?? ""),
        returnPolicyId: String(existing?.return_policy_id ?? ""),
      },
    });

    const payload = {
      user_id: auth.user.id,
      shipping_policy_id: resolved.shippingPolicyId,
      payment_policy_id: resolved.paymentPolicyId,
      return_policy_id: resolved.returnPolicyId,
      default_item_location: String(
        existing?.default_item_location ?? DEFAULT_VALUES.itemLocation,
      ),
      default_postal_code: String(
        existing?.default_postal_code ?? DEFAULT_VALUES.postalCode,
      ),
      default_handling_time: Number(
        existing?.default_handling_time ?? DEFAULT_VALUES.handlingTime,
      ),
      updated_at: new Date().toISOString(),
    };

    const { data: saved, error } = await auth.supabase
      .from("ebay_policy_settings")
      .upsert(payload, { onConflict: "user_id" })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      available: listed,
      policies: {
        paymentPolicyId: String(saved.payment_policy_id ?? ""),
        returnPolicyId: String(saved.return_policy_id ?? ""),
        shippingPolicyId: String(saved.shipping_policy_id ?? ""),
        defaultItemLocation: String(
          saved.default_item_location ?? DEFAULT_VALUES.itemLocation,
        ),
        defaultPostalCode: String(saved.default_postal_code ?? ""),
        defaultHandlingTime: Number(
          saved.default_handling_time ?? DEFAULT_VALUES.handlingTime,
        ),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to import eBay business policies",
      },
      { status: 502 },
    );
  }
}
