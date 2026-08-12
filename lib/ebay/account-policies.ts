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

const HIGLOU_FULFILLMENT_NAME = "Higlou Calculated Shipping (buyer pays)";
const HIGLOU_PAYMENT_NAME = "Higlou Payment";
const HIGLOU_RETURN_NAME = "Higlou Returns (14 days)";

async function accountFetch(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const cfg = getEbayConfig();
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");
  headers.set("Accept-Language", "en-US");
  headers.set("Content-Language", "en-US");
  headers.set("X-EBAY-C-MARKETPLACE-ID", "EBAY_US");

  const res = await fetch(`${cfg.apiBase}${path}`, {
    ...init,
    headers,
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
      errors?: Array<{
        message?: string;
        longMessage?: string;
        errorId?: number;
      }>;
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

/** Prefer Higlou calculated (buyer pays), then any Higlou, then default-ish, then first. */
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
  const calculated = options.find((p) =>
    /higlou.*calculat|buyer pays/i.test(p.name),
  );
  if (calculated) return calculated;
  const higlou = options.find((p) => /higlou/i.test(p.name));
  if (higlou) return higlou;
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

  return {
    marketplaceId: marketplaceId || "EBAY_US",
    fulfillment: mapNamedPolicies(
      (fulfillmentJson as { fulfillmentPolicies?: Array<Record<string, unknown>> })
        ?.fulfillmentPolicies,
      "fulfillmentPolicyId",
    ),
    payment: mapNamedPolicies(
      (paymentJson as { paymentPolicies?: Array<Record<string, unknown>> })
        ?.paymentPolicies,
      "paymentPolicyId",
    ),
    return: mapNamedPolicies(
      (returnJson as { returnPolicies?: Array<Record<string, unknown>> })
        ?.returnPolicies,
      "returnPolicyId",
    ),
  };
}

async function createFulfillmentPolicy(
  accessToken: string,
  marketplaceId: string,
  shippingServiceCode: string,
  name = HIGLOU_FULFILLMENT_NAME,
): Promise<string> {
  // CALCULATED = buyer pays carrier rate from listing package weight/dims.
  const json = (await accountFetch(
    accessToken,
    "/sell/account/v1/fulfillment_policy",
    {
      method: "POST",
      body: JSON.stringify({
        name,
        marketplaceId,
        categoryTypes: [
          { name: "ALL_EXCLUDING_MOTORS_VEHICLES", default: true },
        ],
        handlingTime: { value: 1, unit: "DAY" },
        shippingOptions: [
          {
            optionType: "DOMESTIC",
            costType: "CALCULATED",
            shippingServices: [
              {
                sortOrder: 1,
                shippingServiceCode,
                freeShipping: false,
              },
            ],
          },
        ],
      }),
    },
  )) as { fulfillmentPolicyId?: string };

  const id = String(json.fulfillmentPolicyId || "").trim();
  if (!id) throw new Error("eBay did not return fulfillmentPolicyId");
  return id;
}

async function createPaymentPolicy(
  accessToken: string,
  marketplaceId: string,
): Promise<string> {
  // Managed Payments sellers typically need an empty paymentMethods list.
  const json = (await accountFetch(
    accessToken,
    "/sell/account/v1/payment_policy",
    {
      method: "POST",
      body: JSON.stringify({
        name: HIGLOU_PAYMENT_NAME,
        marketplaceId,
        categoryTypes: [
          { name: "ALL_EXCLUDING_MOTORS_VEHICLES", default: true },
        ],
        immediatePay: false,
        paymentMethods: [],
      }),
    },
  )) as { paymentPolicyId?: string };

  const id = String(json.paymentPolicyId || "").trim();
  if (!id) throw new Error("eBay did not return paymentPolicyId");
  return id;
}

async function createReturnPolicy(
  accessToken: string,
  marketplaceId: string,
): Promise<string> {
  const json = (await accountFetch(
    accessToken,
    "/sell/account/v1/return_policy",
    {
      method: "POST",
      body: JSON.stringify({
        name: HIGLOU_RETURN_NAME,
        marketplaceId,
        categoryTypes: [
          { name: "ALL_EXCLUDING_MOTORS_VEHICLES", default: true },
        ],
        returnsAccepted: true,
        returnPeriod: { value: 14, unit: "DAY" },
        refundMethod: "MONEY_BACK",
        returnShippingCostPayer: "BUYER",
        returnMethod: "REPLACEMENT",
      }),
    },
  )) as { returnPolicyId?: string };

  const id = String(json.returnPolicyId || "").trim();
  if (!id) throw new Error("eBay did not return returnPolicyId");
  return id;
}

/**
 * Ensure the connected seller has usable Higlou business policies.
 * Creates missing payment/return/fulfillment policies (cannot copy across accounts).
 */
export async function ensureHiglouBusinessPolicies(
  accessToken: string,
  options?: {
    marketplaceId?: string;
    forceRecreateFulfillment?: boolean;
  },
): Promise<ResolvedEbayPolicyIds & { available: EbaySellerPolicies; created: string[] }> {
  const marketplaceId = options?.marketplaceId || "EBAY_US";
  await ensureSellingPolicyOptIn(accessToken);

  let listed = await listSellerBusinessPolicies(accessToken, marketplaceId);
  const created: string[] = [];

  let payment = pickDefaultPolicy(listed.payment);
  if (!payment) {
    const id = await createPaymentPolicy(accessToken, marketplaceId);
    created.push("payment");
    payment = { id, name: HIGLOU_PAYMENT_NAME };
  }

  let returns =
    listed.return.find((p) => /higlou.*14\s*day/i.test(p.name)) || null;
  if (!returns) {
    const id = await createReturnPolicy(accessToken, marketplaceId);
    created.push("return");
    returns = { id, name: HIGLOU_RETURN_NAME };
  }

  let shipping =
    listed.fulfillment.find((p) =>
      /higlou.*calculat|buyer pays/i.test(p.name),
    ) || null;
  // Old flat Higlou policies (or empty accounts) need a calculated buyer-pays policy.
  if (!shipping || options?.forceRecreateFulfillment) {
    // Prefer Ground Advantage (matches Higlou UI), then Priority.
    const serviceCodes = [
      "USPSGroundAdvantage",
      "USPSPriority",
      "USPSFirstClass",
    ];
    const policyName = options?.forceRecreateFulfillment
      ? `${HIGLOU_FULFILLMENT_NAME} ${Date.now().toString(36)}`
      : HIGLOU_FULFILLMENT_NAME;
    let lastError: Error | null = null;
    let id = "";
    for (const code of serviceCodes) {
      try {
        id = await createFulfillmentPolicy(
          accessToken,
          marketplaceId,
          code,
          policyName,
        );
        lastError = null;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
    if (!id) {
      throw (
        lastError ||
        new Error("Could not create eBay fulfillment (shipping) policy")
      );
    }
    created.push("fulfillment");
    shipping = { id, name: policyName };
  }

  listed = await listSellerBusinessPolicies(accessToken, marketplaceId);

  return {
    shippingPolicyId: shipping.id,
    paymentPolicyId: payment.id,
    returnPolicyId: returns.id,
    available: listed,
    created,
  };
}

/** Resolve one shipping/payment/return policy ID; create Higlou defaults if missing. */
export async function resolveSellerBusinessPolicyIds(
  accessToken: string,
  options?: {
    marketplaceId?: string;
    preferred?: Partial<ResolvedEbayPolicyIds>;
    createIfMissing?: boolean;
  },
): Promise<ResolvedEbayPolicyIds> {
  const marketplaceId = options?.marketplaceId || "EBAY_US";
  const listed = await listSellerBusinessPolicies(accessToken, marketplaceId);

  // Always prefer Higlou calculated (buyer pays) over stale flat policy IDs.
  const shipping =
    listed.fulfillment.find((p) =>
      /higlou.*calculat|buyer pays/i.test(p.name),
    ) ||
    pickDefaultPolicy(listed.fulfillment, options?.preferred?.shippingPolicyId);
  const payment = pickDefaultPolicy(
    listed.payment,
    options?.preferred?.paymentPolicyId,
  );
  const returns =
    listed.return.find((p) => /higlou.*14\s*day/i.test(p.name)) ||
    pickDefaultPolicy(listed.return, options?.preferred?.returnPolicyId);

  const hasCalculatedShipping = listed.fulfillment.some((p) =>
    /higlou.*calculat|buyer pays/i.test(p.name),
  );
  const hasFourteenDayReturns = listed.return.some((p) =>
    /higlou.*14\s*day/i.test(p.name),
  );

  if (
    shipping &&
    payment &&
    returns &&
    hasCalculatedShipping &&
    hasFourteenDayReturns
  ) {
    return {
      shippingPolicyId: shipping.id,
      paymentPolicyId: payment.id,
      returnPolicyId: returns.id,
    };
  }

  if (options?.createIfMissing === false) {
    const missing: string[] = [];
    if (!shipping) missing.push("shipping (fulfillment)");
    if (!payment) missing.push("payment");
    if (!returns) missing.push("return");
    if (!hasCalculatedShipping) {
      missing.push("calculated buyer-pays shipping");
    }
    if (!hasFourteenDayReturns) missing.push("14-day return policy");
    throw new Error(
      `No eBay business policies found for ${missing.join(", ")}. Create them in Seller Hub or use Create Higlou policies.`,
    );
  }

  const ensured = await ensureHiglouBusinessPolicies(accessToken, {
    marketplaceId,
  });
  return {
    shippingPolicyId: ensured.shippingPolicyId,
    paymentPolicyId: ensured.paymentPolicyId,
    returnPolicyId: ensured.returnPolicyId,
  };
}
