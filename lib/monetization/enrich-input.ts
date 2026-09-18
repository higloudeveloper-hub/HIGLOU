import type { SupabaseClient } from "@supabase/supabase-js";
import { checkAmazonEligibility } from "@/lib/amazon/eligibility";
import { getAmazonSpConfig } from "@/lib/amazon/sp-config";
import {
  getAmazonConnectionPublic,
  getValidAmazonAccessToken,
} from "@/lib/amazon/sp-oauth";
import { getEbayConnectionPublic } from "@/lib/ebay/oauth";
import { resolveUserAssociateTag } from "@/lib/monetization/affiliate/links";
import { getMonetizationFlags } from "@/lib/monetization/flags";
import type { MonetizationInput } from "@/lib/monetization/types";

/**
 * Attach Settings (Associate tag) + store connection state, and live Amazon
 * eligibility when the seller is connected and an ASIN is present.
 */
export async function enrichMonetizationInput(
  supabase: SupabaseClient,
  userId: string,
  input: MonetizationInput,
): Promise<MonetizationInput> {
  const flags = getMonetizationFlags();
  const next: MonetizationInput = {
    ...input,
    affiliateEngineEnabled:
      input.affiliateEngineEnabled ?? flags.affiliateEngine,
    moneyScoreEnabled: input.moneyScoreEnabled ?? flags.moneyScore,
  };

  const tag = await resolveUserAssociateTag(supabase, userId);
  next.affiliateTagConfigured =
    input.affiliateTagConfigured === true || Boolean(tag);

  let amazonConnected = input.amazonSellerConnected === true;
  let ebayConnected = input.ebayConnected === true;

  try {
    const [amazon, ebay] = await Promise.all([
      getAmazonConnectionPublic(supabase, userId),
      getEbayConnectionPublic(supabase, userId),
    ]);
    if (input.amazonSellerConnected == null) {
      amazonConnected = amazon.connected;
      next.amazonSellerConnected = amazon.connected;
    }
    if (input.ebayConnected == null) {
      ebayConnected = ebay.connected;
      next.ebayConnected = ebay.connected;
    }
  } catch {
    if (input.amazonSellerConnected == null) {
      next.amazonSellerConnected = false;
    }
    if (input.ebayConnected == null) {
      next.ebayConnected = false;
    }
  }

  const asin = String(next.asin || "")
    .trim()
    .toUpperCase();
  const needsEligibility =
    amazonConnected &&
    /^[A-Z0-9]{10}$/.test(asin) &&
    (!next.amazonEligibility || next.amazonEligibility === "UNKNOWN");

  if (needsEligibility) {
    try {
      const creds = await getValidAmazonAccessToken(supabase, userId);
      const marketplaceId = getAmazonSpConfig().marketplaceId;
      const check = await checkAmazonEligibility({
        accessToken: creds.token,
        sellerId: creds.sellingPartnerId,
        marketplaceId,
        asin,
        brand: next.brand || undefined,
      });
      next.amazonEligibility = check.status;
      next.amazonEligibilityMessage = check.message;
    } catch (error) {
      next.amazonEligibility = "API_ERROR";
      next.amazonEligibilityMessage =
        error instanceof Error
          ? error.message
          : "Amazon eligibility check failed";
    }
  } else if (
    amazonConnected &&
    !/^[A-Z0-9]{10}$/.test(asin) &&
    (!next.amazonEligibility || next.amazonEligibility === "UNKNOWN")
  ) {
    next.amazonEligibility = "UNKNOWN";
    next.amazonEligibilityMessage =
      "Amazon connected — add an ASIN to check if you can sell it";
  } else if (
    !amazonConnected &&
    (!next.amazonEligibility || next.amazonEligibility === "UNKNOWN")
  ) {
    next.amazonEligibility = "UNKNOWN";
    next.amazonEligibilityMessage =
      next.amazonEligibilityMessage ||
      "Connect Amazon in Settings → Stores to check eligibility";
  }

  void ebayConnected;
  return next;
}
