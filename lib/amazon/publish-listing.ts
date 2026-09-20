import { sanitizeEbayUpc } from "@/lib/ebay/inventory-api";
import { resolveAmazonCatalogMatch } from "@/lib/amazon/catalog-resolve";
import {
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
  amazonAccountRiskReason,
  amazonApprovalUrlForAsin,
  amazonBrandGatingReason,
  amazonIncompleteListingReason,
  amazonListingBlockedReason,
  amazonRestrictionBlock,
  getAmazonCatalogItem,
  getAmazonListingItem,
  getAmazonListingsRestrictions,
  getAmazonProductTypeSchema,
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

/**
 * Existing-ASIN publish is offer-only. Never PATCH images / brand / title onto
 * Amazon catalog pages — that creates Seller Central “incidencias” and can
 * hurt account health. Catalog photos already live on the ASIN.
 */
export async function publishAmazonOffer(opts: {
  accessToken: string;
  sellingPartnerId: string;
  listing: AmazonPublishInput;
  /** Seller confirmed Seller Central approval — skip laggy gate checks. */
  forceAfterApproval?: boolean;
}): Promise<AmazonPublishResult> {
  const cfg = getAmazonSpConfig();
  const sku = amazonSkuFromListing(opts.listing.sku);
  const upc = sanitizeEbayUpc(opts.listing.upc) || opts.listing.upc || "";

  if (!Number.isFinite(opts.listing.price) || opts.listing.price <= 0) {
    throw new Error("Set a price before publishing to Amazon.");
  }
  if (opts.listing.price < 1) {
    throw new Error(
      "Amazon price is too low (under $1). Fix the price before publishing so Seller Central does not flag the offer.",
    );
  }
  const qty = Math.floor(Number(opts.listing.quantity) || 0);
  if (qty < 1) {
    throw new Error("Set quantity to at least 1 before publishing to Amazon.");
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
  const productType =
    String(catalog.productType || resolved.productType || "PRODUCT").trim() ||
    "PRODUCT";
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
  let restrictionGate = amazonRestrictionBlock(
    restrictionsCheck?.restrictions || [],
    asin,
    catalog.brand || opts.listing.brand,
    conditionType,
  );

  /**
   * Restrictions API often lags after Seller Central approval.
   * Soft-gate: one quick re-check. Hard-block APPROVAL_REQUIRED unless the
   * seller explicitly confirmed approval — publishing gated brands creates
   * suppressed offers / incidencias in Seller Central.
   */
  if (restrictionGate?.code === "AMAZON_APPROVAL_REQUIRED") {
    await new Promise((r) => setTimeout(r, 1800));
    try {
      const again = await getAmazonListingsRestrictions({
        accessToken: opts.accessToken,
        sellerId: opts.sellingPartnerId,
        marketplaceId: cfg.marketplaceId,
        asin,
        conditionType,
      });
      const againBlock = amazonRestrictionBlock(
        again.restrictions,
        asin,
        catalog.brand || opts.listing.brand,
        conditionType,
      );
      if (!againBlock) {
        restrictionGate = null;
      } else {
        restrictionGate = againBlock;
      }
    } catch {
      /* keep first gate */
    }
  }

  if (restrictionGate) {
    if (
      restrictionGate.code === "AMAZON_APPROVAL_REQUIRED" &&
      opts.forceAfterApproval
    ) {
      /* Seller confirmed Approved in Seller Central — continue to preview. */
    } else {
      throw new AmazonPublishBlockedError({
        ...restrictionGate,
        restrictionsDebug,
      });
    }
  }

  const schema = await getAmazonProductTypeSchema({
    accessToken: opts.accessToken,
    marketplaceId: cfg.marketplaceId,
    sellerId: opts.sellingPartnerId,
    productType,
    requirements: "LISTING_OFFER_ONLY",
  }).catch(() =>
    getAmazonProductTypeSchema({
      accessToken: opts.accessToken,
      marketplaceId: cfg.marketplaceId,
      sellerId: opts.sellingPartnerId,
      productType: "PRODUCT",
      requirements: "LISTING_OFFER_ONLY",
    }),
  );

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
    productType,
    requirements: "LISTING_OFFER_ONLY" as const,
  };

  const preview = await putAmazonListingOffer({
    ...putBase,
    attributes,
    mode: "VALIDATION_PREVIEW",
  });
  const brandGate = amazonBrandGatingReason(preview.issues);
  if (brandGate && !opts.forceAfterApproval) {
    throw new AmazonPublishBlockedError({
      code: "AMAZON_APPROVAL_REQUIRED",
      message: brandGate,
      approvalUrl:
        restrictionGate?.approvalUrl || amazonApprovalUrlForAsin(asin),
      asin,
      brand: catalog.brand || opts.listing.brand || undefined,
      reasonCode: "APPROVAL_REQUIRED",
      restrictionsDebug,
    });
  }
  const previewRisk =
    amazonAccountRiskReason(preview.issues) ||
    amazonIncompleteListingReason(preview.issues, preview.status);
  // When forcing after Seller Central approval, ignore qualification noise on preview.
  if (
    previewRisk &&
    !(
      opts.forceAfterApproval &&
      /approval|brand|qualification|suppressed/i.test(previewRisk)
    )
  ) {
    throw new Error(previewRisk);
  }

  let result;
  try {
    result = await putAmazonListingOffer({
      ...putBase,
      attributes,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error || "");
    if (
      opts.forceAfterApproval &&
      /approval|brand|qualification|suppressed/i.test(msg)
    ) {
      throw new AmazonPublishBlockedError({
        code: "AMAZON_APPROVAL_REQUIRED",
        message:
          "Amazon still rejects this brand on the live put. Confirm this brand is Approved for this exact seller account in Seller Central → Selling applications, then try again. Do not keep publishing — suppressed offers create incidencias.",
        approvalUrl:
          restrictionGate?.approvalUrl || amazonApprovalUrlForAsin(asin),
        asin,
        brand: catalog.brand || opts.listing.brand || undefined,
        reasonCode: "APPROVAL_REQUIRED",
        restrictionsDebug,
      });
    }
    throw error;
  }

  // Intentionally do NOT patch images / catalog fields onto existing ASINs.
  // That is the main source of post-publish “incidencias” in Seller Central.

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
      amazonListingBlockedReason(live.issues) ||
      amazonAccountRiskReason(live.issues);
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
