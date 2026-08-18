import {
  OPPORTUNITY_CATEGORIES,
  OPPORTUNITY_LIMITS,
  opportunitySearchText,
} from "@/lib/opportunity/categories";

export const AMAZON_WINNER_CATEGORIES = OPPORTUNITY_CATEGORIES;
export const AMAZON_WINNER_LIMITS = OPPORTUNITY_LIMITS;

export function amazonWinnerSearchText(
  categoryId: string,
  extra = "",
): { query: string; category: string } {
  const row = opportunitySearchText(categoryId, extra);
  return { query: row.query, category: row.category };
}
