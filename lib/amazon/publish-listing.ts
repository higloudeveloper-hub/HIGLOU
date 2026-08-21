import { sanitizeEbayUpc } from "@/lib/ebay/inventory-api";
import { resolveAmazonCatalogMatch } from "@/lib/amazon/catalog-resolve";
import {
  amazonImageLocatorAttributes,
  amazonImageLocatorPatches,
  amazonListingGalleryUrls,
  amazonListingHasPrice,
  buildAmazonOfferOnlyAttributes,
  type AmazonListingDraft,
} from "@/lib/amazon/listing-attributes";
import {
  amazonAsinFromListing,
  amazonConditionType,
  amazonSkuFromListing,
} from "@/lib/amazon/listing-offer";
import {
  amazonBrandGatingReason,
  amazonIncompleteListingReason,
  amazonListingBlockedReason,
  amazonRestrictionBlock,
  getAmazonCatalogItem,
  getAmazonListingItem,
  getAmazonListingsRestrictions,
  getAmazonProductTypeSchema,
  patchAmazonListingAttributes,
  putAmazonListingOffer,
  AmazonPublishBlockedError,
  type AmazonRestrictionsCheck,
} from "@/lib/amazon/sp-api";
import { getAmazonSpConfig } from "@/lib/amazon/sp-config";

export type AmazonPublishInput = AmazonListingDraft & {
  sku: string;
  asin?: string;
};

export type AmazonPublishResult = {
  sku: string;
  asin: string;
  status: string;
  sellerCentralUrl: string;
  title: string;
  mode: "attach" | "create";
  restrictionsDebug?: unknown;
};

const NO_EXACT_MATCH =
  "This product does not have a confirmed exact match on Amazon. Review it before creating a new ASIN. Higlou will not pick a similar listing from photos or title.";

async function publishAmazonListingImages(opts: {
  accessToken: string;
  sellerId: string;
  sku: string;
  marketplaceId: string;
  productType: string;
  listing: AmazonListingDraft;
}): Promise<void> {
  const urls = amazonListingGalleryUrls(opts.listing);
  if (urls.length < 2) return;
  const productType = opts.productType || "PRODUCT";
  const locators = amazonImageLocatorAttributes(urls, opts.marketplaceId);
  const patches = amazonImageLocatorPatches(urls, opts.marketplaceId);
  try {
    await patchAmazonListingAttributes({
      accessToken: opts.accessToken,
      sellerId: opts.sellerId,
      sku: opts.sku,
      marketplaceId: opts.marketplaceId,
      productType,
      patches,
    });
    return;
  } catch {
    /* Offer-only SKUs and catalog ASINs may reject PATCH. Try a listing merge. */
  }
  try {
    const live = await getAmazonListingItem({
      accessToken: opts.accessToken,
      sellerId: opts.sellerId,
      sku: opts.sku,
      marketplaceId: opts.marketplaceId,
    });
    if (!Object.keys(live.attributes || {}).length) return;
    await putAmazonListingOffer({
      accessToken: opts.accessToken,
      sellerId: opts.sellerId,
      sku: opts.sku,
      marketplaceId: opts.marketplaceId,
      productType,
      requirements: "LISTING",
      attributes: {
        ...live.attributes,
        ...locators,
      },
    });
  } catch {
    /* Existing catalog ASINs often reject seller photos. Offer can still be live. */
  }
}

