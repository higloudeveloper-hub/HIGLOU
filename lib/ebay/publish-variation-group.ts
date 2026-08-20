import type { ProductListing } from "@/types/product";
import {
  isVariantSelected,
  type ListingVariationSet,
} from "@/lib/listing/variations";
import {
  clearOffersForSku,
  createOrReplaceInventoryItem,
  createOrReplaceInventoryItemGroup,
  publishOfferByInventoryItemGroup,
  upsertOfferForSku,
  type EbayInventoryItemInput,
  type EbayOfferInput,
} from "@/lib/ebay/inventory-api";
import { toEbayInventorySku } from "@/lib/ebay/listing-helpers";
import {
  ensureEbayBrandAspect,
  ensureInferredApparelAspects,
  inferFilledAspectForEbayError,
  parseMissingAspectFromEbayError,
} from "@/lib/ebay/infer-voltage";

export type VariationGroupPlan = {
  groupKey: string;
  variantSkus: string[];
  specifications: Array<{ name: string; values: string[] }>;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "");
}

function isEbay25001(error: unknown): boolean {
  return /25001|core inventory service internal/i.test(errorText(error));
}

export function planVariationGroup(
  set: ListingVariationSet,
  parentSku: string,
): VariationGroupPlan | null {
  const variants = (set?.variants || []).filter(isVariantSelected);
  if (variants.length < 2) return null;

  const specifications = (set.axisNames.length
    ? set.axisNames
    : [...new Set(variants.flatMap((row) => Object.keys(row.aspects)))]
  )
    .map((name) => ({
      name,
      values: [
        ...new Set(
          variants.map((row) => String(row.aspects[name] || "").trim()).filter(Boolean),
        ),
      ],
    }))
    .filter((row) => row.name && row.values.length >= 2);

  if (!specifications.length) return null;

  const seen = new Set<string>();
  const combos = new Set<string>();
  const variantSkus: string[] = [];
  for (const variant of variants) {
    const sku = toEbayInventorySku(variant.sku || `AMZ-${variant.asin}`);
    if (seen.has(sku)) continue;
    const hasEveryAxis = specifications.every((axis) =>
      String(variant.aspects[axis.name] || "").trim(),
    );
    if (!hasEveryAxis) continue;
    const combo = specifications
      .map((axis) => String(variant.aspects[axis.name] || "").trim())
      .join("|");
    if (combos.has(combo)) continue;
    seen.add(sku);
    combos.add(combo);
    variantSkus.push(sku);
  }
  if (variantSkus.length < 2) return null;

  const groupKey = `${toEbayInventorySku(parentSku || variantSkus[0] || "ITEM")}G`.slice(
    0,
    50,
  );
  return { groupKey, variantSkus, specifications };
}

function planFromAcceptedSkus(
  set: ListingVariationSet,
  parentSku: string,
  acceptedSkus: string[],
): VariationGroupPlan | null {
  const want = new Set(acceptedSkus);
  return planVariationGroup(
    {
      axisNames: set.axisNames,
      variants: set.variants.filter((row) =>
        want.has(toEbayInventorySku(row.sku || `AMZ-${row.asin}`)),
      ),
    },
    parentSku,
  );
}

async function putVariantInventory(opts: {
  accessToken: string;
  listing: ProductListing;
  inventory: EbayInventoryItemInput;
  sku: string;
  aspects: Record<string, string[]>;
  aspectCardinality?: Map<string, "SINGLE" | "MULTI">;
}): Promise<void> {
  const payload = {
    ...opts.inventory,
    sku: opts.sku,
    aspects: opts.aspects,
    imageUrls: opts.inventory.imageUrls,
  };
  ensureEbayBrandAspect(payload.aspects, opts.listing.brand || opts.inventory.brand);
  payload.brand = payload.aspects.Brand?.[0] || "Unbranded";
  try {
    await createOrReplaceInventoryItem(opts.accessToken, payload, {
      aspectCardinality: opts.aspectCardinality,
    });
    return;
  } catch (error) {
    const message = errorText(error);
    const missingAspect = parseMissingAspectFromEbayError(message);
    if (!/25002/i.test(message) || !missingAspect) throw error;
    const hay = [
      opts.listing.title,
      opts.listing.productType,
      opts.listing.type,
      opts.listing.categoryName,
      opts.listing.brand,
      opts.listing.model,
      opts.listing.size,
    ]
      .filter(Boolean)
      .join(" ");
    const filled = inferFilledAspectForEbayError(missingAspect, hay, {
      title: opts.listing.title,
      brand: opts.listing.brand,
      model: opts.listing.model,
      mpn: opts.listing.mpn,
      productType: opts.listing.productType || opts.listing.type,
      categoryName: opts.listing.categoryName,
      categoryId: opts.listing.categoryId,
      department: opts.listing.department,
      packageLengthIn: opts.listing.packageLengthIn,
      packageWidthIn: opts.listing.packageWidthIn,
      packageDepthIn: opts.listing.packageDepthIn,
    });
    if (!filled) throw error;
    opts.inventory.aspects = {
      ...(opts.inventory.aspects || {}),
      [missingAspect]: [filled],
    };
    payload.aspects = {
      ...opts.aspects,
      [missingAspect]: [filled],
    };
    await createOrReplaceInventoryItem(opts.accessToken, payload, {
      aspectCardinality: opts.aspectCardinality,
    });
  }
}

