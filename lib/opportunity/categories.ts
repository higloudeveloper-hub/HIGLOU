/** Keepa / Amazon US browse nodes for the first opportunity set. */
export const OPPORTUNITY_CATEGORIES = [
  {
    id: "home",
    label: "Home & Kitchen",
    query: "home kitchen storage organizer",
    keepaRoot: "1055398",
  },
  {
    id: "office",
    label: "Office Products",
    query: "office desk organizer",
    keepaRoot: "1064954",
  },
  {
    id: "garden",
    label: "Patio & Garden",
    query: "patio garden outdoor",
    keepaRoot: "2972638011",
  },
  {
    id: "pets",
    label: "Pet Supplies",
    query: "pet supplies not food",
    keepaRoot: "2619533011",
  },
  {
    id: "tools",
    label: "Tools & Home",
    query: "home improvement tools",
    keepaRoot: "228013",
  },
  {
    id: "industrial",
    label: "Industrial & Scientific",
    query: "industrial hardware",
    keepaRoot: "16310091",
  },
  {
    id: "crafts",
    label: "Arts & Crafts",
    query: "arts crafts sewing",
    keepaRoot: "2617941011",
  },
  {
    id: "storage",
    label: "Storage & Organization",
    query: "storage organization",
    keepaRoot: "2422440011",
  },
] as const;

export const OPPORTUNITY_LIMITS = [1, 2, 3, 4, 5] as const;

export function opportunitySearchText(
  categoryId: string,
  extra = "",
): { query: string; category: string; keepaRoot: string } {
  const row = OPPORTUNITY_CATEGORIES.find((item) => item.id === categoryId);
  return {
    query: String(extra || "").trim(),
    category: row?.query || "",
    keepaRoot: row?.keepaRoot || "",
  };
}

const RISKY_BRAND =
  /\b(dewalt|milwaukee|makita|bosch|apple|samsung|sony|nike|adidas|olaplex|cerave|dyson|stanley black|snap-on)\b/i;
const RISKY_WORDS =
  /\b(battery|batteries|lithium|aerosol|supplement|vitamin|cosmetic|serum|makeup|infant|baby formula|food|snack|gummy|cbd|medical|ppe)\b/i;

export function brandCategoryRisk(brand: string, title: string): {
  risky: boolean;
  reason: string;
} {
  const text = `${brand} ${title}`.trim();
  if (RISKY_BRAND.test(text)) {
    return { risky: true, reason: "Big or gated brand. High IP and approval risk." };
  }
  if (RISKY_WORDS.test(text)) {
    return {
      risky: true,
      reason: "Category Higlou skips first: batteries, cosmetics, food, or regulated goods.",
    };
  }
  return { risky: false, reason: "" };
}
