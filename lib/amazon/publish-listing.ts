import { sanitizeEbayUpc } from "@/lib/ebay/inventory-api";
import { resolveAmazonCatalogMatch } from "@/lib/amazon/catalog-resolve";
import {
  amazonExistingAsinOfferAttributes,
  amazonHasBrandLockIssue,
  amazonListingHasPrice,
  buildAmazonListingAttributes,
  fillAmazonAttributesFromIssues,
  type AmazonListingDraft,
} from "@/lib/amazon/listing-attributes";
import {
  amazonAsinFromListing,
  amazonConditionType,
  amazonOfferAttributes,
  amazonSkuFromListing,
} from "@/lib/amazon/listing-offer";
import {
  amazonBrandGatingReason,
  amazonIncompleteListingReason,
  amazonListingBlockedReason,
  getAmazonListingItem,
  getAmazonProductTypeSchema,
  putAmazonListingOffer,
  searchAmazonProductType,
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
};

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
    },
  });
  const creating = resolved.mode === "create";
  if (creating && String(upc || "").replace(/\D/g, "").length < 12) {
    throw new Error(
      "Amazon does not have this exact model yet. Add a UPC so Higlou can create it as a new Amazon product, instead of listing a similar one.",
    );
  }
  let asin = resolved.asin;
  let productType = resolved.productType || "PRODUCT";
  let catalogTitle = resolved.title || opts.listing.title;
  const catalog = creating ? null : resolved.catalog;

  if (catalog?.productType) productType = catalog.productType;
  if (catalog?.title) catalogTitle = catalog.title;

  if (!productType || productType === "PRODUCT") {
    const guessed = await searchAmazonProductType({
      accessToken: opts.accessToken,
      marketplaceId: cfg.marketplaceId,
      itemName: catalogTitle || opts.listing.title,
    });
    if (guessed) productType = guessed;
  }
  if (creating && (!productType || productType === "PRODUCT")) {
    throw new Error(
      "Amazon does not have this exact model yet, and could not pick a product type from the title. Add a clearer title, then publish again to create it as a new Amazon product.",
    );
  }

  const attaching = !creating && /^[A-Z0-9]{10}$/i.test(asin);
  let requirements: "LISTING" | "LISTING_OFFER_ONLY" = attaching
    ? "LISTING_OFFER_ONLY"
    : "LISTING";

  const schema = await getAmazonProductTypeSchema({
    accessToken: opts.accessToken,
    marketplaceId: cfg.marketplaceId,
    sellerId: opts.sellingPartnerId,
    productType,
    requirements,
  });

  let attributes = buildAmazonListingAttributes({
    marketplaceId: cfg.marketplaceId,
    asin,
    listing: opts.listing,
    catalog,
    schema,
  });
  if (attaching) {
    const offer = amazonOfferAttributes({
      marketplaceId: cfg.marketplaceId,
      asin,
      conditionType: amazonConditionType(
        opts.listing.condition,
        opts.listing.conditionId,
      ),
      price: opts.listing.price,
      quantity: Math.max(1, Math.floor(opts.listing.quantity || 1)),
      handlingDays: Math.max(1, Math.floor(opts.listing.handlingTime || 2)),
    });
    attributes = amazonExistingAsinOfferAttributes({
      ...attributes,
      ...offer,
      list_price: [
        {
          value: Number(opts.listing.price.toFixed(2)),
          currency: "USD",
          marketplace_id: cfg.marketplaceId,
        },
      ],
    });
  }

  const productTypeName = schema?.productType || productType;
  const putBase = {
    accessToken: opts.accessToken,
    sellerId: opts.sellingPartnerId,
    sku,
    marketplaceId: cfg.marketplaceId,
    productType: productTypeName,
    requirements,
  };

  let readyAttributes = attributes;
  const preview = await putAmazonListingOffer({
    ...putBase,
    attributes: readyAttributes,
    mode: "VALIDATION_PREVIEW",
  });
  const previewBrand = amazonBrandGatingReason(preview.issues);
  if (previewBrand) throw new Error(previewBrand);
  if (amazonHasBrandLockIssue(preview.issues)) {
    readyAttributes = amazonExistingAsinOfferAttributes(readyAttributes);
    putBase.requirements = "LISTING_OFFER_ONLY";
    const unlocked = await putAmazonListingOffer({
      ...putBase,
      attributes: readyAttributes,
      mode: "VALIDATION_PREVIEW",
    });
    const unlockedBrand = amazonBrandGatingReason(unlocked.issues);
    if (unlockedBrand) throw new Error(unlockedBrand);
    if (amazonHasBrandLockIssue(unlocked.issues)) {
      throw new Error(
        amazonIncompleteListingReason(unlocked.issues, unlocked.status) ||
          "Amazon will not let this offer change the catalog brand. Higlou will only attach your price to the existing Amazon product.",
      );
    }
    const stillLock = amazonIncompleteListingReason(
      unlocked.issues,
      unlocked.status,
    );
    if (stillLock) throw new Error(stillLock);
  } else if (
    /^INVALID$/i.test(preview.status) ||
    amazonIncompleteListingReason(preview.issues)
  ) {
    const fixed = fillAmazonAttributesFromIssues({
      attributes: readyAttributes,
      issues: preview.issues,
      listing: opts.listing,
      marketplaceId: cfg.marketplaceId,
      schema,
      catalog,
    });
    if (fixed.filled.length) {
      readyAttributes = fixed.attributes;
      const again = await putAmazonListingOffer({
        ...putBase,
        attributes: readyAttributes,
        mode: "VALIDATION_PREVIEW",
      });
      const againBrand = amazonBrandGatingReason(again.issues);
      if (againBrand) throw new Error(againBrand);
      const still = amazonIncompleteListingReason(again.issues, again.status);
      if (still) throw new Error(still);
    } else {
      const still = amazonIncompleteListingReason(preview.issues, preview.status);
      if (still) throw new Error(still);
    }
  }

  const result = await putAmazonListingOffer({
    ...putBase,
    attributes: readyAttributes,
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
      amazonBrandGatingReason(live.issues) || amazonListingBlockedReason(live.issues);
    if (blocked) throw new Error(blocked);
    const incomplete = amazonIncompleteListingReason(live.issues, live.status);
    if (incomplete) throw new Error(incomplete);
    const liveAttrs = live.attributes || {};
    const hasFacts = Boolean(liveAttrs.item_name || liveAttrs.brand || liveAttrs.bullet_point);
    if (hasFacts && !amazonListingHasPrice(liveAttrs)) {
      throw new Error(
        "Amazon saved the product facts but not the price. Open Seller Central → Inventory and set your price on this SKU.",
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
    sellerCentralUrl: `https://sellercentral.amazon.com/inventory/ref=xx_invmgr_dnav_xx?tbla_myitable=sort:%7B%22sortOrder%22%3A%22DESCENDING%22%2C%22sortedColumnId%22%3A%22date%22%7D&search:${encodeURIComponent(sku)}`,
  };
}
