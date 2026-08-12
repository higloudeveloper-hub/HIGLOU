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

function isHiglouFourteenDayReturnName(name: string): boolean {
  return /higlou.*14\s*day/i.test(name);
}

/** Prefer Higlou Ground Advantage (buyer pays), then any Higlou, then default. */
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

/** Prefer cheapest services first — never create Priority unless nothing else works. */
const CHEAP_SHIPPING_SERVICE_CODES = [
  "USPSGroundAdvantage",
  "USPSFirstClass",
  "USPSParcel",
  "EconomyShipping",
  "ShippingMethodStandard",
  "Other",
  // Last resorts (more expensive) — only if LSAS rejects cheaper codes.
  "USPSPriority",
  "UPSGround",
] as const;

function fulfillmentPolicyBody(
  name: string,
  marketplaceId: string,
  shippingServiceCode: string,
) {
  // Minimal FLAT_RATE — buyer pays. Avoid CALCULATED (LSAS) and extra flags.
  return {
    name,
    marketplaceId,
    categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES", default: true }],
    handlingTime: { value: 1, unit: "DAY" },
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
            shipToLocations: {
              regionIncluded: [{ regionName: "Domestic" }],
            },
          },
        ],
      },
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
 * Ensure the connected seller has Higlou policies:
 * - Flat-rate cheapest available USPS service, buyer pays (never free)
 * - 14-day returns, buyer pays return shipping
 */
