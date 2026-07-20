import { isCategoryProductMismatch } from "@/lib/ebay/category-guard";

export type EbayCategoryOption = {
  id: string;
  name: string;
  keywords: string[];
};

/**
 * Curated US eBay leaf categories for automatic assignment.
 * IDs must be unique. AI must pick from these whenever possible.
 */
export const EBAY_CATEGORY_OPTIONS: EbayCategoryOption[] = [
  // Footwear
  {
    id: "15709",
    name: "Men's Athletic Shoes",
    keywords: [
      "sneaker",
      "sneakers",
      "athletic shoe",
      "running shoe",
      "air force",
      "jordan",
      "dunk",
      "trainer",
      "tennis shoe",
      "mens sneakers",
      "men sneaker",
      "shoe men",
    ],
  },
  {
    id: "95672",
    name: "Women's Athletic Shoes",
    keywords: [
      "women sneaker",
      "womens sneaker",
      "women athletic shoe",
      "ladies sneaker",
    ],
  },
  {
    id: "24087",
    name: "Men's Casual Shoes",
    keywords: ["casual shoe", "loafers", "boat shoe", "oxford shoe"],
  },
  {
    id: "3034",
    name: "Men's Boots",
    keywords: ["boot", "boots", "work boot", "chelsea boot", "mens boots"],
  },
  {
    id: "53557",
    name: "Women's Boots",
    keywords: ["women boot", "womens boots", "ankle boot"],
  },
  {
    id: "11632",
    name: "Women's Sandals & Flip Flops",
    keywords: ["sandal", "flip flop", "slides"],
  },

  // Apparel
  {
    id: "11483",
    name: "Men's T-Shirts",
    keywords: ["t-shirt", "tee", "tshirt", "graphic tee", "mens tee"],
  },
  {
    id: "15687",
    name: "Men's Sweatshirts & Hoodies",
    keywords: ["hoodie", "sweatshirt", "hoodie jacket"],
  },
  {
    id: "57990",
    name: "Men's Coats & Jackets",
    keywords: ["jacket", "coat", "puffer", "windbreaker"],
  },
  {
    id: "57988",
    name: "Men's Casual Pants",
    keywords: ["pants", "chinos", "trousers"],
  },
  {
    id: "11554",
    name: "Jeans",
    keywords: ["jeans", "denim pants"],
  },
  {
    id: "63862",
    name: "Women's Dresses",
    keywords: ["dress", "dresses", "gown"],
  },
  {
    id: "53159",
    name: "Women's Tops & Blouses",
    keywords: ["blouse", "women top", "crop top"],
  },
  {
    id: "63863",
    name: "Women's Jeans",
    keywords: ["women jeans", "womens jeans"],
  },
  {
    id: "1059",
    name: "Men's Socks",
    keywords: ["socks", "crew socks"],
  },
  {
    id: "45238",
    name: "Men's Underwear",
    keywords: ["boxer", "briefs", "underwear"],
  },
  {
    id: "155183",
    name: "Men's Hats",
    keywords: ["cap", "hat", "beanie", "fitted hat"],
  },

  // Bags & accessories
  {
    id: "169291",
    name: "Backpacks",
    keywords: ["backpack", "bookbag", "rucksack"],
  },
  {
    id: "45220",
    name: "Women's Handbags & Bags",
    keywords: ["handbag", "purse", "tote bag", "shoulder bag"],
  },
  {
    id: "260324",
    name: "Watches, Parts & Accessories",
    keywords: ["watch", "wristwatch"],
  },
  {
    id: "261981",
    name: "Fashion Jewelry",
    keywords: ["necklace", "bracelet", "earrings", "jewelry"],
  },
  {
    id: "2993",
    name: "Men's Sunglasses",
    keywords: ["sunglasses", "shades", "eyewear"],
  },
  {
    id: "45237",
    name: "Belts",
    keywords: ["belt", "leather belt"],
  },

  // Phones & electronics
  {
    id: "9355",
    name: "Cell Phones & Smartphones",
    keywords: [
      "iphone",
      "smartphone",
      "android phone",
      "galaxy phone",
      "pixel phone",
      "cellphone",
      "mobile phone",
    ],
  },
  {
    id: "123422",
    name: "Phone Cases, Covers & Skins",
    keywords: ["phone case", "iphone case", "phone cover"],
  },
  {
    id: "112529",
    name: "Headphones",
    keywords: ["headphone", "earbuds", "airpods", "earphones", "headset"],
  },
  {
    id: "14971",
    name: "Portable Speakers & Docks",
    keywords: ["bluetooth speaker", "portable speaker", "speaker"],
  },
  {
    id: "171485",
    name: "Tablets & eBook Readers",
    keywords: ["ipad", "tablet", "kindle", "galaxy tab"],
  },
  {
    id: "31534",
    name: "Tablet & eBook Accessories",
    keywords: ["tablet case", "ipad case", "kindle case"],
  },
  {
    id: "175672",
    name: "PC Laptops & Netbooks",
    keywords: ["laptop", "macbook", "notebook computer", "chromebook"],
  },
  {
    id: "58058",
    name: "PC Desktops & All-In-Ones",
    keywords: ["desktop pc", "tower pc", "gaming pc"],
  },
  {
    id: "31530",
    name: "Mice, Trackballs & Touchpads",
    keywords: ["computer mouse", "gaming mouse"],
  },
  {
    id: "33963",
    name: "Keyboards",
    keywords: ["keyboard", "mechanical keyboard"],
  },
  {
    id: "625",
    name: "Cameras & Photo",
    keywords: ["camera", "dslr", "mirrorless", "gopro"],
  },
  {
    id: "11071",
    name: "Digital Cameras",
    keywords: ["digital camera", "point and shoot"],
  },
  {
    id: "32852",
    name: "TVs",
    keywords: ["tv", "television", "smart tv", "oled"],
  },
  {
    id: "139971",
    name: "Video Game Consoles",
    keywords: ["playstation", "xbox", "nintendo switch", "console"],
  },
  {
    id: "139973",
    name: "Video Games",
    keywords: ["video game", "ps5 game", "xbox game", "switch game"],
  },
  {
    id: "164",
    name: "Computer Components & Parts",
    keywords: ["gpu", "graphics card", "cpu", "motherboard", "ram"],
  },
  {
    id: "178893",
    name: "Smart Watches",
    keywords: ["apple watch", "smart watch", "fitbit", "galaxy watch"],
  },
  {
    id: "67891",
    name: "Cables & Connectors",
    keywords: ["usb cable", "charger cable", "hdmi cable", "adapter"],
  },
  {
    id: "48627",
    name: "Batteries",
    keywords: ["power bank", "portable charger", "battery pack"],
  },

  // Home & bedding
  {
    id: "177019",
    name: "Comforter Sets",
    keywords: ["comforter set", "comforter", "bedding set", "duvet set"],
  },
  {
    id: "20440",
    name: "Sheet & Pillowcase Sets",
    keywords: ["sheet set", "bed sheet", "fitted sheet", "pillowcase"],
  },
  {
    id: "47140",
    name: "Quilts, Bedspreads & Coverlets",
    keywords: ["quilt", "bedspread", "coverlet"],
  },
  {
    id: "131583",
    name: "Blankets & Throws",
    keywords: ["blanket", "throw blanket"],
  },
  {
    id: "20433",
    name: "Pillows",
    keywords: ["pillow", "bed pillow", "decorative pillow"],
  },
  {
    id: "20606",
    name: "Curtains & Drapes",
    keywords: ["curtain", "drape", "window curtain"],
  },
  {
    id: "45515",
    name: "Rugs & Carpets",
    keywords: ["rug", "carpet", "area rug"],
  },
  {
    id: "175755",
    name: "Bath Towels & Washcloths",
    keywords: ["towel", "bath towel", "washcloth"],
  },
  {
    id: "20620",
    name: "Lamps, Lighting & Ceiling Fans",
    keywords: ["lamp", "light fixture", "ceiling fan", "chandelier"],
  },
  {
    id: "10034",
    name: "Home Décor",
    keywords: ["home decor", "wall art", "vase", "decor"],
  },
  {
    id: "20601",
    name: "Kitchen Storage & Organization",
    keywords: ["kitchen organizer", "food storage", "pantry"],
  },
  {
    id: "20658",
    name: "Cookware",
    keywords: ["pan", "pot", "skillet", "cookware"],
  },
  {
    id: "20697",
    name: "Small Kitchen Appliances",
    keywords: [
      "blender",
      "toaster",
      "air fryer",
      "coffee maker",
      "mixer",
      "instant pot",
    ],
  },
  {
    id: "71262",
    name: "Mini Fridges",
    keywords: [
      "mini fridge",
      "minifridge",
      "beverage cooler",
      "compact fridge",
      "retro mini fridge",
      "dorm fridge",
    ],
  },
  {
    id: "20713",
    name: "Refrigerators",
    keywords: [
      "refrigerator",
      "fridge",
      "freezer",
      "refrigerador",
      "french door fridge",
    ],
  },
  {
    id: "71256",
    name: "Washing Machines",
    keywords: ["washer", "washing machine", "lavadora"],
  },
  {
    id: "71250",
    name: "Ranges & Stoves",
    keywords: ["range oven", "stove", "estufa", "range"],
  },
  {
    id: "150140",
    name: "Microwaves",
    keywords: ["microwave", "microondas"],
  },
  {
    id: "79624",
    name: "Dehumidifiers",
    keywords: ["dehumidifier", "dehumidifiers"],
  },
  {
    id: "29929",
    name: "Vacuums",
    keywords: ["vacuum", "robot vacuum", "roomba", "stick vacuum"],
  },
  {
    id: "131569",
    name: "Air Conditioners & Heaters",
    keywords: ["air conditioner", "ac unit", "space heater", "portable ac"],
  },
  {
    id: "36025",
    name: "Dinnerware & Serveware",
    keywords: ["plates", "bowls", "dinnerware", "serving platter"],
  },
  {
    id: "20667",
    name: "Mattresses",
    keywords: ["mattress", "memory foam mattress"],
  },
  {
    id: "3197",
    name: "Furniture",
    keywords: ["sofa", "desk", "dresser", "indoor furniture", "mueble de sala"],
  },
  {
    id: "20524",
    name: "Patio Furniture Sets",
    keywords: [
      "patio furniture set",
      "patio dining set",
      "patio set",
      "outdoor patio",
      "outdoor furniture set",
      "juego de patio",
      "muebles de patio",
      "muebles de exterior",
      "muebles de jardín",
      "garden furniture",
      "wicker patio",
    ],
  },

  // Beauty
  {
    id: "11874",
    name: "Makeup",
    keywords: ["makeup", "lipstick", "foundation", "mascara"],
  },
  {
    id: "11863",
    name: "Skin Care",
    keywords: ["skincare", "moisturizer", "serum", "face cream"],
  },
  {
    id: "11838",
    name: "Fragrances",
    keywords: ["perfume", "cologne", "fragrance", "eau de"],
  },
  {
    id: "11854",
    name: "Hair Care & Styling",
    keywords: ["shampoo", "conditioner", "hair dryer", "hair oil"],
  },

  // Toys / baby / sports
  {
    id: "220",
    name: "Toys & Hobbies",
    keywords: ["toy", "action figure", "doll"],
  },
  {
    id: "19069",
    name: "Building Toys",
    keywords: ["lego", "lego set", "building blocks"],
  },
  {
    id: "376",
    name: "Clothing, Shoes & Accessories for Babies & Toddlers",
    keywords: ["baby clothes", "onesie", "baby outfit"],
  },
  {
    id: "66732",
    name: "Baby Strollers",
    keywords: ["stroller", "baby stroller"],
  },
  {
    id: "66734",
    name: "Baby Car Seats",
    keywords: ["car seat", "infant car seat"],
  },
  {
    id: "15273",
    name: "Exercise & Fitness",
    keywords: ["dumbbell", "yoga mat", "resistance band", "kettlebell"],
  },
  {
    id: "7294",
    name: "Cycling",
    keywords: ["bicycle", "bike", "cycling"],
  },
  {
    id: "16034",
    name: "Camping & Hiking",
    keywords: ["tent", "camping", "sleeping bag"],
  },

  // Automotive / tools
  {
    id: "6030",
    name: "Car & Truck Parts",
    keywords: ["car part", "auto part", "truck part"],
  },
  {
    id: "179421",
    name: "In-Car Electronics Mounts & Holders",
    keywords: ["car phone mount", "dash mount"],
  },
  {
    id: "46578",
    name: "Power Tools",
    keywords: ["drill", "power tool", "impact driver", "circular saw"],
  },
  {
    id: "20779",
    name: "Hand Tools",
    keywords: ["wrench", "screwdriver set", "pliers", "hand tools"],
  },

  // Food & drink + hydration
  {
    id: "185035",
    name: "Coffee, Tea & Soft Drinks",
    keywords: [
      "bottled water",
      "purified water",
      "spring water",
      "sparkling water",
      "soft drink",
      "soda",
      "cola",
      "beverage",
      "juice",
      "aquafina",
      "dasani",
      "energy drink",
      "sports drink",
      "fl oz",
      "fluid ounce",
    ],
  },
  {
    id: "181408",
    name: "Canteens, Bottles & Flasks",
    keywords: [
      "water bottle",
      "reusable water bottle",
      "hydration flask",
      "canteen",
      "hydro flask",
      "insulated bottle",
      "tumbler",
      "stanley cup",
      "drinkware",
    ],
  },

  // Pets
  {
    id: "20742",
    name: "Dog Supplies",
    keywords: ["dog toy", "dog bed", "dog leash", "dog collar", "dog food"],
  },
  {
    id: "20737",
    name: "Cat Supplies",
    keywords: ["cat litter", "cat tree", "cat toy", "cat food"],
  },

  // Books / media / office
  {
    id: "267",
    name: "Books & Magazines",
    keywords: ["book", "novel", "paperback", "hardcover"],
  },
  {
    id: "617",
    name: "DVDs & Blu-ray Discs",
    keywords: ["dvd", "blu-ray", "bluray"],
  },
  {
    id: "171958",
    name: "Printers",
    keywords: ["printer", "inkjet", "laser printer"],
  },
  {
    id: "58272",
    name: "Office Equipment & Supplies",
    keywords: ["stapler", "notebook", "office supplies"],
  },
];

