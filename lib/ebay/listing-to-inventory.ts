import type { ProductListing } from "@/types/product";
import {
  enrichItemSpecificsForExport,
  resolveBrandMpn,
} from "@/lib/ebay/enrich-export-specifics";
import { resolveListingPackage } from "@/lib/ebay/package-shipping";
import { synthesizeDescriptionSummary } from "@/lib/ebay/description-html";
import type {
  EbayAspects,
  EbayInventoryItemInput,
  EbayOfferInput,
} from "@/lib/ebay/inventory-api";
import { sanitizeEbayAspects } from "@/lib/ebay/sanitize-aspects";

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
    // Keep raw string; sanitizeEbayAspects enforces SINGLE/MULTI cardinality.
    aspects[name] = [trimmed];
  }
  return sanitizeEbayAspects(aspects);
}

function listingPackageInput(listing: ProductListing) {
  return {
    title: listing.title,
    productType: listing.productType || listing.type,
    size: listing.size,
    categoryName: listing.categoryName,
    brand: listing.brand,
    quantity: listing.quantity,
    dimensionsText: listing.itemSpecifics
      ?.filter((f) =>
        /dimension|size|length|width|height|depth/i.test(f.key || f.label),
      )
      .map((f) => `${f.label} ${f.value}`)
      .join(" "),
    packageWeightLbs: listing.packageWeightLbs,
    packageWeightOz: listing.packageWeightOz,
    packageLengthIn: listing.packageLengthIn,
    packageWidthIn: listing.packageWidthIn,
    packageDepthIn: listing.packageDepthIn,
    packageSource: listing.packageSource,
  };
}

export function listingToInventoryItem(
  listing: ProductListing,
  _opts?: { quantityOverride?: number },
): EbayInventoryItemInput {
  const pkg = resolveListingPackage(listingPackageInput(listing));
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
  // Compact spaced Home Depot-style MPNs for Inventory BrandMPN validation.
  const mpnCompact = mpn.replace(/\s+/g, "").slice(0, 65) || "Does Not Apply";
  aspects.Brand = [brand];
  aspects.MPN = [mpnCompact === "DoesNotApply" ? "Does Not Apply" : mpnCompact];

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

  const pkg = resolveListingPackage(listingPackageInput(listing));

  const buyerShipping =
    typeof listing.shippingCost === "number" && listing.shippingCost > 0
      ? listing.shippingCost
      : pkg.shippingCost;

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
    domesticShippingCostUsd: buyerShipping,
  };
}
