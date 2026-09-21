import { buildAmazonAssociatesUrl } from "@/lib/monetization/channels/affiliate";
import type { AffiliateProviderAdapter } from "@/lib/monetization/affiliate/provider";

export function getAmazonAssociateTag(override?: string | null): string {
  const fromOverride = String(override || "").trim();
  if (fromOverride) return fromOverride;
  return (process.env.AMAZON_ASSOCIATE_TAG || "").trim();
}

export function getAmazonAssociateMarketplace(): string {
  return (process.env.AMAZON_ASSOCIATE_MARKETPLACE || "US").trim() || "US";
}

export function getAmazonAssociateHost(): string {
  return (
    process.env.AMAZON_ASSOCIATE_MARKETPLACE_HOST ||
    "www.amazon.com"
  )
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

export function isAmazonAssociatesConfigured(override?: string | null): boolean {
  return Boolean(getAmazonAssociateTag(override));
}

/**
 * Amazon Associates adapter.
 * Policy notes:
 * - No cloaking: destination is a normal amazon.com URL with tag=.
 * - Smart-link redirect (/go → amazon) is allowed as a simple hop for internal
 *   click analytics; the final click lands on Amazon with the Associate tag.
 * - Commission is never assumed; reports come from Associates (Phase 4+).
 * - Self-purchase commissions are not claimed or automated.
 */
export const amazonAssociatesProvider: AffiliateProviderAdapter = {
  id: "amazon_associates",
  name: "Amazon Associates",
  marketplace: getAmazonAssociateMarketplace(),
  capabilities: {
    supportsTaggedProductLinks: true,
    allowsSmartLinkRedirect: true,
    selfPurchaseCommissionAllowed: false,
  },
  isConfigured: isAmazonAssociatesConfigured,
  buildProductUrl(opts) {
    const tag = getAmazonAssociateTag(opts.associateTag);
    if (!tag) return null;
    return buildAmazonAssociatesUrl({
      asin: opts.asinOrSku,
      associateTag: tag,
      marketplaceHost: getAmazonAssociateHost(),
    });
  },
};

export function getAffiliateProvider(
  id: string,
): AffiliateProviderAdapter | null {
  if (id === "amazon_associates") return amazonAssociatesProvider;
  return null;
}
