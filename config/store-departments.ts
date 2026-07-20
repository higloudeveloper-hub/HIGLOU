/**
 * Shared Higlou Store / Don Baraton department taxonomy.
 * eBay leaf Category ID (CSV) → store browse department.
 * Keep in sync with Don Baraton via: node scripts/sync-store-taxonomy.mjs
 */

export type StoreDepartment = {
  slug: string;
  name: string;
  leafIds: string[];
  keywords: string[];
};

export const STORE_DEPARTMENTS: StoreDepartment[] = [
  {
    slug: "bedding",
    name: "Bedding",
    leafIds: ["177019", "20440", "47140", "131583", "20433", "20667"],
    keywords: [
      "comforter",
      "sheet",
      "pillow",
      "duvet",
      "quilt",
      "blanket",
      "bedding",
      "mattress",
    ],
  },
  {
    slug: "lighting",
    name: "Lighting",
    leafIds: ["20620"],
    keywords: ["light", "lamp", "flood", "fixture", "ceiling fan", "bulb"],
  },
  {
    slug: "kitchen-appliances",
    name: "Kitchen & Appliances",
    leafIds: [
      "20697",
      "20658",
      "20601",
      "36025",
      "79624",
      "29929",
      "131569",
      "185111",
      "71262",
      "20713",
      "71256",
      "71250",
      "150140",
      "184300",
    ],
    keywords: [
      "refrigerator",
      "fridge",
      "mini fridge",
      "dehumidifier",
      "appliance",
      "blender",
      "toaster",
      "cookware",
      "kitchen",
      "vacuum",
      "air conditioner",
      "washer",
      "microwave",
      "stove",
      "range",
      "laundry",
      "detergent",
    ],
  },
  {
    slug: "home-decor",
    name: "Home Décor",
    leafIds: ["10034", "20606", "45515", "175755", "3197"],
    keywords: ["decor", "curtain", "rug", "towel", "furniture", "vase"],
  },
  {
    slug: "electronics",
    name: "Electronics",
    leafIds: [
      "293",
      "15032",
      "9355",
      "175672",
      "58058",
      "32852",
      "112529",
      "14971",
      "178893",
      "171485",
      "139971",
      "139973",
      "625",
      "11071",
      "164",
      "67891",
      "48627",
      "31530",
      "33963",
      "123422",
      "31534",
      "171958",
    ],
    keywords: [
      "phone",
      "laptop",
      "tv",
      "camera",
      "headphone",
      "tablet",
      "console",
      "electronic",
    ],
  },
  {
    slug: "fashion",
    name: "Fashion",
    leafIds: [
      "11483",
      "15687",
      "57990",
      "57988",
      "11554",
      "63862",
      "53159",
      "63863",
      "15709",
      "95672",
      "24087",
      "3034",
      "53557",
      "11632",
      "1059",
      "45238",
      "155183",
      "45220",
      "169291",
      "45237",
      "2993",
      "261981",
      "260324",
    ],
    keywords: ["shirt", "shoe", "dress", "jeans", "jacket", "fashion", "apparel"],
  },
  {
    slug: "health-beauty",
    name: "Health & Beauty",
    leafIds: ["11874", "11863", "11838", "11854", "26395"],
    keywords: ["makeup", "skin", "perfume", "shampoo", "beauty"],
  },
  {
    slug: "toys-baby",
    name: "Toys & Baby",
    leafIds: ["220", "19069", "376", "66732", "66734", "66734"],
    keywords: ["toy", "lego", "baby", "stroller"],
  },
  {
    slug: "sports-outdoors",
    name: "Sports & Outdoors",
    leafIds: ["15273", "16034", "7294", "888", "43962", "20524", "79684", "151621"],
    keywords: ["fitness", "camp", "bike", "sport", "atv", "patio", "outdoor", "jardín"],
  },
  {
    slug: "tools-auto",
    name: "Tools & Automotive",
    leafIds: ["20779", "46578", "631", "6030", "6000", "179421"],
    keywords: ["tool", "drill", "auto", "car part"],
  },
  {
    slug: "food-beverage",
    name: "Food & Beverage",
    leafIds: ["185035", "181408"],
    keywords: ["water", "drink", "beverage", "food", "coffee", "snack"],
  },
];

/** Leaf names for IDs that may come from free-form eBay / AI outside curated list */
export const EXTRA_LEAF_NAMES: Record<string, string> = {
  "79624": "Dehumidifiers",
  "131569": "Air Conditioners & Heaters",
  "185111": "Window & Wall Air Conditioners",
  "29929": "Vacuums",
  "20612": "Air Cannon Fan",
  "20620": "Lighting Fans",
  "117503": "Chandeliers & Ceiling Fixtures",
  "20524": "Patio Furniture Sets",
};

export const FALLBACK_DEPARTMENT: StoreDepartment = {
  slug: "more",
  name: "More",
  leafIds: [],
  keywords: [],
};

const LEAF_TO_DEPARTMENT = new Map<string, StoreDepartment>();
for (const dept of STORE_DEPARTMENTS) {
  for (const id of dept.leafIds) {
    LEAF_TO_DEPARTMENT.set(id, dept);
  }
}

export function departmentForLeafId(leafId: string): StoreDepartment | null {
  const id = String(leafId || "").replace(/\D/g, "");
  return id ? LEAF_TO_DEPARTMENT.get(id) ?? null : null;
}

export function departmentBySlug(slug: string): StoreDepartment | null {
  return STORE_DEPARTMENTS.find((d) => d.slug === slug) ?? null;
}

export function guessDepartmentFromText(blob: string): StoreDepartment | null {
  const text = blob.toLowerCase();
  for (const dept of STORE_DEPARTMENTS) {
    if (dept.keywords.some((kw) => text.includes(kw))) return dept;
  }
  return null;
}

export function resolveStoreDepartment(input: {
  categoryId?: string | null;
  categoryName?: string | null;
  productType?: string | null;
  title?: string | null;
}): {
  slug: string;
  name: string;
  leafId: string;
  leafName: string;
} {
  const leafId = String(input.categoryId || "").replace(/\D/g, "");
  const blob = `${input.title ?? ""} ${input.categoryName ?? ""} ${input.productType ?? ""}`.toLowerCase();

  let leafName =
    EXTRA_LEAF_NAMES[leafId] ||
    (input.categoryName && !/^Category\s+\d+/i.test(input.categoryName)
      ? input.categoryName
      : "") ||
    input.productType ||
    "General";

  const dept =
    departmentForLeafId(leafId) ||
    guessDepartmentFromText(blob) ||
    FALLBACK_DEPARTMENT;

  if (EXTRA_LEAF_NAMES[leafId]) leafName = EXTRA_LEAF_NAMES[leafId];

  return {
    slug: dept.slug,
    name: dept.name,
    leafId,
    leafName,
  };
}
