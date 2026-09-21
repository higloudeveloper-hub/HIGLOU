/**
 * Multi-affiliate provider abstractions.
 * Amazon Associates is the first provider — not the only one by design.
 */

export type AffiliateProviderCapability = {
  supportsTaggedProductLinks: boolean;
  /** If true, intermediate redirects (/go) are not used for this provider. */
  allowsSmartLinkRedirect: boolean;
  selfPurchaseCommissionAllowed: boolean;
};

export type AffiliateProviderAdapter = {
  id: string;
  name: string;
  marketplace: string;
  capabilities: AffiliateProviderCapability;
  isConfigured: () => boolean;
  buildProductUrl: (opts: {
    asinOrSku: string;
    campaignId?: string | null;
    /** Prefer the caller's resolved tag over process.env alone */
    associateTag?: string | null;
  }) => string | null;
};

export function listAffiliateProviderIds(): string[] {
  return ["amazon_associates"];
}
