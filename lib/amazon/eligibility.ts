import {
  amazonRestrictionBlock,
  getAmazonListingsRestrictions,
  type AmazonListingRestriction,
} from "@/lib/amazon/sp-api";
import type { EligibilityStatus } from "@/lib/opportunity/types";

export type EligibilityResult = {
  status: EligibilityStatus;
  message: string;
};

export function classifyAmazonRestrictions(
  restrictions: AmazonListingRestriction[],
  asin?: string,
  brand?: string,
): EligibilityResult {
  const block = amazonRestrictionBlock(restrictions, asin, brand, "new_new");
  if (!block) {
    return { status: "SELLABLE", message: "You can sell it" };
  }
  if (block.reasonCode === "APPROVAL_REQUIRED") {
    return { status: "APPROVAL_REQUIRED", message: block.message };
  }
  const text = `${block.message} ${block.reasonCode || ""}`;
  if (/condition/i.test(text)) {
    return { status: "CONDITION_RESTRICTED", message: block.message };
  }
  return { status: "RESTRICTED", message: block.message };
}

export async function checkAmazonEligibility(opts: {
  accessToken: string;
  sellerId: string;
  marketplaceId: string;
  asin: string;
  brand?: string;
}): Promise<EligibilityResult> {
  try {
    const check = await getAmazonListingsRestrictions({
      accessToken: opts.accessToken,
      sellerId: opts.sellerId,
      marketplaceId: opts.marketplaceId,
      asin: opts.asin,
      conditionType: "new_new",
    });
    return classifyAmazonRestrictions(
      check.restrictions,
      opts.asin,
      opts.brand,
    );
  } catch (error) {
    return {
      status: "API_ERROR",
      message:
        error instanceof Error
          ? error.message
          : "Amazon eligibility check failed",
    };
  }
}
