import { sanitizeEbayUpc } from "@/lib/ebay/inventory-api";
import {
  amazonCatalogQueries,
  pickAmazonCatalogMatch,
} from "@/lib/amazon/catalog-match";
import {
  amazonListingHasPrice,
  buildAmazonListingAttributes,
  fillAmazonAttributesFromIssues,
  type AmazonListingDraft,
} from "@/lib/amazon/listing-attributes";
import {
  amazonSkuFromListing,
  asinFromHiglouSku,
  catalogIdentifierType,
} from "@/lib/amazon/listing-offer";
import {
  amazonBrandGatingReason,
  amazonIncompleteListingReason,
  amazonListingBlockedReason,
  getAmazonCatalogItem,
  getAmazonListingItem,
  getAmazonProductTypeSchema,
  putAmazonListingOffer,
  searchAmazonCatalogByIdentifier,
  searchAmazonCatalogForListing,
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
  const directAsin = (
    opts.listing.asin || asinFromHiglouSku(opts.listing.sku)
  )
    .trim()
    .toUpperCase();
  const upc = sanitizeEbayUpc(opts.listing.upc) || "";

  let asin = /^[A-Z0-9]{10}$/.test(directAsin) ? directAsin : "";
  let productType = "PRODUCT";
  let catalogTitle = opts.listing.title;

  if (!asin && upc) {
    const kind = catalogIdentifierType(upc);
    if (kind) {
      const hits = await searchAmazonCatalogByIdentifier({
        accessToken: opts.accessToken,
        marketplaceId: cfg.marketplaceId,
        identifier: upc,
        identifierType: kind,
      });
      if (hits[0]) {
        asin = hits[0].asin;
        productType = hits[0].productType || "PRODUCT";
        catalogTitle = hits[0].title || catalogTitle;
      }
    }
  }

  if (!asin) {
    const hints = {
      title: opts.listing.title,
      brand: opts.listing.brand,
      model: opts.listing.model,
      mpn: opts.listing.mpn,
    };
    const queries = amazonCatalogQueries(hints);
    if (queries.length) {
      const hits = await searchAmazonCatalogForListing({
        accessToken: opts.accessToken,
        marketplaceId: cfg.marketplaceId,
        queries,
      });
      const match = pickAmazonCatalogMatch(hits, hints);
      if (match) {
        asin = match.asin;
        productType = match.productType || "PRODUCT";
        catalogTitle = match.title || catalogTitle;
      }
    }
  }

  if (!asin) {
    throw new Error(
      "Amazon has no catalog match for this product. Higlou can only offer items Amazon already sells.",
    );
  }

  if (!Number.isFinite(opts.listing.price) || opts.listing.price <= 0) {
    throw new Error("Set a price before publishing to Amazon.");
  }

  const catalog = await getAmazonCatalogItem({
    accessToken: opts.accessToken,
    marketplaceId: cfg.marketplaceId,
    asin,
  });
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

  let readyAttributes = attributes;
  const preview = await putAmazonListingOffer({
    ...putBase,
    attributes: readyAttributes,
    mode: "VALIDATION_PREVIEW",
  });
  const previewBrand = amazonBrandGatingReason(preview.issues);
  if (previewBrand) throw new Error(previewBrand);
  if (/^INVALID$/i.test(preview.status) || amazonIncompleteListingReason(preview.issues)) {
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
