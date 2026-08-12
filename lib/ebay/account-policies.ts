import { getEbayConfig } from "@/lib/ebay/config";
import {
  ensureDefaultInventoryLocation,
  ensureSellingPolicyOptIn,
} from "@/lib/ebay/inventory-api";

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

/** Always the cheapest domestic option we support. Never Priority. */
export const HIGLOU_CHEAPEST_SHIPPING_SERVICE = "USPSGroundAdvantage";

const HIGLOU_FULFILLMENT_NAME = "Higlou Ground Advantage (buyer pays full)";
const HIGLOU_PAYMENT_NAME = "Higlou Payment";
const HIGLOU_RETURN_NAME = "Higlou Returns (14 days)";
/** Default flat rate on the business policy (buyer pays). Offers override per package. */
const HIGLOU_DEFAULT_FLAT_SHIPPING_USD = "5.99";

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
    const params = (first as { parameters?: Array<{ name?: string; value?: string }> })
      ?.parameters;
    const paramHint = params?.length
      ? ` (${params.map((p) => `${p.name}=${p.value}`).join(", ")})`
      : "";
    throw new Error(`${message}${id}${paramHint}`);
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

function isHiglouCheapFulfillmentName(name: string): boolean {
  return /higlou.*(ground advantage|buyer pays)/i.test(name);
}

function isHiglouPolicyName(name: string): boolean {
  return /higlou/i.test(name);
}

function isHiglouFourteenDayReturnName(name: string): boolean {
  return /higlou.*14\s*day/i.test(name);
}

/**
 * Prefer the seller's manual shipping policy (e.g. "olivia shiping") over
 * auto-created Higlou First Class leftovers. Preferred ID always wins when valid.
 */
export function pickShippingPolicy(
  options: EbayPolicyOption[],
  preferredId?: string,
): EbayPolicyOption | null {
  if (!options.length) return null;
  const manual = options.find((p) => !isHiglouPolicyName(p.name));
  const preferred = preferredId?.trim();
  if (preferred) {
    const match = options.find((p) => p.id === preferred);
    // Keep an explicit manual selection. Skip auto Higlou leftovers when a
    // Seller Hub manual policy exists (e.g. "olivia shiping").
    if (match && (!isHiglouPolicyName(match.name) || !manual)) {
      return match;
    }
  }
  if (manual) return manual;
  const cheap = options.find((p) => isHiglouCheapFulfillmentName(p.name));
  if (cheap) return cheap;
  const higlou = options.find((p) => isHiglouPolicyName(p.name));
  if (higlou) return higlou;
  return options[0] || null;
}

/** Prefer preferred ID, then Higlou-named, then default-ish, then first. */
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
  const cheap = options.find((p) => isHiglouCheapFulfillmentName(p.name));
  if (cheap) return cheap;
  const higlou = options.find((p) => isHiglouPolicyName(p.name));
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

/** Prefer Ground Advantage only — never auto-create First Class. */
const CHEAP_SHIPPING_SERVICE_CODES = ["USPSGroundAdvantage"] as const;

function fulfillmentPolicyBody(
  name: string,
  marketplaceId: string,
  shippingServiceCode: string,
) {
  // Domestic-only FLAT_RATE — buyer pays. No international option.
  // Do NOT use regionName "Domestic" (eBay 20400 Invalid Location(s)=Domestic).
  return {
    name,
    marketplaceId,
    categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES", default: true }],
    handlingTime: { value: 1, unit: "DAY" },
    globalShipping: false,
    freightShipping: false,
    localPickup: false,
    pickupDropOff: false,
    shippingOptions: [
      {
        optionType: "DOMESTIC",
        costType: "FLAT_RATE",
        shippingServices: [
          {
            sortOrder: 1,
            shippingServiceCode,
            freeShipping: false,
            buyerResponsibleForShipping: false,
            shippingCost: {
              value: HIGLOU_DEFAULT_FLAT_SHIPPING_USD,
              currency: "USD",
            },
            additionalShippingCost: { value: "0.00", currency: "USD" },
          },
        ],
      },
      // Intentionally no INTERNATIONAL shippingOptions.
    ],
  };
}

function returnPolicyBody(name: string, marketplaceId: string) {
  return {
    name,
    marketplaceId,
    categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES", default: true }],
    returnsAccepted: true,
    returnPeriod: { value: 14, unit: "DAY" },
    refundMethod: "MONEY_BACK",
    // Buyer pays return shipping — seller does not share the cost.
    returnShippingCostPayer: "BUYER",
  };
}

async function createFulfillmentPolicy(
  accessToken: string,
  marketplaceId: string,
  name = HIGLOU_FULFILLMENT_NAME,
): Promise<{ id: string; shippingServiceCode: string }> {
  let lastError: Error | null = null;
  for (const code of CHEAP_SHIPPING_SERVICE_CODES) {
    try {
      const json = (await accountFetch(
        accessToken,
        "/sell/account/v1/fulfillment_policy",
        {
          method: "POST",
          body: JSON.stringify(
            fulfillmentPolicyBody(name, marketplaceId, code),
          ),
        },
      )) as { fulfillmentPolicyId?: string };

      const id = String(json.fulfillmentPolicyId || "").trim();
      if (!id) throw new Error("eBay did not return fulfillmentPolicyId");
      return { id, shippingServiceCode: code };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      // Try next cheaper/fallback service on LSAS / invalid service errors.
      if (!/20403|LSAS|valid.*service|Invalid/i.test(lastError.message)) {
        throw lastError;
      }
    }
  }
  throw (
    lastError ||
    new Error(
      "Could not create eBay fulfillment policy with any shipping service",
    )
  );
}

