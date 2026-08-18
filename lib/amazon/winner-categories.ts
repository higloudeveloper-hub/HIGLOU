export const AMAZON_WINNER_CATEGORIES = [
  { id: "tools", label: "Tools & Home", query: "home improvement tools" },
  { id: "beauty", label: "Beauty", query: "beauty" },
  { id: "hair", label: "Hair care", query: "hair care" },
  { id: "electronics", label: "Electronics", query: "electronics accessories" },
  { id: "kitchen", label: "Kitchen", query: "kitchen gadgets" },
  { id: "auto", label: "Automotive", query: "car accessories" },
  { id: "sports", label: "Sports", query: "sports outdoors" },
  { id: "health", label: "Health", query: "health household" },
  { id: "pets", label: "Pets", query: "pet supplies" },
  { id: "garden", label: "Garden", query: "garden outdoor" },
  { id: "office", label: "Office", query: "office products" },
  { id: "baby", label: "Baby", query: "baby" },
] as const;

export const AMAZON_WINNER_LIMITS = [1, 2, 3, 4, 5] as const;

export function amazonWinnerSearchText(
  categoryId: string,
  extra = "",
): { query: string; category: string } {
  const category =
    AMAZON_WINNER_CATEGORIES.find((row) => row.id === categoryId)?.query || "";
  return {
    query: String(extra || "").trim(),
    category,
  };
}
