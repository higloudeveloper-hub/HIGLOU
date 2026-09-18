import type {
  OpportunityDestMarket,
  OpportunityMode,
  OpportunitySourceMarket,
} from "@/lib/opportunity/types";

export function sourceMarketFor(
  mode: OpportunityMode,
): OpportunitySourceMarket {
  switch (mode) {
    case "ebay_to_amazon":
      return "ebay";
    case "homedepot_to_ebay":
    case "homedepot_to_amazon":
      return "homedepot";
    case "walmart_to_ebay":
    case "walmart_to_amazon":
      return "walmart";
    case "supplier":
      return "supplier";
    case "amazon":
      return "supplier";
    case "amazon_to_ebay":
    default:
      return "amazon";
  }
}

export function destMarketFor(mode: OpportunityMode): OpportunityDestMarket {
  switch (mode) {
    case "amazon":
    case "ebay_to_amazon":
    case "homedepot_to_amazon":
    case "walmart_to_amazon":
      return "amazon";
    case "supplier":
      return "both";
    case "amazon_to_ebay":
    case "homedepot_to_ebay":
    case "walmart_to_ebay":
    default:
      return "ebay";
  }
}

export function isRetailToMarketplaceMode(mode: OpportunityMode): boolean {
  return (
    mode === "homedepot_to_ebay" ||
    mode === "homedepot_to_amazon" ||
    mode === "walmart_to_ebay" ||
    mode === "walmart_to_amazon"
  );
}

export function isEbayToAmazonMode(mode: OpportunityMode): boolean {
  return mode === "ebay_to_amazon";
}

export function sellsOnAmazon(mode: OpportunityMode): boolean {
  const dest = destMarketFor(mode);
  return dest === "amazon" || dest === "both";
}

export function sellsOnEbay(mode: OpportunityMode): boolean {
  const dest = destMarketFor(mode);
  return dest === "ebay" || dest === "both";
}

export function requiresExactGtin(mode: OpportunityMode): boolean {
  return isRetailToMarketplaceMode(mode) || isEbayToAmazonMode(mode);
}
