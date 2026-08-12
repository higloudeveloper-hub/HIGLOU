/**
 * Higlou eBay Store organization — list offers, resolve Store category paths,
 * and assign folders via Trading ReviseFixedPriceItem (not Inventory updateOffer).
 * Scope: Higlou only (higloudeveloper-hub/HIGLOU).
 */

import { getEbayConfig } from "@/lib/ebay/config";

export type EbayStoreCategory = {
  path: string;
  name: string;
  /** Numeric Store category ID from GetStore (needed for Trading API revise). */
  categoryId?: string;
};

export type EbayStoreOfferRow = {
  offerId: string;
  sku: string;
  status: string;
  title: string;
  categoryId: string;
  listingId: string | null;
  price: number | null;
  currentStorePaths: string[];
};

export type StoreOrganizeSuggestion = EbayStoreOfferRow & {
  suggestedPath: string;
  confidence: number;
  reason: string;
  needsReview: boolean;
  unchanged: boolean;
};

/** Suggested Store tree — create matching folders in Seller Hub if missing. */
export const HIGLOU_DEFAULT_STORE_PATHS: string[] = [
  "/Lighting",
  "/Lighting/Ceiling Lights",
  "/Lighting/Lamps",
  "/Plumbing",
  "/Plumbing/Pumps",
  "/Plumbing/Faucets",
  "/Tools",
  "/Tools/Power Tools",
  "/Home",
  "/Home/Kitchen",
  "/Home/Vacuum & Cleaning",
  "/Automotive",
  "/Electronics",
  "/Other",
];

async function inventoryFetch(
  accessToken: string,
  path: string,
  init: RequestInit = {},
) {
  const cfg = getEbayConfig();
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  headers.set("Accept-Language", "en-US");
  headers.set("Content-Language", "en-US");
  headers.set("X-EBAY-C-MARKETPLACE-ID", "EBAY_US");

  const res = await fetch(`${cfg.apiBase}${path}`, { ...init, headers });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = json as {
      errors?: Array<{ message?: string; longMessage?: string; errorId?: number }>;
      message?: string;
    } | null;
    const first = err?.errors?.[0];
    throw new Error(
      `${first?.longMessage || first?.message || err?.message || `eBay API ${res.status}`}${first?.errorId ? ` [eBay ${first.errorId}]` : ""}`,
    );
  }
  return json;
}

function normalizeStorePath(path: string): string {
  let p = String(path || "").trim().replace(/\\/g, "/");
  if (!p) return "";
  if (!p.startsWith("/")) p = `/${p}`;
  p = p.replace(/\/+/g, "/");
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

function escapeXml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Flatten CustomCategory + nested ChildCategory nodes from GetStore XML.
 * Exported for unit tests.
 */
export function parseStoreCategoriesFromXml(xml: string): EbayStoreCategory[] {
  const out: EbayStoreCategory[] = [];
  const tokenRe =
    /<\/?(?:CustomCategory|ChildCategory)>|<CategoryID>(\d+)<\/CategoryID>|<Name>([^<]*)<\/Name>/gi;
  const stack: Array<{ id?: string; name?: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(xml))) {
    const token = match[0];
    if (/^<(CustomCategory|ChildCategory)>/i.test(token)) {
      stack.push({});
      continue;
    }
    if (/^<\/(CustomCategory|ChildCategory)>/i.test(token)) {
      const node = stack.pop();
      if (!node?.name) continue;
      const names = [
        ...stack.map((frame) => frame.name).filter(Boolean),
        node.name,
      ] as string[];
      const path = normalizeStorePath(`/${names.join("/")}`);
      if (!path) continue;
      if (
        !out.some(
          (c) =>
            c.path === path ||
            (node.id && c.categoryId === node.id),
        )
      ) {
        out.push({ path, name: node.name, categoryId: node.id });
      }
      continue;
    }
    if (!stack.length) continue;
    if (match[1]) stack[stack.length - 1].id = match[1];
    else if (typeof match[2] === "string") {
      stack[stack.length - 1].name = match[2].trim();
    }
  }
  return out;
}

