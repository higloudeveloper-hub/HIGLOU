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
    hint: "Import a draft for eBay. Amazon approval is not required.",
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
  return [
    "Finding Amazon products to resell",
    "Reading Amazon buy price",
    "Reading eBay asking prices, not sold comps",
    "Scoring eBay profit after Amazon cost",
  ];
}

export function importActionLabel(
  mode: OpportunityMode,
  count: number,
  importing: boolean,
): string {
  if (importing) return "Importing…";
  if (!count) {
    if (mode === "amazon") return "Pick products to import for Amazon";
    if (mode === "supplier") return "Pick products to import for Amazon and eBay";
    return "Pick products to import for eBay";
  }
  if (mode === "amazon") return `Import ${count} for Amazon`;
  if (mode === "supplier") return `Import ${count} for Amazon and eBay`;
  return `Import ${count} for eBay`;
}

export function onlySellableForMode(
  mode: OpportunityMode,
  requested?: boolean,
): boolean {
  if (mode === "amazon_to_ebay") return false;
  if (mode === "amazon") return true;
  return requested !== false;
}
