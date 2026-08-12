import { DEFAULT_VALUES } from "@/config/default-values";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SellerDraftDefaults = {
  shippingPolicyId: string;
  returnPolicyId: string;
  paymentPolicyId: string;
  itemLocation: string;
  postalCode: string;
  country: string;
  handlingTime: number;
  returnsAccepted: "No" | "Yes";
};

/**
 * Seller defaults for making eBay drafts as complete as the active template allows.
 * Location defaults to Higlou warehouse (2525 Market St, Logansport, IN 46947).
 */
export async function loadSellerDraftDefaults(options: {
  userId?: string;
  supabase?: SupabaseClient | null;
  listingOverrides?: Partial<{
    shippingPolicyId: string;
    returnPolicyId: string;
    paymentPolicyId: string;
    itemLocation: string;
    postalCode: string;
    country: string;
    handlingTime: number;
  }>;
}): Promise<SellerDraftDefaults> {
  const fallback: SellerDraftDefaults = {
    shippingPolicyId: DEFAULT_VALUES.shippingPolicyId,
    returnPolicyId: DEFAULT_VALUES.returnPolicyId,
    paymentPolicyId: DEFAULT_VALUES.paymentPolicyId,
    itemLocation: DEFAULT_VALUES.itemLocation,
    postalCode: DEFAULT_VALUES.postalCode,
    country: DEFAULT_VALUES.country,
    handlingTime: DEFAULT_VALUES.handlingTime,
    returnsAccepted: "No",
  };

  let fromDb: Partial<SellerDraftDefaults> = {};
  if (options.supabase && options.userId) {
    const { data } = await options.supabase
      .from("ebay_policy_settings")
      .select("*")
      .eq("user_id", options.userId)
      .maybeSingle();

    if (data) {
      fromDb = {
        shippingPolicyId: String(data.shipping_policy_id ?? ""),
        returnPolicyId: String(data.return_policy_id ?? ""),
        paymentPolicyId: String(data.payment_policy_id ?? ""),
        itemLocation: String(
          data.default_item_location ?? DEFAULT_VALUES.itemLocation,
        ),
        postalCode: String(
          data.default_postal_code ?? DEFAULT_VALUES.postalCode,
        ),
        handlingTime: Number(
          data.default_handling_time ?? DEFAULT_VALUES.handlingTime,
        ),
      };
    }
  }

  const o = options.listingOverrides ?? {};
  const resolvedLocation = normalizeItemLocation(
    o.itemLocation?.trim() || fromDb.itemLocation || fallback.itemLocation,
  );
  const resolvedPostal =
    o.postalCode?.trim() ||
    fromDb.postalCode ||
    fallback.postalCode ||
    DEFAULT_VALUES.postalCode;

  return {
    shippingPolicyId:
      o.shippingPolicyId?.trim() ||
      fromDb.shippingPolicyId ||
      fallback.shippingPolicyId,
    returnPolicyId:
      o.returnPolicyId?.trim() ||
      fromDb.returnPolicyId ||
      fallback.returnPolicyId,
    paymentPolicyId:
      o.paymentPolicyId?.trim() ||
      fromDb.paymentPolicyId ||
      fallback.paymentPolicyId,
    itemLocation: resolvedLocation,
    postalCode: resolvedPostal,
    country: o.country?.trim() || fallback.country,
    handlingTime:
      typeof o.handlingTime === "number" && Number.isFinite(o.handlingTime)
        ? o.handlingTime
        : (fromDb.handlingTime ?? fallback.handlingTime),
    returnsAccepted: "No",
  };
}

/** Coerce vague locations (United States) to the Higlou warehouse. */
export function normalizeItemLocation(value: string): string {
  const trimmed = value.trim();
  if (
    !trimmed ||
    /^united states$/i.test(trimmed) ||
    /^usa$/i.test(trimmed) ||
    /^us$/i.test(trimmed)
  ) {
    return DEFAULT_VALUES.itemLocation;
  }
  // User asked for Logansport IN 46947 — keep city/state in Location; ZIP separate.
  if (/logansport/i.test(trimmed)) {
    return "Logansport, IN";
  }
  return trimmed;
}

/**
 * Map seller defaults onto possible official template header names.
 * Only write non-empty values; generate-csv may append missing allowlisted headers.
 */
export function draftDefaultsToPolicyValues(
  defaults: SellerDraftDefaults,
): Record<string, string> {
  const values: Record<string, string> = {};

  if (defaults.shippingPolicyId) {
    values["Shipping profile name"] = defaults.shippingPolicyId;
  }
  if (defaults.returnPolicyId) {
    values["Return profile name"] = defaults.returnPolicyId;
  }
  if (defaults.paymentPolicyId) {
    values["Payment profile name"] = defaults.paymentPolicyId;
  }
  // Official File Exchange: use PostalCode OR Location — not both.
  // PostalCode derives city (Logansport, IN) and avoids "United States" only.
  if (defaults.postalCode) {
    values.PostalCode = defaults.postalCode;
    values["Postal code"] = defaults.postalCode;
    values["Zip code"] = defaults.postalCode;
    values.OriginatingPostalCode = defaults.postalCode;
  } else if (defaults.itemLocation) {
    values.Location = defaults.itemLocation;
    values["Item location"] = defaults.itemLocation;
  }
  if (defaults.country) {
    values.Country = defaults.country;
    values.CountryCode = defaults.country;
    values["Country of location"] = defaults.country;
  }
  if (Number.isFinite(defaults.handlingTime)) {
    const days = String(defaults.handlingTime);
    values.DispatchTimeMax = days;
    values["Handling time"] = days;
    values["Max dispatch time"] = days;
  }

  // Explicit no-returns when template still exposes classic return columns.
  values.ReturnsAcceptedOption = "ReturnsNotAccepted";
  values["Returns Accepted Option"] = "ReturnsNotAccepted";
  values["Returns accepted"] = "No";

  return values;
}
