import type { ProductListing } from "@/types/product";
import { enrichItemSpecificsForExport } from "@/lib/ebay/enrich-export-specifics";
import { estimatePackageAndShipping } from "@/lib/ebay/package-shipping";
import type { EbayAspects, EbayInventoryItemInput, EbayOfferInput } from "@/lib/ebay/inventory-api";

export function listingToEbayAspects(listing: ProductListing): EbayAspects {
  const enriched = enrichItemSpecificsForExport({
    categoryId: listing.categoryId,
    categoryName: listing.categoryName,
    itemSpecifics: listing.itemSpecifics,
    brand: listing.brand,
    size: listing.size,
    model: listing.model,
    mpn: listing.mpn,
    productType: listing.productType || listing.type,
    title: listing.title,
    colors: listing.colors,
    materials: listing.materials,
    features: listing.features,
  });

  const aspects: EbayAspects = {};
  for (const [key, value] of Object.entries(enriched.columns)) {
    const name = key.replace(/^C:/, "").trim();
    const trimmed = String(value || "").trim();
    if (!name || !trimmed) continue;
    aspects[name] = trimmed.split(/\s*\|\s*|\s*,\s*/).map((v) => v.trim()).filter(Boolean);
  }
  return aspects;
}

export function listingToInventoryItem(
  listing: ProductListing,
  opts?: { quantityOverride?: number },
): EbayInventoryItemInput {
  const pkg = estimatePackageAndShipping({
    title: listing.title,
    productType: listing.productType || listing.type,
    size: listing.size,
    categoryName: listing.categoryName,
    brand: listing.brand,
    quantity: listing.quantity,
  });
  const imageUrls = listing.images
    .map((img) => img.url)
    .filter((url) => /^https:\/\//i.test(url));

  return {
    sku: listing.sku,
    title: listing.title,
    description: listing.descriptionHtml || listing.descriptionSummary,
    imageUrls,
    aspects: listingToEbayAspects(listing),
    condition: listing.condition || "New",
    brand: listing.brand || undefined,
    mpn: listing.mpn || undefined,
    upc: listing.upc || undefined,
    packageWeightLbs: pkg.weightLbs,
    packageWeightOz: pkg.weightOz,
    packageLengthIn: pkg.lengthIn,
    packageWidthIn: pkg.widthIn,
    packageDepthIn: pkg.depthIn,
  };
}

export function listingToOfferInput(
  listing: ProductListing,
  policies: {
    fulfillmentPolicyId?: string;
    paymentPolicyId?: string;
    returnPolicyId?: string;
  },
): EbayOfferInput {
  if (!listing.price || listing.price <= 0) {
    throw new Error("Price is required to create an eBay offer");
  }
  if (!/^\d{3,8}$/.test(String(listing.categoryId || "").trim())) {
    throw new Error("Numeric eBay category ID is required");
  }

  return {
    sku: listing.sku,
    marketplaceId: "EBAY_US",
    categoryId: String(listing.categoryId).trim(),
    price: listing.price,
    quantity: Math.max(1, listing.quantity || 1),
    listingDescription: listing.descriptionHtml || listing.descriptionSummary,
    fulfillmentPolicyId: policies.fulfillmentPolicyId || undefined,
    paymentPolicyId: policies.paymentPolicyId || undefined,
    returnPolicyId: policies.returnPolicyId || undefined,
  };
}