export async function publishAmazonOffer(opts: {
  accessToken: string;
  sellingPartnerId: string;
  listing: AmazonPublishInput;
}): Promise<AmazonPublishResult> {
  const cfg = getAmazonSpConfig();
  const sku = amazonSkuFromListing(opts.listing.sku);
  const upc = sanitizeEbayUpc(opts.listing.upc) || opts.listing.upc || "";

  if (!Number.isFinite(opts.listing.price) || opts.listing.price <= 0) {
    throw new Error("Set a price before publishing to Amazon.");
  }

  const resolved = await resolveAmazonCatalogMatch({
    accessToken: opts.accessToken,
    marketplaceId: cfg.marketplaceId,
    listing: {
      title: opts.listing.title,
      brand: opts.listing.brand,
      model: opts.listing.model,
      mpn: opts.listing.mpn,
      upc,
      asin: amazonAsinFromListing({
        ...opts.listing,
        description: opts.listing.description,
      }),
      sku: opts.listing.sku,
      description: opts.listing.description,
      itemSpecifics: opts.listing.itemSpecifics,
      imageLabels: opts.listing.imageLabels,
    },
  });

  if (resolved.mode !== "existing" || !/^[A-Z0-9]{10}$/i.test(resolved.asin)) {
    if (resolved.asin && !resolved.catalog) {
      throw new Error(
        `Amazon does not recognize ASIN ${resolved.asin}. Confirm the ASIN on Amazon.com before publishing.`,
      );
    }
    throw new Error(NO_EXACT_MATCH);
  }

  let asin = resolved.asin.toUpperCase();
  let catalog = resolved.catalog;
  if (!catalog) {
    catalog = await getAmazonCatalogItem({
      accessToken: opts.accessToken,
      marketplaceId: cfg.marketplaceId,
      asin,
    });
  }
  if (!catalog) {
    throw new Error(
      `Amazon does not recognize ASIN ${asin}. Confirm the ASIN on Amazon.com before publishing.`,
    );
  }
  const catalogTitle = catalog.title || resolved.title || opts.listing.title;
  const conditionType = amazonConditionType(
    opts.listing.condition,
    opts.listing.conditionId,
  );

  let restrictionsCheck: AmazonRestrictionsCheck | null = null;
  try {
    restrictionsCheck = await getAmazonListingsRestrictions({
      accessToken: opts.accessToken,
      sellerId: opts.sellingPartnerId,
      marketplaceId: cfg.marketplaceId,
      asin,
      conditionType,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/denied|forbidden|403|unauthorized|Access to requested resource/i.test(message)) {
      throw error;
    }
  }
  const restrictionsDebug = restrictionsCheck
    ? {
        query: restrictionsCheck.query,
        restrictions: restrictionsCheck.raw,
      }
    : null;
  const blocked = amazonRestrictionBlock(
    restrictionsCheck?.restrictions || [],
    asin,
    catalog.brand || opts.listing.brand,
    conditionType,
  );
  if (blocked) {
    throw new AmazonPublishBlockedError({
      ...blocked,
      restrictionsDebug,
    });
  }

  const schema = await getAmazonProductTypeSchema({
    accessToken: opts.accessToken,
    marketplaceId: cfg.marketplaceId,
    sellerId: opts.sellingPartnerId,
    productType: "PRODUCT",
    requirements: "LISTING_OFFER_ONLY",
  });

  const attributes = buildAmazonOfferOnlyAttributes({
    marketplaceId: cfg.marketplaceId,
    asin,
    listing: opts.listing,
    schema,
  });

  const putBase = {
    accessToken: opts.accessToken,
    sellerId: opts.sellingPartnerId,
    sku,
    marketplaceId: cfg.marketplaceId,
    productType: "PRODUCT",
    requirements: "LISTING_OFFER_ONLY" as const,
  };

  const preview = await putAmazonListingOffer({
    ...putBase,
    attributes,
    mode: "VALIDATION_PREVIEW",
  });
  const previewBlock =
    amazonBrandGatingReason(preview.issues) ||
    amazonIncompleteListingReason(preview.issues, preview.status);
  if (previewBlock) throw new Error(previewBlock);

  const result = await putAmazonListingOffer({
    ...putBase,
    attributes,
  });

  await publishAmazonListingImages({
    accessToken: opts.accessToken,
    sellerId: opts.sellingPartnerId,
    sku: result.sku || sku,
    marketplaceId: cfg.marketplaceId,
    productType: catalog.productType || resolved.productType || "PRODUCT",
    listing: opts.listing,
  });

  try {
    const live = await getAmazonListingItem({
      accessToken: opts.accessToken,
      sellerId: opts.sellingPartnerId,
      sku: result.sku || sku,
      marketplaceId: cfg.marketplaceId,
    });
    if (live.asin) asin = live.asin;
    const blocked =
      amazonBrandGatingReason(live.issues) ||
      amazonListingBlockedReason(live.issues);
    if (blocked) throw new Error(blocked);
    const incomplete = amazonIncompleteListingReason(live.issues, live.status);
    if (incomplete) throw new Error(incomplete);
    const liveAttrs = live.attributes || {};
    if (!amazonListingHasPrice(liveAttrs)) {
      throw new Error(
        "Amazon accepted the SKU but the sellable offer is missing. Seller Central will show Falta la oferta and $0.00. If this brand needs approval, open Seller Central → Selling applications instead of publishing again.",
      );
    }
  } catch (error) {
    if (
      error instanceof Error &&
      /listing lookup failed|not found|404/i.test(error.message)
    ) {
      /* Amazon sometimes accepts first and the GET is not ready yet */
    } else {
      throw error;
    }
  }

  return {
    sku: result.sku,
    asin,
    status: result.status,
    title: catalogTitle,
    mode: "attach",
    restrictionsDebug,
    sellerCentralUrl: `https://sellercentral.amazon.com/inventory/ref=xx_invmgr_dnav_xx?tbla_myitable=sort:%7B%22sortOrder%22%3A%22DESCENDING%22%2C%22sortedColumnId%22%3A%22date%22%7D&search:${encodeURIComponent(sku)}`,
  };
}