export function getEbayCategoryCatalogForPrompt() {
  return EBAY_CATEGORY_OPTIONS.map(({ id, name }) => ({ id, name }));
}

/** Thin optional tip examples for prompts — NOT a closed catalog of allowed IDs. */
export function getEbayCategoryExamplesForPrompt() {
  return [
    { id: "15709", name: "Men's Athletic Shoes", note: "sneakers / trainers" },
    { id: "177019", name: "Comforter Sets", note: "bedding sets" },
    { id: "123422", name: "Phone Cases, Covers & Skins", note: "phone case not the phone" },
    { id: "112529", name: "Headphones", note: "earbuds / wireless headphones" },
    { id: "43962", name: "ATVs", note: "quad / 4-wheeler / off-road ATV — never clothing" },
    { id: "9355", name: "Cell Phones & Smartphones", note: "actual phone device" },
    { id: "175672", name: "PC Laptops & Netbooks", note: "laptop computers" },
    {
      id: "185035",
      name: "Coffee, Tea & Soft Drinks",
      note: "bottled water / soda / juice — NEVER fishing or camping",
    },
    {
      id: "181408",
      name: "Canteens, Bottles & Flasks",
      note: "empty reusable water bottles / tumblers / flasks",
    },
  ];
}

const APPAREL_CATEGORY_IDS = new Set([
  "11483",
  "15687",
  "57990",
  "57988",
  "11554",
  "63862",
  "53159",
  "63863",
  "1059",
  "45238",
  "155183",
  "95672",
]);

