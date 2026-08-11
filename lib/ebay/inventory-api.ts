import { getEbayConfig } from "@/lib/ebay/config";

export type EbayAspects = Record<string, string[]>;

export type EbayInventoryItemInput = {
  sku: string;
  title: string;
  description: string;
  imageUrls: string[];
  aspects: EbayAspects;
  condition: string;
  brand?: string;
  mpn?: string;
  upc?: string;
  packageWeightLbs?: number;
  packageWeightOz?: number;
  packageLengthIn?: number;
  packageWidthIn?: number;
  packageDepthIn?: number;
};

export type EbayOfferInput = {
  sku: string;
  marketplaceId?: string;
  categoryId: string;
  price: number;
  quantity: number;
  merchantLocationKey?: string;
  listingDescription?: string;
  fulfillmentPolicyId?: string;
  paymentPolicyId?: string;
  returnPolicyId?: string;
  format?: "FIXED_PRICE";
};

async function ebayFetch(
  accessToken: string,
  path: string,
  init: RequestInit = {},
) {
  const cfg = getEbayConfig();
  // eBay Inventory rejects invalid Accept-Language / Content-Language
  // (Vercel/runtime locale can leak bad values if not set explicitly).
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
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
        errorId?: number;
        longMessage?: string;
        parameters?: Array<{ name?: string; value?: string }>;
      }>;
      message?: string;
    } | null;
    const first = err?.errors?.[0];
    const extra = (first?.parameters || [])
      .map((p) => `${p.name || "info"}=${p.value || ""}`)
      .filter(Boolean)
      .join(", ");
    const message =
      first?.longMessage ||
      first?.message ||
      err?.message ||
      `eBay API ${res.status} on ${path}`;
    const id = first?.errorId ? ` [eBay ${first.errorId}]` : "";
    const detail = extra ? ` (${extra})` : "";
    throw new Error(`${message}${detail}${id}`);
  }
  return json;
}

function mapCondition(conditionId: string, conditionLabel: string): string {
  const id = String(conditionId || "");
  if (id === "1000" || /new/i.test(conditionLabel)) return "NEW";
  if (id === "1500") return "NEW_OTHER";
  if (id === "2000" || /certified/i.test(conditionLabel))
    return "CERTIFIED_REFURBISHED";
  if (id === "2500") return "SELLER_REFURBISHED";
  if (id === "3000" || /used/i.test(conditionLabel)) return "USED_EXCELLENT";
  if (id === "4000") return "USED_VERY_GOOD";
  if (id === "5000") return "USED_GOOD";
  if (id === "6000") return "USED_ACCEPTABLE";
  if (id === "7000") return "FOR_PARTS_OR_NOT_WORKING";
  return "NEW";
}

export async function createOrReplaceInventoryItem(
  accessToken: string,
  input: EbayInventoryItemInput,
) {
  const product: Record<string, unknown> = {
    title: input.title.slice(0, 80),
    description: input.description,
    aspects: input.aspects,
    imageUrls: input.imageUrls.slice(0, 24),
  };
  if (input.brand) product.brand = input.brand;
  if (input.mpn) product.mpn = [input.mpn];
  if (input.upc && /^\d{12,14}$/.test(input.upc)) {
    product.upc = [input.upc];
  }

  const body: Record<string, unknown> = {
    availability: {
      shipToLocationAvailability: {
        quantity: 1,
      },
    },
    condition: mapCondition("", input.condition),
    product,
  };

  if (
    input.packageWeightLbs != null ||
    input.packageWeightOz != null ||
    input.packageLengthIn != null
  ) {
    body.packageWeightAndSize = {
      weight: {
        value: Number(
          (input.packageWeightLbs || 0) + (input.packageWeightOz || 0) / 16,
        ),
        unit: "POUND",
      },
      dimensions: {
        length: input.packageLengthIn || 10,
        width: input.packageWidthIn || 8,
        height: input.packageDepthIn || 4,
        unit: "INCH",
      },
    };
  }

  const sku = encodeURIComponent(input.sku);
  await ebayFetch(accessToken, `/sell/inventory/v1/inventory_item/${sku}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return { sku: input.sku };
}

export async function createOffer(accessToken: string, input: EbayOfferInput) {
  const body = buildOfferBody(input);
  const json = (await ebayFetch(accessToken, "/sell/inventory/v1/offer", {
    method: "POST",
    body: JSON.stringify(body),
  })) as { offerId?: string };

  return { offerId: String(json.offerId || "") };
}

function buildOfferBody(input: EbayOfferInput): Record<string, unknown> {
  const listingPolicies: Record<string, string> = {};
  if (input.fulfillmentPolicyId) {
    listingPolicies.fulfillmentPolicyId = input.fulfillmentPolicyId;
  }
  if (input.paymentPolicyId) {
    listingPolicies.paymentPolicyId = input.paymentPolicyId;
  }
  if (input.returnPolicyId) {
    listingPolicies.returnPolicyId = input.returnPolicyId;
  }

  const body: Record<string, unknown> = {
    sku: input.sku,
    marketplaceId: input.marketplaceId || "EBAY_US",
    format: input.format || "FIXED_PRICE",
    availableQuantity: Math.max(1, input.quantity),
    categoryId: String(input.categoryId),
    listingDescription: input.listingDescription,
    pricingSummary: {
      price: {
        value: input.price.toFixed(2),
        currency: "USD",
      },
    },
  };

  if (Object.keys(listingPolicies).length) {
    body.listingPolicies = listingPolicies;
  }
  if (input.merchantLocationKey) {
    body.merchantLocationKey = input.merchantLocationKey;
  }
  return body;
}

export async function updateOffer(
  accessToken: string,
  offerId: string,
  input: EbayOfferInput,
) {
  // eBay updateOffer replaces the entire offer — send the full create payload.
  const body = buildOfferBody(input);

  await ebayFetch(
    accessToken,
    `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
  );
  return { offerId };
}