async function createPaymentPolicy(
  accessToken: string,
  marketplaceId: string,
): Promise<string> {
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
  name = HIGLOU_RETURN_NAME,
): Promise<string> {
  const json = (await accountFetch(
    accessToken,
    "/sell/account/v1/return_policy",
    {
      method: "POST",
      body: JSON.stringify(returnPolicyBody(name, marketplaceId)),
    },
  )) as { returnPolicyId?: string };

  const id = String(json.returnPolicyId || "").trim();
  if (!id) throw new Error("eBay did not return returnPolicyId");
  return id;
}

async function updateReturnPolicy(
  accessToken: string,
  policyId: string,
  marketplaceId: string,
  name: string,
): Promise<void> {
  await accountFetch(
    accessToken,
    `/sell/account/v1/return_policy/${encodeURIComponent(policyId)}`,
    {
      method: "PUT",
      body: JSON.stringify(returnPolicyBody(name, marketplaceId)),
    },
  );
}

async function fulfillmentLooksCorrect(
  accessToken: string,
  policyId: string,
): Promise<boolean> {
  try {
    const json = (await accountFetch(
      accessToken,
      `/sell/account/v1/fulfillment_policy/${encodeURIComponent(policyId)}`,
    )) as {
      shippingOptions?: Array<{
        costType?: string;
        shippingServices?: Array<{
          shippingServiceCode?: string;
          freeShipping?: boolean;
          shippingCost?: { value?: string };
        }>;
      }>;
    };
    const option = json.shippingOptions?.[0];
    const service = option?.shippingServices?.[0];
    const cost = Number(service?.shippingCost?.value || 0);
    const costType = String(option?.costType || "").toUpperCase();
    // Accept flat buyer-paid. Reject calculated (LSAS) and free shipping.
    return (
      costType === "FLAT_RATE" &&
      Boolean(service?.shippingServiceCode) &&
      service?.freeShipping !== true &&
      cost > 0
    );
  } catch {
    return false;
  }
}

async function returnLooksCorrect(
  accessToken: string,
  policyId: string,
): Promise<boolean> {
  try {
    const json = (await accountFetch(
      accessToken,
      `/sell/account/v1/return_policy/${encodeURIComponent(policyId)}`,
    )) as {
      returnPeriod?: { value?: number; unit?: string };
      returnShippingCostPayer?: string;
      returnsAccepted?: boolean;
    };
    return (
      json.returnsAccepted === true &&
      Number(json.returnPeriod?.value) === 14 &&
      String(json.returnPeriod?.unit || "").toUpperCase() === "DAY" &&
      String(json.returnShippingCostPayer || "").toUpperCase() === "BUYER"
    );
  } catch {
    return false;
  }
}

/**
 * Ensure the connected seller has business policies.
 * Rule: use existing policies on the account; create a type ONLY if that type is missing.
 * forceRecreate* is for Settings "Create Higlou" and still will not replace a manual
 * shipping policy when one already exists.
 */
export async function ensureHiglouBusinessPolicies(
  accessToken: string,
  options?: {
    marketplaceId?: string;
    forceRecreateFulfillment?: boolean;
    forceRecreateReturn?: boolean;
    preferred?: Partial<ResolvedEbayPolicyIds>;
  },
): Promise<
  ResolvedEbayPolicyIds & {
    available: EbaySellerPolicies;
    created: string[];
    warning?: string;
  }
