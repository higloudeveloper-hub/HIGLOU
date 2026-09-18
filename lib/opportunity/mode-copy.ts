import type { OpportunityMode } from "@/lib/opportunity/types";

export const OPPORTUNITY_MODES: Array<{
  id: OpportunityMode;
  label: string;
  from: string;
  to: string;
  hint: string;
}> = [
  {
    id: "amazon_to_ebay",
    label: "Amazon → eBay",
    from: "Buy on Amazon",
    to: "Publish on eBay",
    hint: "Verify sales → Calculate landed cost → Buy inventory → Inspect → Publish",
  },
  {
    id: "ebay_to_amazon",
    label: "eBay → Amazon",
    from: "Buy on eBay",
    to: "Publish on Amazon",
    hint: "Match GTIN → Amazon catalog → Fees + eligibility → Exact only",
  },
  {
    id: "homedepot_to_ebay",
    label: "Home Depot → eBay",
    from: "Buy at Home Depot",
    to: "Publish on eBay",
    hint: "HD search → UPC exact → eBay ask → Profit",
  },
  {
    id: "homedepot_to_amazon",
    label: "Home Depot → Amazon",
    from: "Buy at Home Depot",
    to: "Publish on Amazon",
    hint: "HD search → UPC → ASIN → Fees + eligibility",
  },
  {
    id: "walmart_to_ebay",
    label: "Walmart → eBay",
    from: "Buy at Walmart",
    to: "Publish on eBay",
    hint: "Walmart search → UPC exact → eBay ask → Profit",
  },
  {
    id: "walmart_to_amazon",
    label: "Walmart → Amazon",
    from: "Buy at Walmart",
    to: "Publish on Amazon",
    hint: "Walmart search → UPC → ASIN → Fees + eligibility",
  },
  {
    id: "amazon",
    label: "Sell on Amazon",
    from: "Your supplier cost",
    to: "Publish on Amazon",
    hint: "Only products your Amazon account can sell. Import a draft for Amazon.",
  },
  {
    id: "supplier",
    label: "Supplier → both",
    from: "Home Depot / wholesale",
    to: "Amazon and eBay",
    hint: "Score both channels against your cost. Import a draft for both.",
  },
];

export function searchStepsFor(mode: OpportunityMode): string[] {
  if (mode === "amazon") {
    return [
      "Finding Amazon products in this category",
      "Checking if your Amazon account can sell them",
      "Estimating Amazon referral fees",
      "Scoring Amazon profit against your cost",
    ];
  }
  if (mode === "supplier") {
    return [
      "Finding Amazon demand for this product",
      "Checking Amazon eligibility",
      "Reading Amazon fees and eBay asking prices",
      "Scoring both channels against your cost",
    ];
  }
  if (mode === "ebay_to_amazon") {
    return [
      "Searching eBay listings with identifiers",
      "Matching GTIN / UPC to Amazon catalog",
      "Checking Amazon eligibility and fees",
      "Scoring only exact identity matches",
    ];
  }
  if (mode === "homedepot_to_ebay" || mode === "walmart_to_ebay") {
    const store = mode.startsWith("homedepot") ? "Home Depot" : "Walmart";
    return [
      `Searching ${store} for products`,
      "Reading UPC / brand / pack from the listing",
      "Matching eBay asking prices by GTIN",
      "Scoring only exact UPC matches — no invented comps",
    ];
  }
  if (mode === "homedepot_to_amazon" || mode === "walmart_to_amazon") {
    const store = mode.startsWith("homedepot") ? "Home Depot" : "Walmart";
    return [
      `Searching ${store} for products`,
      "Resolving UPC to Amazon ASIN",
      "Checking Amazon eligibility and fees",
      "Scoring only exact UPC matches",
    ];
  }
  return [
    "Finding Amazon products at least 25% below the 90-day average",
    "Matching UPC, MPN, and pack quantity",
    "Reading eBay asking prices, not sold comps",
    "Scoring as CANDIDATE until sold comps are verified",
  ];
}

export function importActionLabel(
  mode: OpportunityMode,
  count: number,
  importing: boolean,
): string {
  if (importing) return "Importing…";
  if (!count) {
    if (mode === "amazon" || mode.endsWith("_to_amazon")) {
      return "Pick products to import for Amazon";
    }
    if (mode === "supplier") return "Pick products to import for Amazon and eBay";
    return "Pick products to import for eBay";
  }
  if (mode === "amazon" || mode.endsWith("_to_amazon")) {
    return `Import ${count} for Amazon`;
  }
  if (mode === "supplier") return `Import ${count} for Amazon and eBay`;
  return `Import ${count} ready for eBay`;
}

export function onlySellableForMode(
  mode: OpportunityMode,
  requested?: boolean,
): boolean {
  if (mode === "amazon_to_ebay") return false;
  if (
    mode === "homedepot_to_ebay" ||
    mode === "walmart_to_ebay" ||
    mode === "ebay_to_amazon"
  ) {
    return false;
  }
  if (mode === "amazon" || mode.endsWith("_to_amazon")) return true;
  return requested !== false;
}