export async function deleteOffer(accessToken: string, offerId: string) {
  try {
    await ebayFetch(
      accessToken,
      `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`,
      { method: "DELETE" },
    );
  } catch {
    // Offer may already be gone — ignore.
  }
}

export async function withdrawOffer(accessToken: string, offerId: string) {
  try {
    await ebayFetch(
      accessToken,
      `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/withdraw`,
      { method: "POST", body: "{}" },
    );
  } catch {
    // Not published / already withdrawn — ignore.
  }
}

async function clearOffersForSku(accessToken: string, sku: string) {
  const existing = await getOffersForSku(accessToken, sku);
  for (const offer of existing) {
    if (!offer.offerId) continue;
    if (String(offer.status || "").toUpperCase() === "PUBLISHED") {
      await withdrawOffer(accessToken, offer.offerId);
    }
    await deleteOffer(accessToken, offer.offerId);
  }
}

/**
 * Ensure a default US warehouse location exists for Inventory offers.
 * eBay requires at least one location before offers can be published;
 * Sandbox often rejects offers when none exist.
 */
export async function ensureDefaultInventoryLocation(
  accessToken: string,
): Promise<string> {
  const key = "higlou_warehouse_us";

  // Already exists?
  try {
    await ebayFetch(
      accessToken,
      `/sell/inventory/v1/location/${encodeURIComponent(key)}`,
      { method: "GET" },
    );
    return key;
  } catch {
    // create below
  }

  const body = {
    name: "Higlou Warehouse",
    merchantLocationStatus: "ENABLED",
    locationTypes: ["WAREHOUSE"],
    location: {
      address: {
        addressLine1: "100 Main St",
        city: "Logansport",
        stateOrProvince: "IN",
        postalCode: "46947",
        country: "US",
      },
    },
  };

  try {
    await ebayFetch(
      accessToken,
      `/sell/inventory/v1/location/${encodeURIComponent(key)}`,
      { method: "POST", body: JSON.stringify(body) },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    // Already created by a parallel request — treat as success.
    if (!/already exists|same location|duplicate/i.test(message)) {
      throw error;
    }
  }
  return key;
}

/** Opt seller into business policies (needed for reliable Sandbox Inventory offers). */
export async function ensureSellingPolicyOptIn(accessToken: string) {
  const cfg = getEbayConfig();
  try {
    await fetch(`${cfg.apiBase}/sell/account/v1/program/opt_in`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Content-Language": "en-US",
        "Accept-Language": "en-US",
      },
      body: JSON.stringify({ programType: "SELLING_POLICY_MANAGEMENT" }),
    });
  } catch {
    // Non-fatal — seller may already be opted in.
  }
}

/**
 * Create a fresh unpublished offer for a SKU.
 * Never updates stale offers (25713). Clears prior offers first.
 */
export async function upsertOfferForSku(
  accessToken: string,
  input: EbayOfferInput,
): Promise<{ offerId: string }> {
  await ensureSellingPolicyOptIn(accessToken);
  const locationKey =
    input.merchantLocationKey ||
    (await ensureDefaultInventoryLocation(accessToken));
  const offerInput: EbayOfferInput = {
    ...input,
    merchantLocationKey: locationKey,
  };

  await clearOffersForSku(accessToken, offerInput.sku);

  try {
    return await createOffer(accessToken, offerInput);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      !/already exists|Offer entity already exists|not available|25713/i.test(
        message,
      )
    ) {
      throw error;
    }

    await clearOffersForSku(accessToken, offerInput.sku);
    try {
      return await createOffer(accessToken, offerInput);
    } catch (secondError) {
      // Last resort: new SKU so Sandbox inventory isn't stuck on a dead offer.
      const freshSku = `${offerInput.sku}`.slice(0, 40) + `-H${Date.now().toString(36)}`;
      const freshInput: EbayOfferInput = { ...offerInput, sku: freshSku };
      // Inventory item must exist for the new SKU — caller already wrote original SKU.
      // Re-throw original if this path isn't usable without re-PUT inventory.
      const secondMessage =
        secondError instanceof Error ? secondError.message : message;
      throw new Error(
        `${secondMessage} Try changing the SKU slightly and Create draft again.`,
      );
    }
  }
}

export async function publishOffer(accessToken: string, offerId: string) {
  const json = (await ebayFetch(
    accessToken,
    `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`,
    { method: "POST", body: "{}" },
  )) as { listingId?: string };
  return { listingId: String(json.listingId || "") };
}

export async function getOffersForSku(accessToken: string, sku: string) {
  try {
    const json = (await ebayFetch(
      accessToken,
      `/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`,
      { method: "GET" },
    )) as { offers?: Array<{ offerId?: string; status?: string }> };
    return json.offers || [];
  } catch {
    return [];
  }
}
