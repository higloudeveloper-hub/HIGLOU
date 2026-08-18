import { sanitizeEbayUpc } from "@/lib/ebay/inventory-api";
import {
  amazonSearchKeywords,
  pickAmazonCatalogMatch,
} from "@/lib/amazon/catalog-match";
import {
  amazonConditionType,
  amazonOfferAttributes,
  amazonSkuFromListing,
  asinFromHiglouSku,
  catalogIdentifierType,
} from "@/lib/amazon/listing-offer";
import {
  amazonListingBlockedReason,
  getAmazonListingItem,
  putAmazonListingOffer,
  searchAmazonCatalogByIdentifier,
  searchAmazonCatalogByKeywords,
} from "@/lib/amazon/sp-api";
import { getAmazonSpConfig } from "@/lib/amazon/sp-config";

export type AmazonPublishInput = {
  sku: string;
  title: string;
  upc?: string;
  asin?: string;
  brand?: string;
  model?: string;
  mpn?: string;
  price: number;
  quantity: number;
  condition?: string;
  conditionId?: string;
  handlingTime?: number;
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
    if (!kind) {
      throw new Error("The UPC is not a valid barcode. Check the number and try again.");
    }
    const hits = await searchAmazonCatalogByIdentifier({
      accessToken: opts.accessToken,
      marketplaceId: cfg.marketplaceId,
      identifier: upc,
      identifierType: kind,
    });
    if (!hits.length) {
      throw new Error(
        "Amazon has no catalog match for that UPC. You can only offer products Amazon already sells, or import from an Amazon link first.",
      );
    }
    asin = hits[0].asin;
    productType = hits[0].productType || "PRODUCT";
    catalogTitle = hits[0].title || catalogTitle;
  }

  if (!asin) {
    const hints = {
      title: opts.listing.title,
      brand: opts.listing.brand,
      model: opts.listing.model,
      mpn: opts.listing.mpn,
    };
    const keywords = amazonSearchKeywords(hints);
    if (keywords) {
      const hits = await searchAmazonCatalogByKeywords({
        accessToken: opts.accessToken,
        marketplaceId: cfg.marketplaceId,
        keywords,
        brand: opts.listing.brand,
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

  const result = await putAmazonListingOffer({
    accessToken: opts.accessToken,
    sellerId: opts.sellingPartnerId,
    sku,
    marketplaceId: cfg.marketplaceId,
    productType,
    attributes: amazonOfferAttributes({
      marketplaceId: cfg.marketplaceId,
      asin,
      conditionType: amazonConditionType(
        opts.listing.condition,
        opts.listing.conditionId,
      ),
      price: opts.listing.price,
      quantity: Math.max(1, Math.floor(opts.listing.quantity || 1)),
      handlingDays: Math.max(1, Math.floor(opts.listing.handlingTime || 2)),
    }),
  });

  try {
    const live = await getAmazonListingItem({
      accessToken: opts.accessToken,
      sellerId: opts.sellingPartnerId,
      sku: result.sku || sku,
      marketplaceId: cfg.marketplaceId,
    });
    const blocked = amazonListingBlockedReason(live.issues);
    if (blocked) throw new Error(blocked);
  } catch (error) {
    if (error instanceof Error && /blocked this brand|suppressed/i.test(error.message)) {
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