export async function ensureHiglouBusinessPolicies(
  accessToken: string,
  options?: {
    marketplaceId?: string;
    forceRecreateFulfillment?: boolean;
    forceRecreateReturn?: boolean;
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
  // Inventory location is required logistics setup for many US seller accounts.
  try {
    await ensureDefaultInventoryLocation(accessToken);
  } catch {
    // Non-fatal — some accounts already have Seller Hub locations.
  }

  let listed = await listSellerBusinessPolicies(accessToken, marketplaceId);
  const created: string[] = [];
  let warning: string | undefined;

  let payment = pickDefaultPolicy(listed.payment);
  if (!payment) {
    const id = await createPaymentPolicy(accessToken, marketplaceId);
    created.push("payment");
    payment = { id, name: HIGLOU_PAYMENT_NAME };
  }

  // --- Return: always 14 days, buyer pays return ship ---
  let returns =
    listed.return.find((p) => isHiglouFourteenDayReturnName(p.name)) || null;

  if (
    returns &&
    (options?.forceRecreateReturn ||
      !(await returnLooksCorrect(accessToken, returns.id)))
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
      try {
        const id = await createReturnPolicy(
          accessToken,
          marketplaceId,
          `${HIGLOU_RETURN_NAME} ${Date.now().toString(36)}`,
        );
        returns = { id, name: HIGLOU_RETURN_NAME };
        created.push("return");
      } catch {
        // Keep existing return if eBay blocks create/update.
        created.push("return-kept-existing");
      }
    }
  } else if (!returns) {
    const legacyHiglou = listed.return.find((p) => /higlou/i.test(p.name));
    if (legacyHiglou) {
      try {
        await updateReturnPolicy(
          accessToken,
          legacyHiglou.id,
          marketplaceId,
          HIGLOU_RETURN_NAME,
        );
        returns = { id: legacyHiglou.id, name: HIGLOU_RETURN_NAME };
        created.push("return-updated");
      } catch {
        try {
          const id = await createReturnPolicy(accessToken, marketplaceId);
          returns = { id, name: HIGLOU_RETURN_NAME };
          created.push("return");
        } catch {
          returns = legacyHiglou;
          created.push("return-kept-existing");
        }
      }
    } else {
      try {
        const id = await createReturnPolicy(accessToken, marketplaceId);
        returns = { id, name: HIGLOU_RETURN_NAME };
        created.push("return");
      } catch {
        returns = pickDefaultPolicy(listed.return);
        if (!returns) {
          throw new Error(
            "Could not create a 14-day return policy. Create one in eBay Seller Hub → Account → Business policies (14 days, buyer pays return shipping), then click Import from eBay.",
          );
        }
        created.push("return-kept-existing");
        warning =
          "Could not create Higlou 14-day returns via API. Using an existing return policy — edit it in Seller Hub to 14 days.";
      }
    }
  }

  // --- Fulfillment: flat buyer-pays; create NEW; on LOGISTICS_INFO_IS_MISSING reuse ---
  let shipping =
    listed.fulfillment.find((p) => isHiglouCheapFulfillmentName(p.name)) ||
    null;

  const shippingOk =
    shipping != null &&
    (await fulfillmentLooksCorrect(accessToken, shipping.id));

  if (!shippingOk || options?.forceRecreateFulfillment) {
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

      const scored = await Promise.all(
        listed.fulfillment.map(async (p) => ({
          p,
          ok: await fulfillmentLooksCorrect(accessToken, p.id),
        })),
      );
      const flatOk = scored.find((row) => row.ok)?.p || null;
      const anyExisting =
        flatOk ||
        shipping ||
        listed.fulfillment.find((p) => /higlou/i.test(p.name)) ||
        listed.fulfillment[0] ||
        null;

      if (anyExisting) {
        shipping = anyExisting;
        created.push("fulfillment-reused-existing");
        if (/LOGISTICS_INFO_IS_MISSING|20403|LSAS/i.test(msg)) {
          warning =
            "eBay blocked creating a new shipping policy (LOGISTICS_INFO_IS_MISSING). Using your existing shipping policy. In Seller Hub → Business policies, set shipping to USPS Ground Advantage, buyer pays (not free), then Import from eBay.";
        } else {
          warning = `Could not create a new shipping policy (${msg}). Using an existing one from your eBay account.`;
        }
      } else {
        throw new Error(
          /LOGISTICS_INFO_IS_MISSING/i.test(msg)
            ? "eBay says logistics info is missing on this seller account. Open eBay Seller Hub → Account → Business policies, create Shipping (USPS Ground Advantage, buyer pays) + Return (14 days) + Payment, then click Import from eBay in Higlou."
            : msg,
        );
      }
    }
  }

  if (!shipping || !payment || !returns) {
    throw new Error(
      "Missing eBay business policies. Create Shipping, Return (14 days), and Payment in Seller Hub, then Import from eBay.",
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

/** Resolve policy IDs; create/fix Higlou flat buyer-pays + 14-day returns when needed. */
export async function resolveSellerBusinessPolicyIds(
  accessToken: string,
  options?: {
    marketplaceId?: string;
    preferred?: Partial<ResolvedEbayPolicyIds>;
    createIfMissing?: boolean;
  },
): Promise<ResolvedEbayPolicyIds> {
  const marketplaceId = options?.marketplaceId || "EBAY_US";

  if (options?.createIfMissing === false) {
    const listed = await listSellerBusinessPolicies(accessToken, marketplaceId);
    const shipping =
      listed.fulfillment.find((p) => isHiglouCheapFulfillmentName(p.name)) ||
      pickDefaultPolicy(
        listed.fulfillment,
        options?.preferred?.shippingPolicyId,
      );
    const payment = pickDefaultPolicy(
      listed.payment,
      options?.preferred?.paymentPolicyId,
    );
    const returns =
      listed.return.find((p) => isHiglouFourteenDayReturnName(p.name)) ||
      pickDefaultPolicy(listed.return, options?.preferred?.returnPolicyId);

    if (shipping && payment && returns) {
      return {
        shippingPolicyId: shipping.id,
        paymentPolicyId: payment.id,
        returnPolicyId: returns.id,
      };
    }
    throw new Error(
      "No eBay business policies found. Use Create Higlou policies in Settings.",
    );
  }

  // Do NOT force-recreate on every publish — that retriggers LSAS 20403.
  const ensured = await ensureHiglouBusinessPolicies(accessToken, {
    marketplaceId,
    forceRecreateFulfillment: false,
    forceRecreateReturn: false,
  });
  return {
    shippingPolicyId: ensured.shippingPolicyId,
    paymentPolicyId: ensured.paymentPolicyId,
    returnPolicyId: ensured.returnPolicyId,
  };
}