> {
  const marketplaceId = options?.marketplaceId || "EBAY_US";
  await ensureSellingPolicyOptIn(accessToken);
  try {
    await ensureDefaultInventoryLocation(accessToken);
  } catch {
    // Non-fatal
  }

  let listed = await listSellerBusinessPolicies(accessToken, marketplaceId);
  const created: string[] = [];
  let warning: string | undefined;
  const preferred = options?.preferred;

  // --- Payment: use existing; create only if account has none ---
  let payment =
    listed.payment.find((p) => p.id === preferred?.paymentPolicyId?.trim()) ||
    pickDefaultPolicy(listed.payment, preferred?.paymentPolicyId);
  if (!payment && listed.payment.length === 0) {
    const id = await createPaymentPolicy(accessToken, marketplaceId);
    created.push("payment");
    payment = { id, name: HIGLOU_PAYMENT_NAME };
  } else if (!payment) {
    payment = listed.payment[0] || null;
  }

  // --- Return: use existing; create only if account has none ---
  let returns =
    listed.return.find((p) => p.id === preferred?.returnPolicyId?.trim()) ||
    listed.return.find((p) => isHiglouFourteenDayReturnName(p.name)) ||
    pickDefaultPolicy(listed.return, preferred?.returnPolicyId);

  if (
    options?.forceRecreateReturn &&
    returns &&
    listed.return.every((p) => isHiglouPolicyName(p.name))
  ) {
    try {
      await updateReturnPolicy(
        accessToken,
        returns.id,
        marketplaceId,
        HIGLOU_RETURN_NAME,
      );
      created.push("return-updated");
    } catch {
      // Keep existing
      created.push("return-kept-existing");
    }
  } else if (!returns && listed.return.length === 0) {
    try {
      const id = await createReturnPolicy(accessToken, marketplaceId);
      returns = { id, name: HIGLOU_RETURN_NAME };
      created.push("return");
    } catch {
      throw new Error(
        "Could not create a return policy. Create one in eBay Seller Hub → Business policies, then Import from eBay.",
      );
    }
  } else if (!returns) {
    returns = listed.return[0] || null;
  }

  // --- Shipping: use existing; create only if account has none ---
  let shipping = pickShippingPolicy(
    listed.fulfillment,
    preferred?.shippingPolicyId,
  );

  const noShippingOnAccount = listed.fulfillment.length === 0;
  const forceOnlyHiglouShipping =
    options?.forceRecreateFulfillment === true &&
    listed.fulfillment.length > 0 &&
    listed.fulfillment.every((p) => isHiglouPolicyName(p.name));

  if (noShippingOnAccount || forceOnlyHiglouShipping) {
    const policyName = `${HIGLOU_FULFILLMENT_NAME} ${Date.now().toString(36)}`;
    try {
      const createdPolicy = await createFulfillmentPolicy(
        accessToken,
        marketplaceId,
        policyName,
      );
      shipping = { id: createdPolicy.id, name: policyName };
      created.push(`fulfillment:${createdPolicy.shippingServiceCode}`);
    } catch (createError) {
      const msg =
        createError instanceof Error ? createError.message : String(createError);
      shipping = pickShippingPolicy(
        listed.fulfillment,
        preferred?.shippingPolicyId,
      );
      if (shipping) {
        created.push("fulfillment-reused-existing");
        warning =
          "Could not create USPS Ground Advantage via API. Using your existing shipping policy.";
      } else {
        throw new Error(
          /LOGISTICS_INFO_IS_MISSING|20403|LSAS/i.test(msg)
            ? "eBay blocked creating Ground Advantage. Create a shipping policy in Seller Hub, then Import from eBay in Higlou."
            : msg,
        );
      }
    }
  } else if (!shipping) {
    shipping = listed.fulfillment[0] || null;
  }

  if (!shipping || !payment || !returns) {
    throw new Error(
      "Missing eBay business policies. Create Shipping, Return, and Payment in Seller Hub, then Import from eBay.",
    );
  }

  listed = await listSellerBusinessPolicies(accessToken, marketplaceId);

  return {
    shippingPolicyId: shipping.id,
    paymentPolicyId: payment.id,
    returnPolicyId: returns.id,
    available: listed,
    created,
    warning,
  };
}

/**
 * Resolve policy IDs for the connected seller.
 * 1) Use Settings/listing IDs when they exist on this account.
 * 2) Otherwise use policies already on the account.
 * 3) Create only types that are completely missing (if createIfMissing).
 */
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
  const preferred = options?.preferred;

  const byId = (rows: EbayPolicyOption[], id?: string) => {
    const needle = id?.trim();
    if (!needle) return null;
    return rows.find((p) => p.id === needle) || null;
  };

  // Exact Settings / listing IDs win when they belong to this seller.
  let shipping =
    byId(listed.fulfillment, preferred?.shippingPolicyId) ||
    pickShippingPolicy(listed.fulfillment, preferred?.shippingPolicyId);
  let payment =
    byId(listed.payment, preferred?.paymentPolicyId) ||
    pickDefaultPolicy(listed.payment, preferred?.paymentPolicyId);
  let returns =
    byId(listed.return, preferred?.returnPolicyId) ||
    pickDefaultPolicy(listed.return, preferred?.returnPolicyId);

  if (shipping && payment && returns) {
    return {
      shippingPolicyId: shipping.id,
      paymentPolicyId: payment.id,
      returnPolicyId: returns.id,
    };
  }

  if (options?.createIfMissing === false) {
    throw new Error(
      "No eBay business policies found. Import from eBay in Settings, or create them in Seller Hub.",
    );
  }

  // Only creates types that are missing on the account.
  const ensured = await ensureHiglouBusinessPolicies(accessToken, {
    marketplaceId,
    preferred: {
      shippingPolicyId: shipping?.id || preferred?.shippingPolicyId,
      paymentPolicyId: payment?.id || preferred?.paymentPolicyId,
      returnPolicyId: returns?.id || preferred?.returnPolicyId,
    },
    forceRecreateFulfillment: false,
    forceRecreateReturn: false,
  });
  return {
    shippingPolicyId: ensured.shippingPolicyId,
    paymentPolicyId: ensured.paymentPolicyId,
    returnPolicyId: ensured.returnPolicyId,
  };
}
