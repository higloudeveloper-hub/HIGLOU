import { sanitizeEbayUpc } from "@/lib/ebay/inventory-api";
import { resolveAmazonCatalogMatch } from "@/lib/amazon/catalog-resolve";
import {
  amazonHasBrandLockIssue,
  amazonIsBrandLockIssue,
  amazonListingHasPrice,
  buildAmazonListingAttributes,
  stripAmazonSynthesizedIdentity,
  lockAmazonBrandAttributes,
  fillAmazonAttributesFromIssues,
  type AmazonListingDraft,
} from "@/lib/amazon/listing-attributes";
import {
  amazonAsinFromListing,
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

  const schema = await getAmazonProductTypeSchema({
    accessToken: opts.accessToken,
    marketplaceId: cfg.marketplaceId,
    sellerId: opts.sellingPartnerId,
    productType,
    requirements: "LISTING",
  });

  const attributes = buildAmazonListingAttributes({
    marketplaceId: cfg.marketplaceId,
    asin,
    listing: opts.listing,
    catalog,
    schema,
  });

  const productTypeName = schema?.productType || productType;
  const putBase = {
    accessToken: opts.accessToken,
    sellerId: opts.sellingPartnerId,
    sku,
    marketplaceId: cfg.marketplaceId,
    productType: productTypeName,
    requirements: "LISTING" as const,
  };

  let readyAttributes = stripAmazonSynthesizedIdentity({
    attributes,
    asin,
    catalog,
  });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const preview = await putAmazonListingOffer({
      ...putBase,
      attributes: readyAttributes,
      mode: "VALIDATION_PREVIEW",
    });
    const previewBrand = amazonBrandGatingReason(preview.issues);
    if (previewBrand) throw new Error(previewBrand);
    if (amazonHasBrandLockIssue(preview.issues)) {
      const next = lockAmazonBrandAttributes({
        attributes: readyAttributes,
        listing: opts.listing,
        catalog,
        marketplaceId: cfg.marketplaceId,
        schema,
      });
      const changed =
        JSON.stringify(next.brand) !== JSON.stringify(readyAttributes.brand) ||
        JSON.stringify(next.manufacturer) !==
          JSON.stringify(readyAttributes.manufacturer);
      readyAttributes = next;
      if (changed) continue;
    }
    if (
      !/^INVALID$/i.test(preview.status) &&
      !amazonIncompleteListingReason(preview.issues)
    ) {
      break;
    }
    const fixed = fillAmazonAttributesFromIssues({
      attributes: readyAttributes,
      issues: preview.issues,
      listing: opts.listing,
      marketplaceId: cfg.marketplaceId,
      schema,
      catalog,
    });
    if (!fixed.filled.length) {
      const remaining = (preview.issues || []).filter(
        (issue) => !amazonIsBrandLockIssue(issue),
      );
      const still = amazonIncompleteListingReason(
        remaining,
        remaining.length ? preview.status : "VALID",
      );
      if (still) throw new Error(still);
      break;
    }
    readyAttributes = stripAmazonSynthesizedIdentity({
      attributes: fixed.attributes,
      asin,
      catalog,
    });
    if (attempt === 3) {
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
    if (!amazonListingHasPrice(liveAttrs)) {
      throw new Error(
        "Amazon saved the product but not the sellable offer. Seller Central will show Falta la oferta and $0.00. Publish to Amazon again. If this is a gated brand like Google, request approval in Seller Central → Selling applications.",
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
