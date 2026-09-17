import type {
  AffiliateChannelSnapshot,
  MonetizationInput,
} from "@/lib/monetization/types";

function amazonProductUrl(asin: string | null | undefined): string | null {
  const a = String(asin || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(a)) return null;
  return `https://www.amazon.com/dp/${a}`;
}

/**
 * Phase 1/2 affiliate snapshot — no commission invention.
 * Link generation with Associate Tag happens in Phase 2 when AFFILIATE_ENGINE_ENABLED.
 */
export function evaluateAmazonAffiliateChannel(
  input: MonetizationInput,
): AffiliateChannelSnapshot {
  const asin = input.asin ? String(input.asin).trim().toUpperCase() : null;
  const validAsin = asin && /^[A-Z0-9]{10}$/.test(asin) ? asin : null;
  const destinationUrl = amazonProductUrl(validAsin);
  const configured = Boolean(input.affiliateTagConfigured);
  const engineOn = Boolean(input.affiliateEngineEnabled);

  if (!validAsin) {
    return {
      available: false,
      configured,
      provider: "amazon_associates",
      asin: null,
      destinationUrl: null,
      estimatedCommission: {
        value: null,
        availability: "insufficient",
        label: "ASIN required",
      },
      message: "Amazon Affiliate — ASIN not available",
    };
  }

  if (!configured) {
    return {
      available: false,
      configured: false,
      provider: "amazon_associates",
      asin: validAsin,
      destinationUrl,
      estimatedCommission: {
        value: null,
        availability: "api_required",
        label: "Associate tag not configured",
      },
      message: "Amazon Affiliate — configure Associate Tag (Phase 2)",
    };
  }

  return {
    available: engineOn,
    configured: true,
    provider: "amazon_associates",
    asin: validAsin,
    destinationUrl,
    estimatedCommission: {
      value: null,
      availability: "unknown",
      label: "Unknown until verified",
    },
    message: engineOn
      ? "Amazon Associates available — commission unknown until verified"
      : "Associate tag present — enable AFFILIATE_ENGINE_ENABLED to generate links",
  };
}

/** Build a standard Associates-style URL when tag is known (no cloaking). */
export function buildAmazonAssociatesUrl(opts: {
  asin: string;
  associateTag: string;
  marketplaceHost?: string;
}): string | null {
  const asin = opts.asin.trim().toUpperCase();
  const tag = opts.associateTag.trim();
  if (!/^[A-Z0-9]{10}$/.test(asin) || !tag) return null;
  const host = (opts.marketplaceHost || "www.amazon.com").replace(/\/$/, "");
  const url = new URL(`https://${host}/dp/${asin}`);
  url.searchParams.set("tag", tag);
  return url.toString();
}