export async function publishEbayVariationGroup(opts: {
  accessToken: string;
  listing: ProductListing;
  set: ListingVariationSet;
  inventory: EbayInventoryItemInput;
  offer: EbayOfferInput;
  aspectCardinality?: Map<string, "SINGLE" | "MULTI">;
  live: boolean;
}): Promise<{ offerId: string; listingId: string; skipped?: number }> {
  const planned = planVariationGroup(opts.set, opts.listing.sku);
  if (!planned) {
    throw new Error(
      "Pick at least two complete Color/Size options so eBay can show a dropdown.",
    );
  }

  if (!opts.inventory.aspects) opts.inventory.aspects = {};
  ensureInferredApparelAspects(opts.inventory.aspects, {
    title: opts.listing.title,
    productType: opts.listing.productType || opts.listing.type,
    categoryName: opts.listing.categoryName,
    categoryId: opts.listing.categoryId,
  });

  const skuToVariant = new Map(
    opts.set.variants.map((row) => [
      toEbayInventorySku(row.sku || `AMZ-${row.asin}`),
      row,
    ]),
  );

  const acceptedSkus: string[] = [];
  // eBay 25001: items first, then the group, then offers. Never attach Amazon
  // CDN photos to a variant (parent inventory.imageUrls are already on EPS).
  for (let i = 0; i < planned.variantSkus.length; i += 1) {
    const sku = planned.variantSkus[i]!;
    const variant = skuToVariant.get(sku);
    const aspects = { ...(opts.inventory.aspects || {}) };
    for (const axis of planned.specifications) {
      const value = variant?.aspects[axis.name];
      if (value) aspects[axis.name] = [value];
    }
    try {
      await putVariantInventory({
        accessToken: opts.accessToken,
        listing: opts.listing,
        inventory: opts.inventory,
        sku,
        aspects,
        aspectCardinality: opts.aspectCardinality,
      });
      await clearOffersForSku(opts.accessToken, sku);
      acceptedSkus.push(sku);
    } catch (error) {
      console.warn(
        "[ebay/publish] skipped variant",
        sku,
        errorText(error),
      );
    }
    if (i < planned.variantSkus.length - 1) await sleep(250);
  }

  const plan = planFromAcceptedSkus(opts.set, opts.listing.sku, acceptedSkus);
  if (!plan) {
    throw new Error(
      acceptedSkus.length
        ? "eBay could not take enough of those options together. Uncheck a few sizes and try again."
        : "eBay rejected these options. Uncheck a color or size and try again.",
    );
  }

  const putGroup = async () =>
    createOrReplaceInventoryItemGroup(opts.accessToken, {
      inventoryItemGroupKey: plan.groupKey,
      variantSKUs: plan.variantSkus,
      title: opts.inventory.title,
      description: opts.inventory.description,
      imageUrls: opts.inventory.imageUrls,
      variesBy: {
        specifications: plan.specifications,
      },
    });

  try {
    await putGroup();
  } catch (error) {
    if (!isEbay25001(error)) throw error;
    await sleep(1500);
    await putGroup();
  }

  let offerId = "";
  for (const sku of plan.variantSkus) {
    const created = await upsertOfferForSku(opts.accessToken, {
      ...opts.offer,
      sku,
    });
    if (!offerId) offerId = created.offerId;
  }

  const skipped = planned.variantSkus.length - plan.variantSkus.length;

  if (!opts.live) {
    return { offerId, listingId: "", skipped };
  }

  try {
    const published = await publishOfferByInventoryItemGroup(
      opts.accessToken,
      plan.groupKey,
    );
    return { offerId, listingId: published.listingId, skipped };
  } catch (error) {
    if (!isEbay25001(error)) throw error;
    await sleep(1500);
    try {
      const published = await publishOfferByInventoryItemGroup(
        opts.accessToken,
        plan.groupKey,
      );
      return { offerId, listingId: published.listingId, skipped };
    } catch {
      throw new Error(
        "eBay hit a variation glitch (25001). Wait a few seconds and Try again. Do not change the title or prices first.",
      );
    }
  }
}
