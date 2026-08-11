import type { ProductListing } from "@/types/product";
import {
  enrichItemSpecificsForExport,
  resolveBrandMpn,
} from "@/lib/ebay/enrich-export-specifics";
import { estimatePackageAndShipping } from "@/lib/ebay/package-shipping";
import { synthesizeDescriptionSummary } from "@/lib/ebay/description-html";
import type {
  EbayAspects,
  EbayInventoryItemInput,
  EbayOfferInput,
} from "@/lib/ebay/inventory-api";

/** eBay Inventory API product.description must be 1–4000 chars. */
const EBAY_INVENTORY_DESCRIPTION_MAX = 4000;

function clampEbayInventoryDescription(listing: ProductListing): string {
  const summary = synthesizeDescriptionSummary(listing).trim();
  const html = String(listing.descriptionHtml || "").trim();
  // Prefer short plain summary for inventory item; full HTML goes on the offer.
  let text =
    summary ||
    html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  if (!text) text = String(listing.title || "Product").trim() || "Product";
  if (text.length > EBAY_INVENTORY_DESCRIPTION_MAX) {
    text = `${text.slice(0, EBAY_INVENTORY_DESCRIPTION_MAX - 1).trimEnd()}…`;
  }
  return text;
}

function clampEbayListingDescription(listing: ProductListing): string {
  const html = String(listing.descriptionHtml || "").trim();
  const summary = synthesizeDescriptionSummary(listing).trim();
  // Offer listingDescription allows long HTML; inventory product.description is capped separately.
  return (
    html ||
    summary ||
    String(listing.title || "Product").trim() ||
    "Product"
  );
}

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
    aspects[name] = trimmed
      .split(/\s*\|\s*|\s*,\s*/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return aspects;
}

export function listingToInventoryItem(
  listing: ProductListing,
  _opts?: { quantityOverride?: number },
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
    .filter((url) => /^https:\/\//i.test(url))
    .map((url) => url.trim())
    .filter(Boolean);

  const aspects = listingToEbayAspects(listing);
  const brand =
    aspects.Brand?.[0]?.trim() ||
    String(listing.brand || "").trim() ||
    "Unbranded";
  const mpn =
    aspects.MPN?.[0]?.trim() ||
    resolveBrandMpn({
      brand,
      mpn: listing.mpn,
      model: listing.model,
    });
  aspects.Brand = [brand];
  aspects.MPN = [mpn];

  return {
    sku: listing.sku,
    title: listing.title,
    description: clampEbayInventoryDescription(listing),
    imageUrls,
    aspects,
    condition: listing.condition || "New",
    brand,
    mpn,
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
    listingDescription: clampEbayListingDescription(listing),
    fulfillmentPolicyId: policies.fulfillmentPolicyId || undefined,
    paymentPolicyId: policies.paymentPolicyId || undefined,
    returnPolicyId: policies.returnPolicyId || undefined,
  };
}
