import { getEbayConfig } from "@/lib/ebay/config";
import { ensureSellingPolicyOptIn } from "@/lib/ebay/inventory-api";

export type EbayPolicyOption = {
  id: string;
  name: string;
};

export type EbaySellerPolicies = {
  marketplaceId: string;
  fulfillment: EbayPolicyOption[];
  payment: EbayPolicyOption[];
  return: EbayPolicyOption[];
};

export type ResolvedEbayPolicyIds = {
  shippingPolicyId: string;
  paymentPolicyId: string;
  returnPolicyId: string;
};

async function accountFetch(
  accessToken: string,
  path: string,
): Promise<unknown> {
  const cfg = getEbayConfig();
  const res = await fetch(`${cfg.apiBase}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "Accept-Language": "en-US",
      "Content-Language": "en-US",
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = json as {
      errors?: Array<{ message?: string; longMessage?: string; errorId?: number }>;
      message?: string;
    } | null;
    const first = err?.errors?.[0];
    const message =
      first?.longMessage ||
      first?.message ||
      err?.message ||
      `eBay Account API ${res.status} on ${path}`;
    const id = first?.errorId ? ` [eBay ${first.errorId}]` : "";
    throw new Error(`${message}${id}`);
  }
  return json;
}

function mapNamedPolicies(
  rows: Array<Record<string, unknown>> | undefined,
  idKey: string,
): EbayPolicyOption[] {
  return (rows || [])
    .map((row) => ({
      id: String(row[idKey] || "").trim(),
      name: String(row.name || row[idKey] || "").trim(),
    }))
    .filter((p) => p.id);
}

/** Prefer a policy whose name looks like a default; otherwise first. */
export function pickDefaultPolicy(
  options: EbayPolicyOption[],
  preferredId?: string,
): EbayPolicyOption | null {
  if (!options.length) return null;
  const preferred = preferredId?.trim();
  if (preferred) {
    const match = options.find((p) => p.id === preferred);
    if (match) return match;
  }
  const namedDefault = options.find((p) =>
    /default|standard|primary|main/i.test(p.name),
  );
  return namedDefault || options[0] || null;
}

/** List seller business policies from eBay Account API. */
export async function listSellerBusinessPolicies(
  accessToken: string,
  marketplaceId = "EBAY_US",
): Promise<EbaySellerPolicies> {
  await ensureSellingPolicyOptIn(accessToken);
  const market = encodeURIComponent(marketplaceId || "EBAY_US");

  const [fulfillmentJson, paymentJson, returnJson] = await Promise.all([
    accountFetch(
      accessToken,
      `/sell/account/v1/fulfillment_policy?marketplace_id=${market}`,
    ),
    accountFetch(
      accessToken,
      `/sell/account/v1/payment_policy?marketplace_id=${market}`,
    ),
    accountFetch(
      accessToken,
      `/sell/account/v1/return_policy?marketplace_id=${market}`,
    ),
  ]);

  const fulfillment = mapNamedPolicies(
    (fulfillmentJson as { fulfillmentPolicies?: Array<Record<string, unknown>> })
      ?.fulfillmentPolicies,
    "fulfillmentPolicyId",
  );
  const payment = mapNamedPolicies(
    (paymentJson as { paymentPolicies?: Array<Record<string, unknown>> })
      ?.paymentPolicies,
    "paymentPolicyId",
  );
  const returns = mapNamedPolicies(
    (returnJson as { returnPolicies?: Array<Record<string, unknown>> })
      ?.returnPolicies,
    "returnPolicyId",
  );

  return {
    marketplaceId: marketplaceId || "EBAY_US",
    fulfillment,
    payment,
    return: returns,
  };
}

/** Resolve one shipping/payment/return policy ID for live publish. */
export async function resolveSellerBusinessPolicyIds(
  accessToken: string,
  options?: {
    marketplaceId?: string;
    preferred?: Partial<ResolvedEbayPolicyIds>;
  },
): Promise<ResolvedEbayPolicyIds> {
  const listed = await listSellerBusinessPolicies(
    accessToken,
    options?.marketplaceId || "EBAY_US",
  );

  const shipping = pickDefaultPolicy(
    listed.fulfillment,
    options?.preferred?.shippingPolicyId,
  );
  const payment = pickDefaultPolicy(
    listed.payment,
    options?.preferred?.paymentPolicyId,
  );
  const returns = pickDefaultPolicy(
    listed.return,
    options?.preferred?.returnPolicyId,
  );

  const missing: string[] = [];
  if (!shipping) missing.push("shipping (fulfillment)");
  if (!payment) missing.push("payment");
  if (!returns) missing.push("return");
  if (missing.length) {
    throw new Error(
      `No eBay business policies found for ${missing.join(", ")}. Create them in Seller Hub → Account → Business policies, then try again.`,
    );
  }

  return {
    shippingPolicyId: shipping!.id,
    paymentPolicyId: payment!.id,
    returnPolicyId: returns!.id,
  };
}