const NON_APPAREL_HINT =
  /\b(atv|utv|quad|4[\s-]?wheeler|motorcycle|scooter|dirt\s*bike|go[\s-]?kart|lawn\s*mower|generator|refrigerator|washer|dryer|vehicle|engine|cc\s*\d{2,4}|\d{2,4}\s*cc)\b/i;

const PATIO_OUTDOOR_HINT =
  /\b(patio|outdoor\s+furniture|outdoor\s+patio|juego\s+de\s+patio|muebles?\s+de\s+(patio|exterior|jard[ií]n)|patio\s+(set|dining|furniture|table|chair)|garden\s+furniture|wicker\s+patio)\b/i;

const INDOOR_FURNITURE_SCORE_IDS = new Set([
  "3197",
  "107578",
  "38204",
  "38208",
  "20480",
  "175758",
  "103431",
]);

export function findEbayCategoryById(categoryId: string) {
  return EBAY_CATEGORY_OPTIONS.find((c) => c.id === categoryId.trim()) ?? null;
}

export function scoreEbayCategories(input: {
  categoryName?: string | null;
  productType?: string | null;
  title?: string | null;
  brand?: string | null;
  materials?: string[] | null;
  features?: string[] | null;
}): Array<{ option: EbayCategoryOption; score: number }> {
  const haystack = [
    input.categoryName,
    input.productType,
    input.title,
    input.brand,
    ...(input.materials ?? []),
    ...(input.features ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!haystack) return [];

  const blocksApparel = NON_APPAREL_HINT.test(haystack);
  const isPatioOutdoor = PATIO_OUTDOOR_HINT.test(haystack);

  return EBAY_CATEGORY_OPTIONS.map((option) => {
    if (blocksApparel && APPAREL_CATEGORY_IDS.has(option.id)) {
      return { option, score: 0 };
    }

    let score = 0;
    const productTypeLc = String(input.productType || "")
      .trim()
      .toLowerCase();

    for (const keyword of option.keywords) {
      const k = keyword.trim().toLowerCase();
      if (!k) continue;
      const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const whole = k.includes(" ")
        ? haystack.includes(k)
        : new RegExp(`(?:^|[^a-z0-9])${escaped}s?(?:[^a-z0-9]|$)`, "i").test(
            haystack,
          );
      if (!whole) continue;
      score += Math.max(3, k.split(/\s+/).length * 4 + k.length / 3);
      if (productTypeLc && (productTypeLc === k || productTypeLc === `${k}s`)) {
        score += 16;
      }
    }
    if (
      productTypeLc &&
      option.name.toLowerCase().includes(productTypeLc)
    ) {
      score += 8;
    }
    if (
      input.categoryName &&
      option.name.toLowerCase().includes(String(input.categoryName).toLowerCase())
    ) {
      score += 12;
    }

    if (isPatioOutdoor) {
      if (option.id === "20524") score += 48;
      else if (option.id === "79684" && /\b(camastro|lounger|chaise)\b/i.test(haystack)) {
        score += 24;
      } else if (INDOOR_FURNITURE_SCORE_IDS.has(option.id)) {
        score = Math.max(0, score - 50);
      }
    }

    return { option, score };
  })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function isValidEbayCategoryId(value: string | null | undefined): boolean {
  return /^\d{3,8}$/.test(String(value ?? "").trim());
}

export function resolveEbayCategory(input: {
  categoryId?: string | null;
  categoryName?: string | null;
  productType?: string | null;
  title?: string | null;
  brand?: string | null;
  materials?: string[] | null;
  features?: string[] | null;
}): {
  categoryId: string;
  categoryName: string;
  inferred: boolean;
  confidence: number;
} {
  const rawId = (input.categoryId || "").trim();
  const existingName = (input.categoryName || "").trim();

  const typeHint =
    input.productType ||
    (!isValidEbayCategoryId(rawId) && rawId && !/^\d+$/.test(rawId)
      ? rawId
      : null);

  const ranked = scoreEbayCategories({
    ...input,
    productType: typeHint || input.productType,
    categoryName: existingName || undefined,
  });
  const best = ranked[0];

  // Keep numeric leaf only when it does not contradict product signals.
  if (
    isValidEbayCategoryId(rawId) &&
    !isCategoryProductMismatch({
      ...input,
      categoryId: rawId,
      categoryName: existingName,
    })
  ) {
    const known = findEbayCategoryById(rawId);
    // Prefer strong catalog keyword match when model ID is unknown / weak.
    if (
      !known &&
      best &&
      best.score >= 14 &&
      best.option.id !== rawId
    ) {
      return {
        categoryId: best.option.id,
        categoryName: best.option.name,
        inferred: true,
        confidence: Math.min(0.9, 0.55 + best.score / 50),
      };
    }
    return {
      categoryId: rawId,
      categoryName: existingName || known?.name || "",
      inferred: false,
      confidence: known ? 0.95 : 0.82,
    };
  }

  // High bar — weak keyword hits must not invent jeans for arbitrary products.
  if (!best || best.score < 6) {
    return {
      categoryId: "",
      categoryName: existingName,
      inferred: false,
      confidence: 0,
    };
  }

  return {
    categoryId: best.option.id,
    categoryName: best.option.name,
    inferred: true,
    confidence: Math.min(0.88, 0.5 + best.score / 50),
  };
}
