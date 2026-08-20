import { getEbayConfig } from "@/lib/ebay/config";
import { sanitizeEbayAspects } from "@/lib/ebay/sanitize-aspects";
import { HIGLOU_WAREHOUSE } from "@/config/warehouse";
import { validateBarcode } from "@/lib/barcode/validators";
import { toEbayListingTitle, toEbayInventorySku } from "@/lib/ebay/listing-helpers";
import { normalizeEbayBrand } from "@/lib/ebay/infer-voltage";

/**
 * Only send UPC/EAN values eBay will accept (valid GS1 checksum).
 * Bad OCR/barcode reads cause error 25002 — omit them instead.
 */
export function sanitizeEbayUpc(raw?: string | null): string | undefined {
  const value = String(raw || "")
    .replace(/\s+/g, "")
    .trim();
  if (!value) return undefined;
  if (/^(does\s*not\s*apply|n\/?a|none|null)$/i.test(value)) {
    return undefined;
  }
  const checked = validateBarcode(value, { requireChecksum: true });
  if (!checked.ok) return undefined;
  if (!["UPC_A", "EAN_8", "EAN_13", "UPC_E"].includes(checked.format)) {
    return undefined;
  }
  // Prefer expanded UPC-A when we only have UPC-E.
  if (checked.format === "UPC_E") {
    const expanded = validateBarcode(checked.value, { requireChecksum: true });
    return expanded.ok && /^\d{12}$/.test(expanded.value)
      ? expanded.value
      : undefined;
  }
  return checked.value;
}

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
  /** Buyer-paid domestic shipping override (flat rate policy). */
  domesticShippingCostUsd?: number;
  /** eBay Store folder paths, e.g. ["/Plumbing/Pumps"]. */
  storeCategoryNames?: string[];
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
  options?: { aspectCardinality?: Map<string, "SINGLE" | "MULTI"> },
) {
  const product: Record<string, unknown> = {
    title: toEbayListingTitle(input.title),
    description: input.description,
    imageUrls: input.imageUrls.slice(0, 24),
  };

  // BrandMPN (25002): product.brand + product.mpn must both be present for branded items.
  // Production rejects product.mpn as string[] (2004 serialize) — send a plain string.
  const brand = normalizeEbayBrand(
    String(input.brand || "") || String(input.aspects?.Brand?.[0] || ""),
  );
  const mpnRaw =
    String(input.mpn || "").trim() ||
    String(input.aspects?.MPN?.[0] || "").trim();
  const mpnDisplay = normalizeEbayMpnDisplay(mpnRaw, brand);
  const mpnProduct = normalizeEbayMpnProduct(mpnDisplay);

  product.brand = brand;
  product.mpn = mpnProduct;

  // Aspects: enforce Taxonomy SINGLE/MULTI (Color must be one value — eBay 25002).
  const aspects = sanitizeEbayAspects(
    {
      ...(input.aspects || {}),
      Brand: [brand],
      MPN: [mpnProduct],
    },
    options?.aspectCardinality,
  );
  aspects.Brand = [brand];
  aspects.MPN = [mpnProduct];
  // Never send invalid UPC in aspects either (same 25002 failure mode).
  for (const key of Object.keys(aspects)) {
    if (!/^upc$/i.test(key)) continue;
    const cleaned = sanitizeEbayUpc(aspects[key]?.[0]);
    if (cleaned) aspects[key] = [cleaned];
    else delete aspects[key];
  }
  product.aspects = aspects;

  const upc = sanitizeEbayUpc(input.upc);
  if (upc) {
    product.upc = [upc];
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
        length: input.packageLengthIn || 1,
        width: input.packageWidthIn || 1,
        height: input.packageDepthIn || 1,
        unit: "INCH",
      },
    };
  }

  const sku = encodeURIComponent(toEbayInventorySku(input.sku));
  await ebayFetch(accessToken, `/sell/inventory/v1/inventory_item/${sku}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return { sku: toEbayInventorySku(input.sku) };
}

/** Display / aspect MPN (keeps readable form when valid). */
export function normalizeEbayMpnDisplay(mpn: string, brand: string): string {
  const raw = String(mpn || "").trim();
  if (raw && !/^(n\/?a|none|null|unknown|-)$/i.test(raw)) {
    return raw.slice(0, 65);
  }
  if (/^(unbranded|generic|does\s*not\s*apply)$/i.test(brand)) {
    return "Does Not Apply";
  }
  return "Does Not Apply";
}

/**
 * product.mpn identifier string for Inventory API.
 * Strip spaces (Home Depot "1008 481 828" → "1008481828") — spaced values
 * often fail BrandMPN validation.
 */
export function normalizeEbayMpnProduct(mpnDisplay: string): string {
  const compact = String(mpnDisplay || "")
    .trim()
    .replace(/\s+/g, "")
    .slice(0, 65);
  if (!compact) return "DoesNotApply";
  if (/^doesnotapply$/i.test(compact)) return "Does Not Apply";
  return compact;
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
  if (
    typeof input.domesticShippingCostUsd === "number" &&
    input.domesticShippingCostUsd > 0
  ) {
    body.shippingCostOverrides = [
      {
        priority: 1,
        shippingServiceType: "DOMESTIC",
        shippingCost: {
          value: input.domesticShippingCostUsd.toFixed(2),
          currency: "USD",
        },
        additionalShippingCost: { value: "0.00", currency: "USD" },
      },
    ];
  }
  if (input.merchantLocationKey) {
    body.merchantLocationKey = input.merchantLocationKey;
  }
  if (input.storeCategoryNames?.length) {
    body.storeCategoryNames = input.storeCategoryNames
      .map((p) => String(p || "").trim())
      .filter(Boolean)
      .slice(0, 2);
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

export async function clearOffersForSku(accessToken: string, sku: string) {
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
 * Ensure Higlou ship-from location exists (2525 Market St, Logansport, IN).
 * Required before offers and helps avoid LOGISTICS_INFO_IS_MISSING on policies.
 */
export async function ensureDefaultInventoryLocation(
  accessToken: string,
): Promise<string> {
  const key = HIGLOU_WAREHOUSE.merchantLocationKey;

  const body = {
    name: HIGLOU_WAREHOUSE.name,
    merchantLocationStatus: "ENABLED",
    locationTypes: ["WAREHOUSE"],
    location: {
      address: {
        addressLine1: HIGLOU_WAREHOUSE.addressLine1,
        city: HIGLOU_WAREHOUSE.city,
        stateOrProvince: HIGLOU_WAREHOUSE.stateOrProvince,
        postalCode: HIGLOU_WAREHOUSE.postalCode,
        country: HIGLOU_WAREHOUSE.country,
      },
    },
  };

  // Already exists — refresh address details.
  try {
    await ebayFetch(
      accessToken,
      `/sell/inventory/v1/location/${encodeURIComponent(key)}`,
      { method: "GET" },
    );
    try {
      await ebayFetch(
        accessToken,
        `/sell/inventory/v1/location/${encodeURIComponent(key)}/update_location_details`,
        { method: "POST", body: JSON.stringify(body) },
      );
    } catch {
      // Some accounts reject update_location_details — location still usable.
    }
    return key;
  } catch {
    // create below
  }

  try {
    await ebayFetch(
      accessToken,
      `/sell/inventory/v1/location/${encodeURIComponent(key)}`,
      { method: "POST", body: JSON.stringify(body) },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
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
      const freshSku = `${offerInput.sku}`
        .replace(/[^A-Za-z0-9]/g, "")
        .slice(0, 40);
      const retrySku = `${freshSku}H${Date.now().toString(36)}`.slice(0, 50);
      const freshInput: EbayOfferInput = { ...offerInput, sku: retrySku };
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

/** Find Inventory offerId for a published listing (ItemID). */
export async function findOfferIdByListingId(
  accessToken: string,
  listingId: string,
): Promise<string | null> {
  const id = String(listingId || "").trim();
  if (!id || !/^\d+$/.test(id)) return null;
  try {
    const json = (await ebayFetch(
      accessToken,
      `/sell/inventory/v1/offer?listing_ids=${encodeURIComponent(id)}`,
      { method: "GET" },
    )) as { offers?: Array<{ offerId?: string }> };
    const offerId = String(json.offers?.[0]?.offerId || "").trim();
    return offerId || null;
  } catch {
    return null;
  }
}

export async function getOffer(
  accessToken: string,
  offerId: string,
): Promise<Record<string, unknown>> {
  return (await ebayFetch(
    accessToken,
    `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`,
    { method: "GET" },
  )) as Record<string, unknown>;
}

/**
 * Set Store folders on an Inventory-managed listing (Trading revise fails with
 * "Inventory-based listing management is not currently supported").
 */
export async function updateOfferStoreCategories(
  accessToken: string,
  offerId: string,
  storeCategoryNames: string[],
): Promise<void> {
  const paths = storeCategoryNames
    .map((p) => String(p || "").trim())
    .filter(Boolean)
    .slice(0, 2);
  if (!paths.length) {
    throw new Error("At least one store category path is required");
  }

  const current = await getOffer(accessToken, offerId);
  const pricing = (current.pricingSummary || {}) as {
    price?: { value?: string; currency?: string };
  };
  const priceValue = Number(pricing.price?.value || 0);
  const policies = (current.listingPolicies || {}) as Record<string, string>;
  const sku = String(current.sku || "").trim();
  const categoryId = String(current.categoryId || "").trim();
  if (!sku || !categoryId || !(priceValue > 0)) {
    throw new Error(
      "Cannot update Store folders: offer is missing sku/category/price",
    );
  }

  const input: EbayOfferInput = {
    sku,
    marketplaceId: String(current.marketplaceId || "EBAY_US"),
    format: "FIXED_PRICE",
    categoryId,
    price: priceValue,
    quantity: Math.max(1, Number(current.availableQuantity) || 1),
    listingDescription:
      typeof current.listingDescription === "string"
        ? current.listingDescription
        : undefined,
    fulfillmentPolicyId: policies.fulfillmentPolicyId,
    paymentPolicyId: policies.paymentPolicyId,
    returnPolicyId: policies.returnPolicyId,
    merchantLocationKey:
      typeof current.merchantLocationKey === "string"
        ? current.merchantLocationKey
        : undefined,
    storeCategoryNames: paths,
  };

  await updateOffer(accessToken, offerId, input);
}

export async function getOffersForSku(accessToken: string, sku: string) {
  const safe = toEbayInventorySku(sku);
  try {
    const json = (await ebayFetch(
      accessToken,
      `/sell/inventory/v1/offer?sku=${encodeURIComponent(safe)}`,
      { method: "GET" },
    )) as { offers?: Array<{ offerId?: string; status?: string }> };
    return json.offers || [];
  } catch {
    return [];
  }
}

export async function createOrReplaceInventoryItemGroup(
  accessToken: string,
  input: {
    inventoryItemGroupKey: string;
    variantSKUs: string[];
    title: string;
    description: string;
    imageUrls: string[];
    variesBy: {
      specifications: Array<{ name: string; values: string[] }>;
      aspectsImageVariesBy?: string[];
    };
  },
) {
  const key = toEbayInventorySku(input.inventoryItemGroupKey);
  const body = {
    inventoryItemGroupKey: key,
    variantSKUs: input.variantSKUs.map((sku) => toEbayInventorySku(sku)),
    title: toEbayListingTitle(input.title),
    description: input.description,
    imageUrls: input.imageUrls.slice(0, 24),
    variesBy: input.variesBy,
  };
  await ebayFetch(
    accessToken,
    `/sell/inventory/v1/inventory_item_group/${encodeURIComponent(key)}`,
    { method: "PUT", body: JSON.stringify(body) },
  );
  return { inventoryItemGroupKey: key };
}

export async function publishOfferByInventoryItemGroup(
  accessToken: string,
  inventoryItemGroupKey: string,
  marketplaceId = "EBAY_US",
) {
  const json = (await ebayFetch(
    accessToken,
    `/sell/inventory/v1/offer/publish_by_inventory_item_group`,
    {
      method: "POST",
      body: JSON.stringify({
        inventoryItemGroupKey: toEbayInventorySku(inventoryItemGroupKey),
        marketplaceId,
      }),
    },
  )) as { listingId?: string };
  return { listingId: String(json.listingId || "") };
}
