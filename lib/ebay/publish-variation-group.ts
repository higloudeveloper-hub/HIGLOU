import type { ProductListing } from "@/types/product";
import type { ListingVariationSet } from "@/lib/listing/variations";
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
import { ensureInferredApparelAspects } from "@/lib/ebay/infer-voltage";

export type VariationGroupPlan = {
  groupKey: string;
  variantSkus: string[];
  specifications: Array<{ name: string; values: string[] }>;
};

export function planVariationGroup(
  set: ListingVariationSet,
  parentSku: string,
): VariationGroupPlan | null {
  if (!set?.variants || set.variants.length < 2) return null;

  const specifications = (set.axisNames.length
    ? set.axisNames
    : [...new Set(set.variants.flatMap((row) => Object.keys(row.aspects)))]
  )
    .map((name) => ({
      name,
      values: [
        ...new Set(
          set.variants.map((row) => String(row.aspects[name] || "").trim()).filter(Boolean),
        ),
      ],
    }))
    .filter((row) => row.name && row.values.length >= 2);

  if (!specifications.length) return null;

  const seen = new Set<string>();
  const combos = new Set<string>();
  const variantSkus: string[] = [];
  for (const variant of set.variants) {
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

function isEbay25001(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /25001|core inventory service internal/i.test(message);
}

export async function publishEbayVariationGroup(opts: {
  accessToken: string;
  listing: ProductListing;
  set: ListingVariationSet;
  inventory: EbayInventoryItemInput;
  offer: EbayOfferInput;
  aspectCardinality?: Map<string, "SINGLE" | "MULTI">;
  live: boolean;
}): Promise<{ offerId: string; listingId: string }> {
  const plan = planVariationGroup(opts.set, opts.listing.sku);
  if (!plan) {
    throw new Error(
      "Higlou read the Amazon options, but eBay needs at least two complete Color/Size combinations.",
    );
  }

  if (!opts.inventory.aspects) opts.inventory.aspects = {};
  ensureInferredApparelAspects(opts.inventory.aspects, {
    title: opts.listing.title,
    productType: opts.listing.productType || opts.listing.type,
    categoryName: opts.listing.categoryName,
    categoryId: opts.listing.categoryId,
  });

  const axisNames = plan.specifications.map((row) => row.name);
  const skuToVariant = new Map(
    opts.set.variants.map((row) => [
      toEbayInventorySku(row.sku || `AMZ-${row.asin}`),
      row,
    ]),
  );

  // eBay 25001: items first, then the group, then offers. Never attach Amazon
  // CDN photos to a variant (parent inventory.imageUrls are already on EPS).
  for (const sku of plan.variantSkus) {
    const variant = skuToVariant.get(sku);
    const aspects = { ...(opts.inventory.aspects || {}) };
    for (const name of axisNames) {
      const value = variant?.aspects[name];
      if (value) aspects[name] = [value];
    }
    await createOrReplaceInventoryItem(
      opts.accessToken,
      {
        ...opts.inventory,
        sku,
        aspects,
        imageUrls: opts.inventory.imageUrls,
      },
      { aspectCardinality: opts.aspectCardinality },
    );
    await clearOffersForSku(opts.accessToken, sku);
  }

  await createOrReplaceInventoryItemGroup(opts.accessToken, {
    inventoryItemGroupKey: plan.groupKey,
    variantSKUs: plan.variantSkus,
    title: opts.inventory.title,
    description: opts.inventory.description,
    imageUrls: opts.inventory.imageUrls,
    variesBy: {
      specifications: plan.specifications,
    },
  });

  let offerId = "";
  for (const sku of plan.variantSkus) {
    const created = await upsertOfferForSku(opts.accessToken, {
      ...opts.offer,
      sku,
    });
    if (!offerId) offerId = created.offerId;
  }

  if (!opts.live) {
    return { offerId, listingId: "" };
  }

  try {
    const published = await publishOfferByInventoryItemGroup(
      opts.accessToken,
      plan.groupKey,
    );
    return { offerId, listingId: published.listingId };
  } catch (error) {
    if (!isEbay25001(error)) throw error;
    throw new Error(
      "eBay hit a variation glitch (25001). Wait a few seconds and Try again. Do not change the title or prices first.",
    );
  }
}
