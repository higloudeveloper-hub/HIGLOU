import type { ProductListing } from "@/types/product";
import type { ListingVariationSet } from "@/lib/listing/variations";
import {
  createOrReplaceInventoryItem,
  createOrReplaceInventoryItemGroup,
  publishOfferByInventoryItemGroup,
  upsertOfferForSku,
  type EbayInventoryItemInput,
  type EbayOfferInput,
} from "@/lib/ebay/inventory-api";
import { toEbayInventorySku } from "@/lib/ebay/listing-helpers";

export async function publishEbayVariationGroup(opts: {
  accessToken: string;
  listing: ProductListing;
  set: ListingVariationSet;
  inventory: EbayInventoryItemInput;
  offer: EbayOfferInput;
  aspectCardinality?: Map<string, "SINGLE" | "MULTI">;
  live: boolean;
}): Promise<{ offerId: string; listingId: string }> {
  const groupKey = `${toEbayInventorySku(opts.listing.sku || opts.set.variants[0]?.sku || "ITEM")}G`.slice(
    0,
    50,
  );
  const variantSkus: string[] = [];

  for (const variant of opts.set.variants) {
    const sku = toEbayInventorySku(variant.sku || `AMZ-${variant.asin}`);
    variantSkus.push(sku);
    const aspects = { ...(opts.inventory.aspects || {}) };
    for (const [name, value] of Object.entries(variant.aspects)) {
      if (value) aspects[name] = [value];
    }
    await createOrReplaceInventoryItem(
      opts.accessToken,
      {
        ...opts.inventory,
        sku,
        aspects,
        imageUrls: variant.imageUrls.length
          ? variant.imageUrls
          : opts.inventory.imageUrls,
      },
      { aspectCardinality: opts.aspectCardinality },
    );
    await upsertOfferForSku(opts.accessToken, {
      ...opts.offer,
      sku,
    });
  }

  const specifications = opts.set.axisNames
    .map((name) => ({
      name,
      values: [
        ...new Set(
          opts.set.variants.map((row) => row.aspects[name]).filter(Boolean),
        ),
      ],
    }))
    .filter((row) => row.values.length >= 2);

  await createOrReplaceInventoryItemGroup(opts.accessToken, {
    inventoryItemGroupKey: groupKey,
    variantSKUs: variantSkus,
    title: opts.inventory.title,
    description: opts.offer.listingDescription || opts.inventory.description,
    imageUrls: opts.inventory.imageUrls,
    variesBy: {
      specifications,
      aspectsImageVariesBy: specifications.some((row) => row.name === "Color")
        ? ["Color"]
        : specifications[0]
          ? [specifications[0].name]
          : undefined,
    },
  });

  if (!opts.live) {
    return { offerId: "", listingId: "" };
  }

  const published = await publishOfferByInventoryItemGroup(
    opts.accessToken,
    groupKey,
  );
  return { offerId: "", listingId: published.listingId };
}