async function tradingApiCall(
  accessToken: string,
  callName: string,
  xmlBody: string,
): Promise<string> {
  const cfg = getEbayConfig();
  const res = await fetch(`${cfg.apiBase}/ws/api.dll`, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "X-EBAY-API-IAF-TOKEN": accessToken,
      "X-EBAY-API-CALL-NAME": callName,
      "X-EBAY-API-SITEID": "0",
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1193",
    },
    body: xmlBody,
  });
  const xml = await res.text();
  if (!res.ok || /<Ack>Failure<\/Ack>/i.test(xml)) {
    const msg =
      xml.match(/<LongMessage>([^<]+)<\/LongMessage>/)?.[1] ||
      xml.match(/<ShortMessage>([^<]+)<\/ShortMessage>/)?.[1] ||
      `${callName} failed`;
    throw new Error(msg);
  }
  return xml;
}

function resolveStoreCategoryId(
  path: string,
  categories: EbayStoreCategory[],
): string | null {
  const needle = normalizeStorePath(path);
  const exact = categories.find(
    (c) => normalizeStorePath(c.path) === needle && c.categoryId,
  );
  if (exact?.categoryId) return exact.categoryId;
  const leaf = needle.split("/").filter(Boolean).pop()?.toLowerCase();
  if (!leaf) return null;
  const byName = categories.find(
    (c) => c.categoryId && c.name.trim().toLowerCase() === leaf,
  );
  return byName?.categoryId || null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForStoreCategoryTask(
  accessToken: string,
  taskId: string,
): Promise<void> {
  for (let attempt = 0; attempt < 24; attempt++) {
    const xml = await tradingApiCall(
      accessToken,
      "GetStoreCategoryUpdateStatus",
      `<?xml version="1.0" encoding="utf-8"?>
<GetStoreCategoryUpdateStatusRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <TaskID>${escapeXml(taskId)}</TaskID>
</GetStoreCategoryUpdateStatusRequest>`,
    );
    const status =
      xml.match(/<Status>([^<]+)<\/Status>/i)?.[1]?.trim() || "";
    if (/Complete/i.test(status)) return;
    if (/Failed/i.test(status)) {
      throw new Error(`SetStoreCategories task ${taskId} failed`);
    }
    await sleep(500);
  }
  throw new Error(`SetStoreCategories task ${taskId} timed out`);
}

/** Create one Store folder under parent (-999 = top level). */
async function addStoreCategory(
  accessToken: string,
  name: string,
  parentCategoryId: string,
): Promise<void> {
  const xml = await tradingApiCall(
    accessToken,
    "SetStoreCategories",
    `<?xml version="1.0" encoding="utf-8"?>
<SetStoreCategoriesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Action>Add</Action>
  <DestinationParentCategoryID>${escapeXml(parentCategoryId)}</DestinationParentCategoryID>
  <StoreCategories>
    <CustomCategory>
      <Name>${escapeXml(name)}</Name>
    </CustomCategory>
  </StoreCategories>
</SetStoreCategoriesRequest>`,
  );
  const taskId = xml.match(/<TaskID>(\d+)<\/TaskID>/i)?.[1];
  if (taskId) await waitForStoreCategoryTask(accessToken, taskId);
}

/**
 * Resolve Store category ID for a path; create missing folders via Trading API.
 */
export async function ensureStoreCategoryId(
  accessToken: string,
  path: string,
  categories: EbayStoreCategory[],
): Promise<{ categoryId: string; categories: EbayStoreCategory[] }> {
  let cats = categories;
  const needle = normalizeStorePath(path);
  const existing = resolveStoreCategoryId(needle, cats);
  if (existing) return { categoryId: existing, categories: cats };

  const parts = needle.split("/").filter(Boolean);
  if (!parts.length) {
    throw new Error("Store category path is empty");
  }

  let parentId = "-999";
  let built = "";
  for (const part of parts) {
    built = normalizeStorePath(`${built}/${part}`);
    let id = resolveStoreCategoryId(built, cats);
    if (!id) {
      try {
        await addStoreCategory(accessToken, part, parentId);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        // Folder may already exist under another parent — refresh and retry resolve.
        if (!/already|duplicate|exist/i.test(msg)) {
          // Still refresh; another seller session may have created it.
        }
      }
      const refreshed = await listSellerStoreCategories(accessToken);
      if (refreshed.source === "ebay" && refreshed.categories.length) {
        cats = refreshed.categories;
      }
      id = resolveStoreCategoryId(built, cats);
    }
    if (!id) {
      throw new Error(
        `Could not create or find Store folder "${built}". Open Seller Hub → Store → Categories, create it, reconnect eBay, then Scan again.`,
      );
    }
    parentId = id;
  }

  return { categoryId: parentId, categories: cats };
}

/** Published listings: revise Storefront only (never Inventory SKU / 25707). */
async function assignStoreCategoryViaTrading(
  accessToken: string,
  listingId: string,
  storeCategoryId: string,
): Promise<void> {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Item>
    <ItemID>${escapeXml(listingId)}</ItemID>
    <Storefront>
      <StoreCategoryID>${escapeXml(storeCategoryId)}</StoreCategoryID>
    </Storefront>
  </Item>
</ReviseFixedPriceItemRequest>`;
  await tradingApiCall(accessToken, "ReviseFixedPriceItem", xml);
}

/**
 * Try Trading API GetStore (OAuth IAF token). Falls back to Higlou defaults
 * when the seller has no Store or the call is blocked.
 */
export async function listSellerStoreCategories(
  accessToken: string,
): Promise<{ categories: EbayStoreCategory[]; source: "ebay" | "default"; warning?: string }> {
  const cfg = getEbayConfig();
  const xmlBody = `<?xml version="1.0" encoding="utf-8"?>
<GetStoreRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <CategoryStructureOnly>true</CategoryStructureOnly>
</GetStoreRequest>`;

  try {
    const res = await fetch(`${cfg.apiBase}/ws/api.dll`, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
        "X-EBAY-API-IAF-TOKEN": accessToken,
        "X-EBAY-API-CALL-NAME": "GetStore",
        "X-EBAY-API-SITEID": "0",
        "X-EBAY-API-COMPATIBILITY-LEVEL": "1193",
      },
      body: xmlBody,
    });
    const xml = await res.text();
    if (!res.ok || /<Ack>Failure<\/Ack>/i.test(xml)) {
      const msg =
        xml.match(/<ShortMessage>([^<]+)<\/ShortMessage>/)?.[1] ||
        xml.match(/<LongMessage>([^<]+)<\/LongMessage>/)?.[1] ||
        "GetStore failed";
      return {
        categories: HIGLOU_DEFAULT_STORE_PATHS.map((path) => ({
          path,
          name: path.split("/").filter(Boolean).pop() || path,
        })),
        source: "default",
        warning: `Could not load eBay Store categories (${msg}). Using Higlou default paths — create matching folders in Seller Hub → Store → Categories.`,
      };
    }
    const parsed = parseStoreCategoriesFromXml(xml);
    if (!parsed.length) {
      return {
        categories: HIGLOU_DEFAULT_STORE_PATHS.map((path) => ({
          path,
          name: path.split("/").filter(Boolean).pop() || path,
        })),
        source: "default",
        warning:
          "No custom Store categories found on this account. Using Higlou defaults — create these folders in Seller Hub, then re-scan.",
      };
    }
    return { categories: parsed, source: "ebay" };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      categories: HIGLOU_DEFAULT_STORE_PATHS.map((path) => ({
        path,
        name: path.split("/").filter(Boolean).pop() || path,
      })),
      source: "default",
      warning: `Store category lookup failed (${msg}). Using Higlou default paths.`,
    };
  }
}

/**
 * List active listings via Trading GetMyeBaySelling (no Inventory SKU checks).
 */
async function listSellerOffersViaTrading(
  accessToken: string,
  options?: { limit?: number; maxPages?: number },
): Promise<EbayStoreOfferRow[]> {
  const pageSize = Math.min(100, Math.max(1, options?.limit || 50));
  const maxPages = Math.min(40, Math.max(1, options?.maxPages || 10));
  const rows: EbayStoreOfferRow[] = [];
  const categoriesById = new Map<string, string>();

  // Prefetch store category id → path for currentStorePaths.
  try {
    const store = await listSellerStoreCategories(accessToken);
    for (const cat of store.categories) {
      if (cat.categoryId) categoriesById.set(cat.categoryId, cat.path);
    }
  } catch {
    // optional
  }

  for (let page = 1; page <= maxPages; page++) {
    const xml = await tradingApiCall(
      accessToken,
      "GetMyeBaySelling",
      `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <ActiveList>
    <Include>true</Include>
    <IncludeNotes>false</IncludeNotes>
    <Pagination>
      <EntriesPerPage>${pageSize}</EntriesPerPage>
      <PageNumber>${page}</PageNumber>
    </Pagination>
  </ActiveList>
</GetMyeBaySellingRequest>`,
    );

    const itemBlocks = xml.match(/<Item>([\s\S]*?)<\/Item>/gi) || [];
    for (const block of itemBlocks) {
      const listingId =
        block.match(/<ItemID>([^<]+)<\/ItemID>/i)?.[1]?.trim() || "";
      if (!listingId) continue;
      const title =
        block.match(/<Title>([^<]*)<\/Title>/i)?.[1]?.trim() || listingId;
      const sku =
        block.match(/<SKU>([^<]*)<\/SKU>/i)?.[1]?.trim() ||
        block.match(/<CustomLabel>([^<]*)<\/CustomLabel>/i)?.[1]?.trim() ||
        listingId;
      const categoryId =
        block.match(
          /<PrimaryCategory>[\s\S]*?<CategoryID>([^<]+)<\/CategoryID>/i,
        )?.[1]?.trim() || "";
      const storeCatId =
        block.match(/<StoreCategoryID>([^<]+)<\/StoreCategoryID>/i)?.[1]
          ?.trim() || "";
      const currentPath =
        (storeCatId && categoriesById.get(storeCatId)) ||
        (storeCatId ? `/${storeCatId}` : "");
      const priceRaw =
        block.match(
          /<SellingStatus>[\s\S]*?<CurrentPrice[^>]*>([^<]+)<\/CurrentPrice>/i,
        )?.[1] ||
        block.match(/<BuyItNowPrice[^>]*>([^<]+)<\/BuyItNowPrice>/i)?.[1] ||
        "";
      rows.push({
        // Use listing id as stable key — Apply never needs Inventory offerId.
        offerId: listingId,
        sku,
        status: "PUBLISHED",
        title,
        categoryId,
        listingId,
        price: Number(priceRaw) || null,
        currentStorePaths: currentPath ? [normalizeStorePath(currentPath)] : [],
      });
    }

    const totalPages = Number(
      xml.match(
        /<ActiveList>[\s\S]*?<PaginationResult>[\s\S]*?<TotalNumberOfPages>(\d+)<\/TotalNumberOfPages>/i,
      )?.[1] || "1",
    );
    if (page >= totalPages || itemBlocks.length === 0) break;
  }

  return rows;
}

export async function listSellerOffers(
  accessToken: string,
  options?: { limit?: number; maxPages?: number },
): Promise<EbayStoreOfferRow[]> {
  // Prefer Trading — Inventory update/create rejects hyphenated Higlou SKUs (25707).
  try {
    return await listSellerOffersViaTrading(accessToken, options);
  } catch (tradingError) {
    try {
      return await listSellerOffersViaInventory(accessToken, options);
    } catch (inventoryError) {
      const invMsg =
        inventoryError instanceof Error
          ? inventoryError.message
          : String(inventoryError);
      if (/25707|alphanumeric/i.test(invMsg)) {
        throw tradingError instanceof Error
          ? tradingError
          : new Error(String(tradingError));
      }
      throw inventoryError;
    }
  }
}

async function listSellerOffersViaInventory(
  accessToken: string,
  options?: { limit?: number; maxPages?: number },
): Promise<EbayStoreOfferRow[]> {
  const pageSize = Math.min(100, Math.max(1, options?.limit || 50));
  const maxPages = Math.min(40, Math.max(1, options?.maxPages || 20));
  const rows: EbayStoreOfferRow[] = [];
  let offset = 0;

  for (let page = 0; page < maxPages; page++) {
    const json = (await inventoryFetch(
      accessToken,
      `/sell/inventory/v1/offer?limit=${pageSize}&offset=${offset}`,
      { method: "GET" },
    )) as {
      total?: number;
      size?: number;
      offers?: Array<{
        offerId?: string;
        sku?: string;
        status?: string;
        categoryId?: string;
        listing?: { listingId?: string; title?: string };
        listingDescription?: string;
        storeCategoryNames?: string[];
        pricingSummary?: { price?: { value?: string } };
      }>;
    };

    const batch = json.offers || [];
    for (const offer of batch) {
      const sku = String(offer.sku || "").trim();
      const listingId = offer.listing?.listingId
        ? String(offer.listing.listingId)
        : null;
      // Organize Store only works on published items (Trading revise).
      if (!listingId) continue;
      const title =
        String(offer.listing?.title || "").trim() ||
        String(offer.listingDescription || "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 120) ||
        sku ||
        listingId;
      rows.push({
        offerId: listingId,
        sku: sku || listingId,
        status: String(offer.status || "").toUpperCase(),
        title,
        categoryId: String(offer.categoryId || ""),
        listingId,
        price: Number(offer.pricingSummary?.price?.value) || null,
        currentStorePaths: (offer.storeCategoryNames || [])
          .map(normalizeStorePath)
          .filter(Boolean),
      });
    }

    if (batch.length < pageSize) break;
    offset += pageSize;
    if (typeof json.total === "number" && offset >= json.total) break;
  }

  return rows;
}

type Rule = { path: string; patterns: RegExp[]; weight: number };

const CLASSIFY_RULES: Rule[] = [
  {
    path: "/Plumbing/Pumps",
    patterns: [/\bpump\b/i, /\bsump\b/i, /\bsubmersible\b/i, /water\s*pump/i],
    weight: 10,
  },
  {
    path: "/Plumbing/Faucets",
    patterns: [/\bfaucet\b/i, /\btap\b/i, /kitchen\s*faucet/i, /bath.*faucet/i],
    weight: 9,
  },
  {
    path: "/Plumbing",
    patterns: [/\bplumb/i, /\bvalve\b/i, /\bpipe\b/i, /\bfitting\b/i],
    weight: 5,
  },
  {
    path: "/Lighting/Ceiling Lights",
    patterns: [
      /ceiling\s*light/i,
      /flush\s*mount/i,
      /chandelier/i,
      /pendant/i,
      /recessed/i,
    ],
    weight: 9,
  },
  {
    path: "/Lighting/Lamps",
    patterns: [/\blamp\b/i, /table\s*lamp/i, /floor\s*lamp/i],
    weight: 8,
  },
  {
    path: "/Lighting",
    patterns: [/\blight(ing)?\b/i, /\bled\b/i, /fixture/i, /sconce/i],
    weight: 5,
  },
  {
    path: "/Home/Vacuum & Cleaning",
    patterns: [/\bvacuum\b/i, /roomba/i, /dyson/i, /cleaner/i],
    weight: 9,
  },
  {
    path: "/Home/Kitchen",
    patterns: [
      /cookware/i,
      /skillet/i,
      /knife/i,
      /cutlery/i,
      /kitchen/i,
      /blender/i,
    ],
    weight: 7,
  },
  {
    path: "/Home",
    patterns: [/comforter/i, /bedding/i, /duvet/i, /home\s*decor/i],
    weight: 4,
  },
  {
    path: "/Tools/Power Tools",
    patterns: [/drill/i, /saw\b/i, /grinder/i, /impact\s*driver/i, /power\s*tool/i],
    weight: 8,
  },
  {
    path: "/Tools",
    patterns: [/\btool\b/i, /wrench/i, /socket/i, /hammer/i],
    weight: 5,
  },
  {
    path: "/Automotive",
    patterns: [/\batv\b/i, /auto(motive)?/i, /car\s*part/i, /vehicle/i],
    weight: 7,
  },
  {
    path: "/Electronics",
    patterns: [/phone/i, /laptop/i, /tablet/i, /charger/i, /earbuds/i, /hdmi/i],
    weight: 6,
  },
];

function pickBestPath(
  haystack: string,
  available: string[],
): { path: string; confidence: number; reason: string } {
  const availableSet = new Set(available.map(normalizeStorePath));
  let best: { path: string; score: number; reason: string } | null = null;

  for (const rule of CLASSIFY_RULES) {
    const path = normalizeStorePath(rule.path);
    if (!availableSet.has(path)) {
      // Try parent path if leaf missing
      const parts = path.split("/").filter(Boolean);
      while (parts.length > 1) {
        parts.pop();
        const parent = normalizeStorePath(`/${parts.join("/")}`);
        if (availableSet.has(parent)) {
          const hit = rule.patterns.find((re) => re.test(haystack));
          if (hit) {
            const score = rule.weight - 2;
            if (!best || score > best.score) {
              best = {
                path: parent,
                score,
                reason: `Matched ${hit.source} → parent ${parent}`,
              };
            }
          }
          break;
        }
      }
      continue;
    }
    const hit = rule.patterns.find((re) => re.test(haystack));
    if (!hit) continue;
    if (!best || rule.weight > best.score) {
      best = {
        path,
        score: rule.weight,
        reason: `Matched /${hit.source}/ → ${path}`,
      };
    }
  }

  if (best) {
    return {
      path: best.path,
      confidence: Math.min(0.95, 0.45 + best.score / 20),
      reason: best.reason,
    };
  }

  const other =
    available.map(normalizeStorePath).find((p) => /\/other$/i.test(p)) ||
    available[0] ||
    "/Other";
  return {
    path: normalizeStorePath(other),
    confidence: 0.35,
    reason: "No strong keyword match — Other / first available",
  };
}

export function classifyOffersForStore(
  offers: EbayStoreOfferRow[],
  categories: EbayStoreCategory[],
  options?: { reviewBelow?: number },
): StoreOrganizeSuggestion[] {
  const reviewBelow = options?.reviewBelow ?? 0.55;
  const paths = categories.map((c) => normalizeStorePath(c.path)).filter(Boolean);
  const available = paths.length
    ? paths
    : HIGLOU_DEFAULT_STORE_PATHS.map(normalizeStorePath);

  return offers.map((offer) => {
    const haystack = `${offer.title} ${offer.categoryId} ${offer.sku}`;
    const picked = pickBestPath(haystack, available);
    const current = offer.currentStorePaths[0] || "";
    const unchanged =
      normalizeStorePath(current) === normalizeStorePath(picked.path);
    return {
      ...offer,
      suggestedPath: picked.path,
      confidence: picked.confidence,
      reason: picked.reason,
      needsReview: picked.confidence < reviewBelow,
      unchanged,
    };
  });
}

/**
 * Set Store folder on a published listing via Trading API only.
 * Never calls Inventory APIs (hyphenated Higlou SKUs trigger eBay 25707).
 */
export async function assignStoreCategoriesToOffer(
  accessToken: string,
  offerId: string,
  storeCategoryNames: string[],
  options?: {
    listingId?: string | null;
    categories?: EbayStoreCategory[];
    /** Mutator so apply loop can reuse newly created folder IDs. */
    setCategories?: (categories: EbayStoreCategory[]) => void;
  },
): Promise<void> {
  const paths = storeCategoryNames
    .map(normalizeStorePath)
    .filter(Boolean)
    .slice(0, 2);
  if (!paths.length) {
    throw new Error("At least one store category path is required");
  }

  let categories = options?.categories || [];
  if (!categories.some((c) => c.categoryId)) {
    const store = await listSellerStoreCategories(accessToken);
    categories = store.categories;
    options?.setCategories?.(categories);
  }

  // offerId from Trading scan is the eBay ItemID; listingId may also be set.
  const listingId =
    String(options?.listingId || "").trim() ||
    String(offerId || "").trim();

  if (!listingId || !/^\d+$/.test(listingId)) {
    throw new Error(
      "Missing eBay item ID. Only published listings can be organized. Scan again after publishing.",
    );
  }

  const ensured = await ensureStoreCategoryId(
    accessToken,
    paths[0],
    categories,
  );
  options?.setCategories?.(ensured.categories);

  await assignStoreCategoryViaTrading(
    accessToken,
    listingId,
    ensured.categoryId,
  );
}

export async function applyStoreOrganizeSuggestions(
  accessToken: string,
  suggestions: Array<{
    offerId: string;
    suggestedPath: string;
    listingId?: string | null;
    skip?: boolean;
  }>,
  categories: EbayStoreCategory[] = [],
): Promise<{
  applied: number;
  failed: Array<{ offerId: string; error: string }>;
}> {
  let applied = 0;
  const failed: Array<{ offerId: string; error: string }> = [];
  let liveCategories = categories;

  for (const row of suggestions) {
    if (row.skip) continue;
    try {
      await assignStoreCategoriesToOffer(
        accessToken,
        row.offerId,
        [row.suggestedPath],
        {
          listingId: row.listingId,
          categories: liveCategories,
          setCategories: (next) => {
            liveCategories = next;
          },
        },
      );
      applied += 1;
    } catch (error) {
      failed.push({
        offerId: row.offerId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { applied, failed };
}
