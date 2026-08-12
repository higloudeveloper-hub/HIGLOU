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
  /** Numeric StoreCategoryID from Trading (best unchanged signal). */
  currentStoreCategoryId?: string | null;
  /** Optional second Store folder (StoreCategory2ID). */
  currentStoreCategory2Id?: string | null;
  /** Extra classify signals (publish path). */
  categoryName?: string | null;
  brand?: string | null;
  productType?: string | null;
};

export type StoreOrganizeSuggestion = EbayStoreOfferRow & {
  suggestedPath: string;
  /** Optional second Store folder (eBay StoreCategory2ID). */
  suggestedPath2: string | null;
  confidence: number;
  reason: string;
  needsReview: boolean;
  unchanged: boolean;
};

/** Suggested Store tree — create matching folders via API if missing. Never use eBay reserved "Other". */
export const HIGLOU_DEFAULT_STORE_PATHS: string[] = [
  "/Lighting",
  "/Lighting/Ceiling Lights",
  "/Lighting/Lamps",
  "/Lighting/Outdoor",
  "/Lighting/Smart Lighting",
  "/Plumbing",
  "/Plumbing/Pumps",
  "/Plumbing/Faucets",
  "/Tools",
  "/Tools/Power Tools",
  "/Tools/Hand Tools",
  "/Tools/Batteries",
  "/Tools/Measuring",
  "/Tools/Accessories",
  "/Home",
  "/Home/Kitchen",
  "/Home/Vacuum & Cleaning",
  "/Home/Cleaning Accessories",
  "/Home/Storage",
  "/Automotive",
  "/Automotive/Parts",
  "/Electronics",
  "/Electronics/Cables & Chargers",
  "/Hardware",
  "/Hardware/Fasteners",
  "/Outdoor",
  "/Outdoor/Garden",
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

const EBAY_USAGE_LIMIT_RE =
  /exceeded usage limit|call usage|GetApiAccessRules|usage limit has been exceeded|Call usage limit/i;

export function isEbayUsageLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error || "");
  return EBAY_USAGE_LIMIT_RE.test(msg);
}

const EBAY_USAGE_LIMIT_MESSAGE =
  "eBay API daily call limit reached. Wait a few hours (or until tomorrow), then try Organize again — Higlou now uses fewer calls per listing.";

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
  const ack = xml.match(/<Ack>([^<]+)<\/Ack>/i)?.[1]?.trim() || "";
  if (!res.ok || /Failure/i.test(ack)) {
    const msg =
      xml.match(/<LongMessage>([^<]+)<\/LongMessage>/)?.[1] ||
      xml.match(/<ShortMessage>([^<]+)<\/ShortMessage>/)?.[1] ||
      `${callName} failed`;
    if (EBAY_USAGE_LIMIT_RE.test(msg) || EBAY_USAGE_LIMIT_RE.test(xml)) {
      throw new Error(EBAY_USAGE_LIMIT_MESSAGE);
    }
    throw new Error(msg);
  }
  return xml;
}

function isLeafStoreCategory(
  path: string,
  categories: EbayStoreCategory[],
): boolean {
  const needle = normalizeStorePath(path);
  const prefix = `${needle}/`;
  return !categories.some((c) => {
    const p = normalizeStorePath(c.path);
    return p !== needle && p.startsWith(prefix);
  });
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
  // Prefer an exact leaf name match that is actually a leaf folder.
  const byName = categories.find(
    (c) =>
      c.categoryId &&
      c.name.trim().toLowerCase() === leaf &&
      isLeafStoreCategory(c.path, categories),
  );
  if (byName?.categoryId) return byName.categoryId;
  const anyName = categories.find(
    (c) => c.categoryId && c.name.trim().toLowerCase() === leaf,
  );
  return anyName?.categoryId || null;
}

/**
 * eBay only allows items in leaf Store folders (no children).
 * If path is a parent, pick/create a leaf under it.
 */
function pickLeafStorePath(
  path: string,
  categories: EbayStoreCategory[],
): string {
  const taxonomy = mergeTaxonomyCategories(categories);
  const needle = normalizeStorePath(path);
  if (!needle) return "/Other";
  if (isLeafStoreCategory(needle, taxonomy)) return needle;

  const prefix = `${needle}/`;
  const childLeaves = taxonomy
    .map((c) => normalizeStorePath(c.path))
    .filter(
      (p) => p.startsWith(prefix) && isLeafStoreCategory(p, taxonomy),
    )
    .sort((a, b) => a.length - b.length);
  if (childLeaves[0]) return childLeaves[0];

  return normalizeStorePath(`${needle}/General`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForStoreCategoryTask(
  accessToken: string,
  taskId: string,
): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
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
    if (/Complete/i.test(status)) return xml;
    if (/Failed/i.test(status)) {
      const msg =
        xml.match(/<LongMessage>([^<]+)<\/LongMessage>/)?.[1] ||
        `SetStoreCategories task ${taskId} failed`;
      throw new Error(msg);
    }
    await sleep(700);
  }
  throw new Error(`SetStoreCategories task ${taskId} timed out`);
}

function findCategoryIdByName(
  categories: EbayStoreCategory[],
  name: string,
  parentPath: string,
): string | null {
  const needle = name.trim().toLowerCase();
  const parent = normalizeStorePath(parentPath);
  const expected = normalizeStorePath(`${parent}/${name}`);
  const exact = categories.find(
    (c) =>
      c.categoryId &&
      normalizeStorePath(c.path) === expected,
  );
  if (exact?.categoryId) return exact.categoryId;

  const underParent = categories.filter((c) => {
    if (!c.categoryId) return false;
    if (c.name.trim().toLowerCase() !== needle) return false;
    if (!parent || parent === "/") {
      // Top-level: path has one segment
      return c.path.split("/").filter(Boolean).length === 1;
    }
    return normalizeStorePath(c.path).startsWith(`${parent}/`);
  });
  return underParent[0]?.categoryId || null;
}

/**
 * Create one Store folder. Returns new CategoryID (Trading, then Stores REST).
 */
async function addStoreCategory(
  accessToken: string,
  name: string,
  parentCategoryId: string,
  parentPath: string,
  known: EbayStoreCategory[],
): Promise<{ categoryId: string; categories: EbayStoreCategory[] }> {
  const beforeIds = new Set(
    known.map((c) => c.categoryId).filter(Boolean) as string[],
  );
  let lastError = "";

  // Prefer Stores REST first (clearer create + categoryName), then Trading.
  try {
    const rest = await addStoreCategoryViaRest(
      accessToken,
      name,
      parentCategoryId === "-999" ? null : parentCategoryId,
    );
    if (rest.categoryId) {
      const path = normalizeStorePath(`${parentPath}/${name}`);
      const merged = mergeCategoryLists(known, [
        { path, name, categoryId: rest.categoryId },
      ]);
      return { categoryId: rest.categoryId, categories: merged };
    }
    if (!rest.error) {
      for (let attempt = 0; attempt < 8; attempt++) {
        await sleep(900);
        const refreshed = await listSellerStoreCategories(accessToken);
        const restCats = await listStoreCategoriesViaRest(accessToken).catch(
          () => [] as EbayStoreCategory[],
        );
        const merged = mergeCategoryLists(
          known,
          refreshed.categories,
          restCats,
        );
        const id = findCategoryIdByName(merged, name, parentPath);
        if (id) return { categoryId: id, categories: merged };
      }
    }
    lastError = rest.error || lastError;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
  }

  try {
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
    const status =
      xml.match(/<Status>([^<]+)<\/Status>/i)?.[1]?.trim() || "";
    if (taskId && !/Complete/i.test(status)) {
      await waitForStoreCategoryTask(accessToken, taskId);
    }

    for (let attempt = 0; attempt < 6; attempt++) {
      if (attempt > 0) await sleep(800);
      const refreshed = await listSellerStoreCategories(accessToken);
      const restCats = await listStoreCategoriesViaRest(accessToken).catch(
        () => [] as EbayStoreCategory[],
      );
      if (
        (refreshed.source === "ebay" && refreshed.categories.length) ||
        restCats.length
      ) {
        const merged = mergeCategoryLists(
          known,
          refreshed.categories,
          restCats,
        );
        const id =
          findCategoryIdByName(merged, name, parentPath) ||
          merged.find(
            (c) =>
              c.categoryId &&
              !beforeIds.has(c.categoryId) &&
              c.name.trim().toLowerCase() === name.trim().toLowerCase(),
          )?.categoryId;
        if (id) return { categoryId: id, categories: merged };
      }
    }
    lastError =
      lastError ||
      "SetStoreCategories finished but GetStore did not return the new folder ID yet";
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    lastError = `${lastError ? `${lastError} | ` : ""}${msg}`;
  }

  throw new Error(
    `Could not create Store folder "${normalizeStorePath(`${parentPath}/${name}`)}": ${lastError}. If this mentions scope/stores, reconnect eBay in Settings so Higlou gets sell.stores permission.`,
  );
}

function mergeCategoryLists(
  ...lists: EbayStoreCategory[][]
): EbayStoreCategory[] {
  const byPath = new Map<string, EbayStoreCategory>();
  const byId = new Map<string, EbayStoreCategory>();
  for (const list of lists) {
    for (const cat of list) {
      const path = normalizeStorePath(cat.path);
      const next = {
        path: path || normalizeStorePath(`/${cat.name}`),
        name: cat.name,
        categoryId: cat.categoryId,
      };
      if (next.categoryId) byId.set(next.categoryId, next);
      if (next.path) {
        const prev = byPath.get(next.path);
        byPath.set(next.path, {
          ...prev,
          ...next,
          categoryId: next.categoryId || prev?.categoryId,
        });
      }
    }
  }
  const out = Array.from(byPath.values());
  for (const cat of byId.values()) {
    if (!out.some((c) => c.categoryId === cat.categoryId)) out.push(cat);
  }
  return out;
}

function isReservedStoreFolderName(name: string): boolean {
  const n = String(name || "").trim();
  return !n || /^other$/i.test(n);
}

function resolveBuiltinOtherCategoryId(
  categories: EbayStoreCategory[],
): string | null {
  const other = categories.find(
    (c) =>
      c.categoryId &&
      (c.name.trim().toLowerCase() === "other" ||
        normalizeStorePath(c.path) === "/other"),
  );
  return other?.categoryId || null;
}

async function addStoreCategoryViaRest(
  accessToken: string,
  name: string,
  parentCategoryId: string | null,
): Promise<{ categoryId?: string; error?: string }> {
  if (isReservedStoreFolderName(name)) {
    return {
      error: `eBay reserves the Store folder name "${name}" — use the built-in Other category instead of creating it`,
    };
  }

  const cfg = getEbayConfig();
  const body: Record<string, string> = {
    categoryName: name.slice(0, 35),
  };
  if (parentCategoryId && parentCategoryId !== "-999") {
    body.destinationParentCategoryId = parentCategoryId;
  }

  const res = await fetch(`${cfg.apiBase}/sell/stores/v1/store/categories`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { raw: text };
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      "Missing eBay sell.stores permission — reconnect eBay in Settings",
    );
  }

  const categoryId = String(
    json.categoryId ||
      json.storeCategoryId ||
      (json.category as { categoryId?: string } | undefined)?.categoryId ||
      "",
  ).trim();
  if ((res.ok || res.status === 202) && categoryId) {
    return { categoryId };
  }
  if (res.ok || res.status === 202) {
    return { categoryId: undefined };
  }

  const errors = json.errors as
    | Array<{ message?: string; longMessage?: string }>
    | undefined;
  const msg =
    errors?.[0]?.longMessage ||
    errors?.[0]?.message ||
    (typeof json.message === "string" ? json.message : "") ||
    `Stores API ${res.status}`;
  return { error: msg };
}

async function listStoreCategoriesViaRest(
  accessToken: string,
): Promise<EbayStoreCategory[]> {
  const cfg = getEbayConfig();
  const res = await fetch(`${cfg.apiBase}/sell/stores/v1/store/categories`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    storeCategories?: Array<{
      categoryId?: string;
      name?: string;
      categoryName?: string;
      childrenCategories?: unknown;
    }>;
  };

  const out: EbayStoreCategory[] = [];
  const walk = (
    nodes: Array<{
      categoryId?: string;
      name?: string;
      categoryName?: string;
      childCategory?: unknown;
      childrenCategories?: unknown;
      children?: unknown;
    }>,
    parentPath: string,
  ) => {
    for (const node of nodes || []) {
      const name = String(node.name || node.categoryName || "").trim();
      if (!name) continue;
      const path = normalizeStorePath(`${parentPath}/${name}`);
      const categoryId = String(node.categoryId || "").trim() || undefined;
      out.push({ path, name, categoryId });
      const children = (node.childrenCategories ||
        node.childCategory ||
        node.children ||
        []) as typeof nodes;
      if (Array.isArray(children) && children.length) {
        walk(children, path);
      }
    }
  };
  walk(json.storeCategories || [], "");
  return out;
}

/**
 * Resolve Store category ID for a path; create missing folders via Trading/REST API.
 */
export async function ensureStoreCategoryId(
  accessToken: string,
  path: string,
  categories: EbayStoreCategory[],
): Promise<{ categoryId: string; categories: EbayStoreCategory[] }> {
  let cats = categories;
  // Prefer live GetStore + REST tree so we don't recreate existing folders.
  try {
    const live = await listSellerStoreCategories(accessToken);
    const rest = await listStoreCategoriesViaRest(accessToken).catch(
      () => [] as EbayStoreCategory[],
    );
    cats = mergeCategoryLists(cats, live.categories, rest);
  } catch {
    // keep provided cats
  }

  const needle = normalizeStorePath(path);

  // eBay's built-in "Other" cannot be created via API.
  if (/^\/other$/i.test(needle)) {
    const otherId = resolveBuiltinOtherCategoryId(cats);
    if (otherId) return { categoryId: otherId, categories: cats };
    throw new Error(
      'eBay reserves the Store folder "Other" — it already exists on every Store and cannot be created. Assign listings to another Higlou folder, or leave them in Other from Seller Hub.',
    );
  }

  const existing = resolveStoreCategoryId(needle, cats);
  if (existing) return { categoryId: existing, categories: cats };

  const parts = needle.split("/").filter(Boolean);
  if (!parts.length) {
    throw new Error("Store category path is empty");
  }
  if (parts.some((part) => isReservedStoreFolderName(part))) {
    throw new Error(
      `Cannot create Store folder "${needle}" — eBay does not allow empty names or the reserved name "Other".`,
    );
  }

  let parentId = "-999";
  let built = "";
  for (const part of parts) {
    const parentPath = built || "/";
    built = normalizeStorePath(`${built}/${part}`);
    let id =
      resolveStoreCategoryId(built, cats) ||
      findCategoryIdByName(cats, part, parentPath === "/" ? "" : parentPath);
    if (!id) {
      const created = await addStoreCategory(
        accessToken,
        part,
        parentId,
        parentPath === "/" ? "" : parentPath,
        cats,
      );
      cats = created.categories;
      id = created.categoryId;
      // Keep local map even if GetStore lags.
      cats = mergeCategoryLists(cats, [
        { path: built, name: part, categoryId: id },
      ]);
    }
    if (!id) {
      throw new Error(
        `Could not create or find Store folder "${built}". Reconnect eBay in Settings (needed for creating folders), then try Organize everything again.`,
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
  storeCategory2Id: string = "0",
): Promise<void> {
  const secondId = String(storeCategory2Id || "0").trim() || "0";
  const xml = await tradingApiCall(
    accessToken,
    "ReviseFixedPriceItem",
    `<?xml version="1.0" encoding="utf-8"?>
<ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Item>
    <ItemID>${escapeXml(listingId)}</ItemID>
    <Storefront>
      <StoreCategoryID>${escapeXml(storeCategoryId)}</StoreCategoryID>
      <StoreCategory2ID>${escapeXml(secondId)}</StoreCategory2ID>
    </Storefront>
  </Item>
</ReviseFixedPriceItemRequest>`,
  );

  const warningText = Array.from(
    xml.matchAll(/<LongMessage>([^<]+)<\/LongMessage>/gi),
  )
    .map((m) => m[1])
    .join(" | ");
  if (/other store category|not a leaf|has subcategor|invalid store/i.test(warningText)) {
    throw new Error(
      warningText ||
        "eBay rejected the Store folder (must be a leaf category with no subfolders).",
    );
  }

  // Trust ReviseFixedPriceItem Ack=Success. Extra GetItem verifies burned the
  // app's daily Trading call limit (1 revise + up to 4 GetItem per listing).
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

  let tradingCats: EbayStoreCategory[] = [];
  let tradingWarning = "";

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
      tradingWarning =
        xml.match(/<ShortMessage>([^<]+)<\/ShortMessage>/)?.[1] ||
        xml.match(/<LongMessage>([^<]+)<\/LongMessage>/)?.[1] ||
        "GetStore failed";
      if (EBAY_USAGE_LIMIT_RE.test(tradingWarning) || EBAY_USAGE_LIMIT_RE.test(xml)) {
        throw new Error(EBAY_USAGE_LIMIT_MESSAGE);
      }
    } else {
      tradingCats = parseStoreCategoriesFromXml(xml);
    }
  } catch (error) {
    tradingWarning = error instanceof Error ? error.message : String(error);
  }

  const restCats = await listStoreCategoriesViaRest(accessToken).catch(
    () => [] as EbayStoreCategory[],
  );
  const merged = mergeCategoryLists(tradingCats, restCats).filter(
    (c) => c.categoryId,
  );

  if (merged.length) {
    return {
      categories: merged,
      source: "ebay",
      warning: tradingWarning
        ? `GetStore note: ${tradingWarning}. Using Store category IDs from available eBay APIs.`
        : undefined,
    };
  }

  return {
    categories: HIGLOU_DEFAULT_STORE_PATHS.map((path) => ({
      path,
      name: path.split("/").filter(Boolean).pop() || path,
    })),
    source: "default",
    warning:
      tradingWarning
        ? `Could not load eBay Store categories (${tradingWarning}). Using Higlou defaults — Organize will create folders via API (reconnect eBay if create fails).`
        : "No custom Store categories found yet. Organize will create Higlou folders via the eBay API.",
  };
}

/**
 * List active listings via Trading GetMyeBaySelling (no Inventory SKU checks).
 */
async function listSellerOffersViaTrading(
  accessToken: string,
  options?: {
    limit?: number;
    maxPages?: number;
    /** Per-item GetItem Storefront fill — burns call quota; off by default. */
    enrichStorefront?: boolean;
    /** Cap GetItem enrich calls when enrichStorefront is true. */
    enrichStorefrontMax?: number;
  },
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
  <DetailLevel>ReturnAll</DetailLevel>
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
      const storeCat2Id =
        block.match(/<StoreCategory2ID>([^<]+)<\/StoreCategory2ID>/i)?.[1]
          ?.trim() || "";
      const currentPath =
        (storeCatId &&
          storeCatId !== "0" &&
          categoriesById.get(storeCatId)) ||
        "";
      const currentPath2 =
        (storeCat2Id &&
          storeCat2Id !== "0" &&
          categoriesById.get(storeCat2Id)) ||
        "";
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
        currentStorePaths: [
          ...(currentPath ? [normalizeStorePath(currentPath)] : []),
          ...(currentPath2 ? [normalizeStorePath(currentPath2)] : []),
        ],
        currentStoreCategoryId:
          storeCatId && storeCatId !== "0" ? storeCatId : null,
        currentStoreCategory2Id:
          storeCat2Id && storeCat2Id !== "0" ? storeCat2Id : null,
      });
    }

    const totalPages = Number(
      xml.match(
        /<ActiveList>[\s\S]*?<PaginationResult>[\s\S]*?<TotalNumberOfPages>(\d+)<\/TotalNumberOfPages>/i,
      )?.[1] || "1",
    );
    if (page >= totalPages || itemBlocks.length === 0) break;
  }

  // Optional only — default off so Organize does not burn the daily quota.
  if (options?.enrichStorefront) {
    await enrichStorefrontFromGetItem(accessToken, rows, categoriesById, {
      maxItems: options.enrichStorefrontMax ?? 25,
    });
  }
  return rows;
}

async function enrichStorefrontFromGetItem(
  accessToken: string,
  rows: EbayStoreOfferRow[],
  categoriesById: Map<string, string>,
  options?: { maxItems?: number },
): Promise<void> {
  const maxItems = Math.min(100, Math.max(0, options?.maxItems ?? 25));
  const need = rows
    .filter(
      (r) =>
        r.listingId &&
        (!r.currentStoreCategoryId ||
          r.currentStoreCategoryId === "0" ||
          !r.currentStorePaths.length),
    )
    .slice(0, maxItems);
  const chunkSize = 4;
  for (let i = 0; i < need.length; i += chunkSize) {
    const chunk = need.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (row) => {
        try {
          const xml = await tradingApiCall(
            accessToken,
            "GetItem",
            `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <ItemID>${escapeXml(String(row.listingId))}</ItemID>
  <OutputSelector>ItemID</OutputSelector>
  <OutputSelector>Storefront</OutputSelector>
</GetItemRequest>`,
          );
          const storeCatId =
            xml
              .match(/<StoreCategoryID>([^<]+)<\/StoreCategoryID>/i)?.[1]
              ?.trim() || "";
          const storeCat2Id =
            xml
              .match(/<StoreCategory2ID>([^<]+)<\/StoreCategory2ID>/i)?.[1]
              ?.trim() || "";
          if (!storeCatId || storeCatId === "0") return;
          row.currentStoreCategoryId = storeCatId;
          row.currentStoreCategory2Id =
            storeCat2Id && storeCat2Id !== "0" ? storeCat2Id : null;
          const path = categoriesById.get(storeCatId);
          const path2 =
            storeCat2Id && storeCat2Id !== "0"
              ? categoriesById.get(storeCat2Id)
              : undefined;
          row.currentStorePaths = [
            ...(path ? [normalizeStorePath(path)] : []),
            ...(path2 ? [normalizeStorePath(path2)] : []),
          ];
        } catch (error) {
          if (isEbayUsageLimitError(error)) throw error;
          // leave empty — classify will still suggest a folder
        }
      }),
    );
  }
}

export async function listSellerOffers(
  accessToken: string,
  options?: {
    limit?: number;
    maxPages?: number;
    enrichStorefront?: boolean;
    enrichStorefrontMax?: number;
  },
): Promise<EbayStoreOfferRow[]> {
  // Prefer Trading — Inventory update/create rejects hyphenated Higlou SKUs (25707).
  try {
    return await listSellerOffersViaTrading(accessToken, options);
  } catch (tradingError) {
    if (isEbayUsageLimitError(tradingError)) throw tradingError;
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
    patterns: [/\bpump\b/i, /\bsump\b/i, /\bsubmersible\b/i, /water\s*pump/i, /utility\s*pump/i],
    weight: 10,
  },
  {
    path: "/Plumbing/Faucets",
    patterns: [
      /\bfaucet\b/i,
      /\btap\b/i,
      /kitchen\s*faucet/i,
      /bath.*faucet/i,
      /\bshower\s*head\b/i,
      /\bsink\b/i,
    ],
    weight: 9,
  },
  {
    path: "/Plumbing",
    patterns: [
      /\bplumb/i,
      /\bbath\b/i,
      /\bvalve\b/i,
      /\bpipe\b/i,
      /\bfitting\b/i,
      /\btoilet\b/i,
      /\btub\b/i,
      /vanity/i,
      /garbage\s*disposal/i,
    ],
    weight: 6,
  },
  {
    path: "/Lighting/Smart Lighting",
    patterns: [/\bhue\b/i, /smart\s*bulb/i, /philips\s*hue/i, /smart\s*light/i, /wifi\s*bulb/i],
    weight: 11,
  },
  {
    path: "/Lighting/Outdoor",
    patterns: [
      /outdoor\s*light/i,
      /pedestal\s*light/i,
      /landscape\s*light/i,
      /path\s*light/i,
      /flood\s*light/i,
      /security\s*light/i,
      /yard\s*light/i,
    ],
    weight: 10,
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
    patterns: [/\blamp\b/i, /table\s*lamp/i, /floor\s*lamp/i, /desk\s*lamp/i],
    weight: 8,
  },
  {
    path: "/Lighting",
    patterns: [/\blight(ing)?\b/i, /\bled\b/i, /fixture/i, /sconce/i, /\bbulb\b/i],
    weight: 5,
  },
  {
    path: "/Home/Vacuum & Cleaning",
    patterns: [/\bvacuum\b/i, /roomba/i, /dyson/i, /\bcleaner\b/i, /steam\s*mop/i],
    weight: 9,
  },
  {
    path: "/Home/Cleaning Accessories",
    patterns: [
      /scrubber/i,
      /mop\s*pad/i,
      /cleaning\s*kit/i,
      /brush\s*kit/i,
      /accessory\s*kit/i,
    ],
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
      /toaster/i,
      /air\s*fryer/i,
    ],
    weight: 7,
  },
  {
    path: "/Home/Storage",
    patterns: [/storage\s*bin/i, /organizer/i, /shelf\b/i, /shelving/i, /cabinet/i],
    weight: 6,
  },
  {
    path: "/Home",
    patterns: [/comforter/i, /bedding/i, /duvet/i, /home\s*decor/i, /curtain/i],
    weight: 4,
  },
  {
    path: "/Tools/Batteries",
    patterns: [
      /\bbattery\b/i,
      /batteries/i,
      /m18\b/i,
      /m12\b/i,
      /20v\b/i,
      /18v\b/i,
      /lithium/i,
      /forge\b/i,
      /powerstack/i,
      /redlithium/i,
    ],
    weight: 10,
  },
  {
    path: "/Tools/Measuring",
    patterns: [
      /laser\s*level/i,
      /\blevel\b/i,
      /tape\s*measure/i,
      /stud\s*finder/i,
      /multimeter/i,
      /laser\s*measure/i,
      /cross\s*line/i,
    ],
    weight: 10,
  },
  {
    path: "/Tools/Power Tools",
    patterns: [
      /drill/i,
      /saw\b/i,
      /grinder/i,
      /impact\s*driver/i,
      /power\s*tool/i,
      /driver.?drill/i,
      /hammer\s*drill/i,
      /rotary\s*tool/i,
      /sander/i,
      /nailer/i,
      /stapler/i,
    ],
    weight: 9,
  },
  {
    path: "/Tools/Hand Tools",
    patterns: [
      /wrench/i,
      /socket/i,
      /\bhammer\b/i,
      /pliers/i,
      /screwdriver/i,
      /hand\s*tool/i,
      /allen\s*key/i,
      /hex\s*key/i,
    ],
    weight: 8,
  },
  {
    path: "/Tools/Accessories",
    patterns: [
      /bit\s*set/i,
      /drill\s*bit/i,
      /blade\s*set/i,
      /tool\s*bag/i,
      /tool\s*case/i,
      /accessory/i,
    ],
    weight: 7,
  },
  {
    path: "/Tools",
    patterns: [/\btool\b/i, /dewalt/i, /makita/i, /milwaukee/i, /ryobi/i, /ridgid/i],
    weight: 4,
  },
  {
    path: "/Automotive/Parts",
    patterns: [/brake\b/i, /oil\s*filter/i, /spark\s*plug/i, /wiper/i, /car\s*part/i],
    weight: 8,
  },
  {
    path: "/Automotive",
    patterns: [/\batv\b/i, /auto(motive)?/i, /vehicle/i, /truck\b/i],
    weight: 6,
  },
  {
    path: "/Electronics/Cables & Chargers",
    patterns: [/charger/i, /usb.?c/i, /\bcable\b/i, /hdmi/i, /power\s*strip/i, /extension\s*cord/i],
    weight: 8,
  },
  {
    path: "/Electronics",
    patterns: [/phone/i, /laptop/i, /tablet/i, /earbuds/i, /speaker/i, /camera/i, /smart\s*home/i],
    weight: 6,
  },
  {
    path: "/Hardware/Fasteners",
    patterns: [/\bscrew\b/i, /\bnail\b/i, /bolt\b/i, /anchor\b/i, /fastener/i],
    weight: 7,
  },
  {
    path: "/Hardware",
    patterns: [/hinge/i, /bracket/i, /hardware/i, /door\s*knob/i, /lock\s*set/i],
    weight: 5,
  },
  {
    path: "/Outdoor/Garden",
    patterns: [/garden/i, /hose\b/i, /sprinkler/i, /lawn/i, /trimmer/i, /blower/i],
    weight: 7,
  },
  {
    path: "/Outdoor",
    patterns: [/outdoor/i, /patio/i, /grill\b/i, /camping/i],
    weight: 4,
  },
];

/** Build a real Store path from the title — never returns /Other. */
export function inferDynamicStorePath(haystack: string): {
  path: string;
  confidence: number;
  reason: string;
} {
  const text = String(haystack || "");

  if (/\b(dewalt|makita|milwaukee|ryobi|ridgid|bosch|metabo)\b/i.test(text)) {
    if (/\bbatter/i.test(text)) {
      return {
        path: "/Tools/Batteries",
        confidence: 0.72,
        reason: "Tool brand battery → /Tools/Batteries",
      };
    }
    return {
      path: "/Tools/Power Tools",
      confidence: 0.55,
      reason: "Power-tool brand → /Tools/Power Tools",
    };
  }

  if (/\b(philips|hue|lutron|ge\s*link|sengled)\b/i.test(text)) {
    return {
      path: "/Lighting/Smart Lighting",
      confidence: 0.7,
      reason: "Lighting brand → /Lighting/Smart Lighting",
    };
  }

  const typeToken =
    text.match(
      /\b(drill|saw|grinder|level|battery|batteries|lamp|light|faucet|pump|hose|charger|cable|scrubber|vacuum|speaker|camera|wrench|pliers|sander|nailer)\b/i,
    )?.[1] || "";

  if (typeToken) {
    const token = typeToken.toLowerCase();
    const map: Record<string, string> = {
      drill: "/Tools/Power Tools",
      saw: "/Tools/Power Tools",
      grinder: "/Tools/Power Tools",
      sander: "/Tools/Power Tools",
      nailer: "/Tools/Power Tools",
      level: "/Tools/Measuring",
      battery: "/Tools/Batteries",
      batteries: "/Tools/Batteries",
      lamp: "/Lighting/Lamps",
      light: "/Lighting",
      faucet: "/Plumbing/Faucets",
      pump: "/Plumbing/Pumps",
      hose: "/Outdoor/Garden",
      charger: "/Electronics/Cables & Chargers",
      cable: "/Electronics/Cables & Chargers",
      scrubber: "/Home/Cleaning Accessories",
      vacuum: "/Home/Vacuum & Cleaning",
      speaker: "/Electronics",
      camera: "/Electronics",
      wrench: "/Tools/Hand Tools",
      pliers: "/Tools/Hand Tools",
    };
    const mapped = map[token];
    if (mapped) {
      return {
        path: mapped,
        confidence: 0.62,
        reason: `Inferred from "${typeToken}" → ${mapped}`,
      };
    }
  }

  const noun =
    text
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 4)
      .filter(
        (w) =>
          !/^(with|from|this|that|case|kit|pack|piece|black|white|inch|only|home|depot|new)$/i.test(
            w,
          ),
      )[0] || "General";
  const leaf = noun
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
    .slice(0, 35);
  const safeLeaf = isReservedStoreFolderName(leaf)
    ? "General Merchandise"
    : leaf;
  return {
    path: normalizeStorePath(`/Home/${safeLeaf}`),
    confidence: 0.5,
    reason: `No taxonomy hit — will create /Home/${safeLeaf}`,
  };
}

function pickBestPath(
  haystack: string,
): { path: string; confidence: number; reason: string } {
  let best: { path: string; score: number; reason: string } | null = null;

  // Always match rules even if folders do not exist yet — Organize creates them.
  for (const rule of CLASSIFY_RULES) {
    const path = normalizeStorePath(rule.path);
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

  return inferDynamicStorePath(haystack);
}

export function classifyOffersForStore(
  offers: EbayStoreOfferRow[],
  categories: EbayStoreCategory[],
  options?: { reviewBelow?: number },
): StoreOrganizeSuggestion[] {
  const reviewBelow = options?.reviewBelow ?? 0.45;
  const liveCategories = usableStoreCategories(categories);
  const namedCategories = namedStoreCategories(categories);
  const taxonomy = mergeTaxonomyCategories(categories);
  const featuredPaths = new Set(
    HIGLOU_FEATURED_STORE_FOLDERS.map((name) =>
      findFeaturedStoreFolder(namedCategories, name),
    )
      .filter(Boolean)
      .map((c) => normalizeStorePath(c!.path)),
  );

  return offers.map((offer) => {
    const haystack = offerClassifyHaystack(offer);

    const finalize = (
      suggestedPath: string,
      confidence: number,
      reason: string,
      needsReview: boolean,
      suggestedPath2?: string | null,
    ): StoreOrganizeSuggestion => {
      // Always try featured folders first (Tools / Smart Home / Outdoor / Bath).
      const featured = pickFeaturedStoreAssignment(haystack, namedCategories);
      const preferred = featured
        ? featured.primary
        : preferSellerStorePath(suggestedPath, haystack, namedCategories);
      const preferred2 =
        featured?.secondary ??
        pickSecondaryStorePath(haystack, preferred, namedCategories) ??
        suggestedPath2 ??
        null;

      const suggestedId = resolveStoreCategoryId(preferred, categories);
      const suggestedId2 = preferred2
        ? resolveStoreCategoryId(preferred2, categories)
        : null;
      const current = offer.currentStorePaths[0] || "";
      const current2 = offer.currentStorePaths[1] || "";
      const currentIsFeatured =
        Boolean(current) && featuredPaths.has(normalizeStorePath(current));
      const preferredIsFeatured = featuredPaths.has(normalizeStorePath(preferred));

      const unchangedById = Boolean(
        suggestedId &&
          offer.currentStoreCategoryId &&
          suggestedId === offer.currentStoreCategoryId &&
          (!preferred2 ||
            !suggestedId2 ||
            offer.currentStoreCategory2Id === suggestedId2),
      );
      const unchangedByPath =
        Boolean(current) &&
        normalizeStorePath(current) === normalizeStorePath(preferred) &&
        !/\/other$/i.test(normalizeStorePath(current)) &&
        (!preferred2 ||
          normalizeStorePath(current2) === normalizeStorePath(preferred2));

      // If we have a featured target but the item is not in a featured folder yet,
      // always treat as changed so Organize everything moves it.
      const needsFeaturedMove =
        preferredIsFeatured &&
        (!currentIsFeatured ||
          normalizeStorePath(current) !== normalizeStorePath(preferred) ||
          (Boolean(preferred2) &&
            normalizeStorePath(current2) !== normalizeStorePath(preferred2)));

      const secondaryBit = preferred2
        ? ` + "${preferred2.split("/").filter(Boolean).pop()}"`
        : "";
      return {
        ...offer,
        suggestedPath: preferred,
        suggestedPath2: preferred2,
        confidence: featured?.confidence ?? confidence,
        reason: featured
          ? featured.reason
          : preferred !== normalizeStorePath(suggestedPath)
            ? `${reason} → your folder "${preferred.split("/").filter(Boolean).pop()}"${secondaryBit}`
            : secondaryBit
              ? `${reason}${secondaryBit}`
              : reason,
        needsReview: featured ? false : needsReview,
        unchanged: needsFeaturedMove
          ? false
          : unchangedById || unchangedByPath,
      };
    };

    // 0) Featured folders win whenever the product matches them.
    const featuredHit = pickFeaturedStoreAssignment(haystack, namedCategories);
    if (featuredHit) {
      return finalize(
        featuredHit.primary,
        featuredHit.confidence,
        featuredHit.reason,
        false,
        featuredHit.secondary,
      );
    }

    // 1) Prefer the seller's REAL Store folders (e.g. "Bath and Plumbing").
    const liveHit = pickBestExistingStoreCategory(haystack, liveCategories);
    if (liveHit && liveHit.score >= 3) {
      const leafPath = pickAssignableStorePath(liveHit.cat, namedCategories);
      return finalize(
        leafPath,
        Math.min(0.96, 0.5 + liveHit.score / 20),
        `Matched your Store folder "${liveHit.cat.name}"`,
        false,
      );
    }

    // 2) Higlou taxonomy, then map onto an existing folder when possible.
    let picked = pickBestPath(haystack);
    if (/\/other$/i.test(normalizeStorePath(picked.path))) {
      picked = inferDynamicStorePath(haystack);
    }

    const mapped = mapTaxonomyPathToExistingStore(picked.path, namedCategories);
    if (mapped) {
      const leafPath = pickAssignableStorePath(mapped, namedCategories);
      return finalize(
        leafPath,
        Math.max(picked.confidence, 0.7),
        `${picked.reason} → your folder "${mapped.name}"`,
        false,
      );
    }

    // 3) No usable existing folder — suggest Higlou path (Organize will create it).
    let leafPath = pickLeafStorePath(picked.path, taxonomy);
    if (/\/other$/i.test(leafPath)) {
      leafPath = pickLeafStorePath(
        inferDynamicStorePath(haystack).path,
        taxonomy,
      );
    }
    return finalize(
      leafPath,
      picked.confidence,
      leafPath !== picked.path
        ? `${picked.reason} (leaf ${leafPath})`
        : resolveStoreCategoryId(leafPath, categories)
          ? picked.reason
          : `${picked.reason} · will create folder`,
      picked.confidence < reviewBelow,
    );
  });
}

function normalizeMatchText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Theme keywords for matching seller folder names ↔ product titles. */
const STORE_THEME_HINTS: Array<{
  folder: RegExp;
  product: RegExp;
  boost: number;
}> = [
  {
    folder: /bath|plumb/,
    product:
      /\b(bath|plumb|faucet|pump|toilet|sink|shower|tub|valve|pipe|sump|disposal|vanity|thermostat|fixture|spout|drain|washer|cartridge|moen|delta|kohler|grohe|pfister|everbilt|glacier\s*bay|hansgrohe|supply\s*line|angle\s*stop|water\s*heater|bidet|pex|gib\s*door|fill\s*valve|flapper|aerator|diverter)\b/i,
    boost: 12,
  },
  {
    folder: /light|lamp|led/,
    product: /\b(light|lamp|led|bulb|fixture|hue|chandelier|pendant|sconce)\b/i,
    boost: 10,
  },
  {
    folder: /tool|power|drill/,
    product:
      /\b(tool|drill|saw|grinder|impact|dewalt|makita|milwaukee|ryobi|ridgid|bosch|metabo|craftsman|hercules|hart|kobalt|battery|level|sander|nailer|dremel)\b/i,
    boost: 10,
  },
  {
    folder: /batter/,
    product: /\b(battery|batteries|m18|m12|lithium|18v|20v)\b/i,
    boost: 10,
  },
  {
    folder: /electr|cable|charg/,
    product: /\b(charger|cable|usb|hdmi|electronics|speaker|phone)\b/i,
    boost: 8,
  },
  {
    folder: /clean|vacuum|home/,
    product: /\b(vacuum|cleaner|scrubber|mop|kitchen|home)\b/i,
    boost: 7,
  },
  {
    folder: /auto|car|vehicle/,
    product: /\b(auto|car|vehicle|truck|brake|wiper)\b/i,
    boost: 8,
  },
  {
    folder: /outdoor|garden|lawn|patio|living/,
    product: /\b(outdoor|garden|lawn|hose|trimmer|blower|patio|grill|deck|yard|landscape|camping)\b/i,
    boost: 10,
  },
  {
    folder: /hardware|fastener/,
    product: /\b(screw|nail|bolt|hinge|bracket|hardware)\b/i,
    boost: 7,
  },
  {
    folder: /smart\s*home|smarthome|automation/,
    product:
      /\b(smart|wifi|wi-?fi|alexa|google\s*home|hue|led|rgb|smart\s*bulb|smart\s*light|smart\s*plug|smart\s*switch|nest|ecobee|ring\b|zigbee|zwave|matter\b)\b/i,
    boost: 11,
  },
];

/** Higlou taxonomy paths that must yield to the seller's real Store folders. */
const HIGLOU_PLUMBING_PATH_RE = /^\/plumbing(\/|$)/i;
const HIGLOU_TOOLS_PATH_RE = /^\/tools(\/|$)/i;
const HIGLOU_LIGHTING_PATH_RE = /^\/lighting(\/|$)/i;
const HIGLOU_OUTDOOR_PATH_RE = /^\/outdoor(\/|$)/i;

/**
 * Seller's featured eBay Store folders (exact names on the live store).
 * Primary + optional secondary assignments target these first.
 */
export const HIGLOU_FEATURED_STORE_FOLDERS = [
  "Tools",
  "Smart Home",
  "Outdoor Living",
  "Bath and Plumbing",
] as const;

/** Product text that belongs in a bath/plumbing Store folder. */
export const PLUMBING_PRODUCT_RE =
  /\b(bath|plumb|faucet|pump|toilet|sink|shower|tub|valve|pipe|sump|disposal|vanity|thermostat|spout|drain|cartridge|moen|delta|kohler|grohe|pfister|everbilt|glacier\s*bay|hansgrohe|supply\s*line|angle\s*stop|water\s*heater|bidet|pex|fill\s*valve|flapper|aerator|diverter|gib\s*door|garbage\s*disposal|washerless|cartridge|stop\s*valve|ball\s*valve|gate\s*valve|toilet\s*seat|shower\s*head|tub\s*spout|kitchen\s*faucet|bath(room)?\s*faucet|utility\s*pump|submersible|sump\s*pump|transfer\s*pump|plumbing)\b/i;

/** Product text that belongs in a Tools Store folder. */
export const TOOLS_PRODUCT_RE =
  /\b(tool|drill|saw|grinder|impact|driver|sander|nailer|stapler|wrench|pliers|screwdriver|multimeter|rotary|oscillating|dewalt|makita|milwaukee|ryobi|ridgid|bosch|metabo|craftsman|hercules|hart|kobalt|porter[\s-]?cable|hilti|wen|skil|dremel|hammer|socket|ratchet|torque|bit\s*set|drill\s*bit|circular\s*saw|reciprocating|jigsaw|miter|angle\s*grinder|heat\s*gun|glue\s*gun|caulk|laser\s*level|tape\s*measure|stud\s*finder|tool\s*bag|tool\s*box|power\s*tool|hand\s*tool|18v|20v|12v\s*max|m18|m12|one\+|forge)\b/i;

/** Product text that belongs in Lighting (often maps → Smart Home on this store). */
export const LIGHTING_PRODUCT_RE =
  /\b(light|lamp|led|bulb|chandelier|pendant|sconce|hue|flush\s*mount|fixture|lantern|night\s*light|string\s*light|flood\s*light|shop\s*light|under\s*cabinet\s*light|vanity\s*light|ceiling\s*light|recessed|downlight|troffer|luminaire)\b/i;

/** Product text that belongs in Outdoor Living. */
export const OUTDOOR_PRODUCT_RE =
  /\b(outdoor|patio|garden|lawn|hose|sprinkler|trimmer|blower|grill|bbq|camping|deck|yard|landscape|gazebo|umbrella|fire\s*pit|string\s*light|solar\s*light|planter|weed|mower|hedge|leaf\s*blower|pressure\s*washer|outdoor\s*furniture|adirondack|chaise|canopy|gazebo|bird\s*feeder|hose\s*reel)\b/i;

/** Product text that belongs in Smart Home (featured — lights, wifi, smart plugs, etc.). */
export const SMART_HOME_PRODUCT_RE =
  /\b(smart|wifi|wi-?fi|alexa|google\s*home|hue|philips\s*hue|smart\s*bulb|smart\s*light|smart\s*plug|smart\s*switch|nest|ecobee|ring\b|smart\s*lock|zwave|zigbee|matter\b|led\b|rgb|voice\s*control|app\s*control|bluetooth\s*bulb|wifi\s*bulb|light|lamp|bulb|fixture|chandelier|pendant|sconce|flush\s*mount|thermostat|doorbell|security\s*camera|smart\s*speaker|dimmer|motion\s*sensor|contact\s*sensor|hub\b|bridge\b|smart\s*thermostat|ev\s*charger|nacs|ccs1)\b/i;

/** Known eBay leaf Category IDs for bath / plumbing (enrich haystack). */
const PLUMBING_EBAY_CATEGORY_IDS = new Set([
  "63897",
  "20589",
  "20595",
  "177033",
  "260882",
  "61573",
  "20621",
  "20601",
  "41964",
  "116375",
  "116376",
  "116377",
  "3299",
  "20585",
  "20591",
  "71282",
  "63898",
]);

/** Known eBay leaf Category IDs for tools. */
const TOOLS_EBAY_CATEGORY_IDS = new Set([
  "20779",
  "46578",
  "631",
  "11868",
  "29518",
  "3246",
  "42259",
  "50388",
  "71273",
  "57357",
  "179421",
  "42226",
  "6030",
  "6000",
]);

function offerClassifyHaystack(offer: EbayStoreOfferRow): string {
  const catId = String(offer.categoryId || "").replace(/\D/g, "");
  const plumbingCatHint = PLUMBING_EBAY_CATEGORY_IDS.has(catId)
    ? " plumbing bath faucet pump shower"
    : "";
  const toolsCatHint = TOOLS_EBAY_CATEGORY_IDS.has(catId)
    ? " tools power tool drill saw"
    : "";
  return [
    offer.title,
    offer.brand,
    offer.productType,
    offer.categoryName,
    offer.sku,
    catId,
    plumbingCatHint,
    toolsCatHint,
  ]
    .filter(Boolean)
    .join(" ");
}

function usableStoreCategories(
  categories: EbayStoreCategory[],
): EbayStoreCategory[] {
  return categories.filter(
    (c) =>
      c.categoryId &&
      !isReservedStoreFolderName(c.name) &&
      !/\/other$/i.test(normalizeStorePath(c.path)),
  );
}

function sortSellerThemeFolders(
  matches: EbayStoreCategory[],
  usable: EbayStoreCategory[],
  preferShallow = false,
): EbayStoreCategory[] {
  return [...matches].sort((a, b) => {
    if (preferShallow) {
      const aDepth = normalizeStorePath(a.path).split("/").filter(Boolean).length;
      const bDepth = normalizeStorePath(b.path).split("/").filter(Boolean).length;
      if (aDepth !== bDepth) return aDepth - bDepth;
    }
    const aWords = normalizeMatchText(a.name)
      .split(" ")
      .filter((w) => w.length >= 3 && w !== "and").length;
    const bWords = normalizeMatchText(b.name)
      .split(" ")
      .filter((w) => w.length >= 3 && w !== "and").length;
    if (bWords !== aWords) return bWords - aWords;
    const aLeaf = isLeafStoreCategory(a.path, usable) ? 1 : 0;
    const bLeaf = isLeafStoreCategory(b.path, usable) ? 1 : 0;
    if (bLeaf !== aLeaf) return bLeaf - aLeaf;
    return (
      normalizeMatchText(b.name).length - normalizeMatchText(a.name).length
    );
  });
}

function namedStoreCategories(
  categories: EbayStoreCategory[],
): EbayStoreCategory[] {
  return categories.filter(
    (c) =>
      String(c.name || "").trim() &&
      !isReservedStoreFolderName(c.name) &&
      !/\/other$/i.test(normalizeStorePath(c.path)),
  );
}

/** Find a seller folder by exact featured name (case-insensitive). */
export function findFeaturedStoreFolder(
  categories: EbayStoreCategory[],
  featuredName: string,
): EbayStoreCategory | null {
  // Prefer folders that already have Store category IDs, but still match by name
  // when GetStore/REST lag so classify can target the featured path.
  const named = namedStoreCategories(categories);
  const want = normalizeMatchText(featuredName);
  const exact = named.filter((c) => normalizeMatchText(c.name) === want);
  if (!exact.length) return null;
  const withId = exact.filter((c) => c.categoryId);
  const pool = withId.length ? withId : exact;
  return sortSellerThemeFolders(pool, named, true)[0] || null;
}

/** Score how well a product belongs in one featured folder. */
export function scoreFeaturedFolderForProduct(
  haystack: string,
  featuredName: string,
): number {
  const name = normalizeMatchText(featuredName);
  const hay = String(haystack || "");
  if (name === "tools") {
    if (TOOLS_PRODUCT_RE.test(hay)) return 30;
    if (/\b(battery|batteries|level|hammer|chisel|mallet)\b/i.test(hay)) return 12;
    return 0;
  }
  if (name === "bath and plumbing") {
    if (PLUMBING_PRODUCT_RE.test(hay)) return 30;
    if (/\b(kitchen|bath|fixture|spout|washer|cartridge)\b/i.test(hay)) return 10;
    return 0;
  }
  if (name === "outdoor living") {
    if (OUTDOOR_PRODUCT_RE.test(hay)) return 30;
    if (/\b(outdoor|patio|garden|solar)\b/i.test(hay)) return 14;
    return 0;
  }
  if (name === "smart home") {
    // Lights / LED / wifi / smart — this store has no separate Lighting folder.
    if (SMART_HOME_PRODUCT_RE.test(hay) && !TOOLS_PRODUCT_RE.test(hay)) return 28;
    if (LIGHTING_PRODUCT_RE.test(hay) && !TOOLS_PRODUCT_RE.test(hay)) return 26;
    if (/\b(electronics|speaker|camera|charger|usb|hdmi)\b/i.test(hay) && !TOOLS_PRODUCT_RE.test(hay))
      return 8;
    return 0;
  }
  return 0;
}

/**
 * Force primary (+ optional secondary) into the seller's four featured folders
 * whenever the product matches any of them.
 */
export function pickFeaturedStoreAssignment(
  haystack: string,
  categories: EbayStoreCategory[],
): {
  primary: string;
  secondary: string | null;
  confidence: number;
  reason: string;
} | null {
  const scored: Array<{ cat: EbayStoreCategory; score: number; label: string }> =
    [];

  for (const label of HIGLOU_FEATURED_STORE_FOLDERS) {
    const cat = findFeaturedStoreFolder(categories, label);
    if (!cat) continue;
    const score = scoreFeaturedFolderForProduct(haystack, label);
    if (score <= 0) continue;
    scored.push({ cat, score, label });
  }

  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score || b.label.length - a.label.length);

  const primary = scored[0]!;
  let secondary: (typeof scored)[number] | null = null;

  // Prefer Smart Home as 2nd when primary is Outdoor/Bath/Tools and product is also smart/LED.
  const smart = scored.find((s) => s.label === "Smart Home");
  if (
    smart &&
    smart.label !== primary.label &&
    (SMART_HOME_PRODUCT_RE.test(haystack) || LIGHTING_PRODUCT_RE.test(haystack))
  ) {
    secondary = smart;
  } else if (scored[1] && scored[1].score >= 10 && scored[1].label !== primary.label) {
    secondary = scored[1];
  }

  return {
    primary: normalizeStorePath(primary.cat.path),
    secondary: secondary ? normalizeStorePath(secondary.cat.path) : null,
    confidence: Math.min(0.98, 0.55 + primary.score / 40),
    reason: `Featured folder "${primary.label}"${secondary ? ` + "${secondary.label}"` : ""}`,
  };
}

/** Seller's real bath/plumbing folder (e.g. Bath and Plumbing), preferring broad names. */
export function findSellerBathPlumbingFolder(
  categories: EbayStoreCategory[],
): EbayStoreCategory | null {
  const featured = findFeaturedStoreFolder(categories, "Bath and Plumbing");
  if (featured) return featured;
  const usable = usableStoreCategories(categories);
  const matches = usable.filter((c) =>
    /bath|plumb/i.test(normalizeMatchText(`${c.name} ${c.path}`)),
  );
  if (!matches.length) return null;
  return sortSellerThemeFolders(matches, usable)[0] || null;
}

/** Seller's real Tools folder (Tools / Tool), preferring the top-level folder. */
export function findSellerToolsFolder(
  categories: EbayStoreCategory[],
): EbayStoreCategory | null {
  const featured = findFeaturedStoreFolder(categories, "Tools");
  if (featured) return featured;
  const usable = usableStoreCategories(categories);
  const matches = usable.filter((c) => {
    const name = normalizeMatchText(c.name);
    const path = normalizeStorePath(c.path);
    if (/batter/i.test(name)) return false;
    if (/^(tools?)$/i.test(name)) return true;
    if (/^\/tools?$/i.test(path)) return true;
    return /tool/i.test(name) && !/bath|plumb|light|lamp|outdoor|smart/i.test(name);
  });
  if (!matches.length) return null;
  const exact = matches.filter(
    (c) =>
      /^(tools?)$/i.test(normalizeMatchText(c.name)) ||
      /^\/tools?$/i.test(normalizeStorePath(c.path)),
  );
  const pool = exact.length ? exact : matches;
  return sortSellerThemeFolders(pool, usable, true)[0] || null;
}

/** Seller's real Lighting folder (optional — many stores use Smart Home instead). */
export function findSellerLightingFolder(
  categories: EbayStoreCategory[],
): EbayStoreCategory | null {
  const usable = usableStoreCategories(categories);
  const matches = usable.filter((c) => {
    const name = normalizeMatchText(c.name);
    if (/^(lighting|lights?|lamps?)$/i.test(name)) return true;
    return (
      /light|lamp/i.test(name) &&
      !/tool|bath|plumb|smart|outdoor/i.test(name)
    );
  });
  if (!matches.length) return null;
  const exact = matches.filter((c) =>
    /^(lighting|lights?|lamps?)$/i.test(normalizeMatchText(c.name)),
  );
  const pool = exact.length ? exact : matches;
  return sortSellerThemeFolders(pool, usable, true)[0] || null;
}

/** Seller's real Smart Home folder (featured). */
export function findSellerSmartHomeFolder(
  categories: EbayStoreCategory[],
): EbayStoreCategory | null {
  const featured = findFeaturedStoreFolder(categories, "Smart Home");
  if (featured) return featured;
  const usable = usableStoreCategories(categories);
  const matches = usable.filter((c) => {
    const text = normalizeMatchText(`${c.name} ${c.path}`);
    return /smart\s*home|smarthome|smart\s*living|home\s*automation|automation/i.test(
      text,
    );
  });
  if (!matches.length) return null;
  return sortSellerThemeFolders(matches, usable, true)[0] || null;
}

/** Seller's real Outdoor Living folder (featured). */
export function findSellerOutdoorLivingFolder(
  categories: EbayStoreCategory[],
): EbayStoreCategory | null {
  const featured = findFeaturedStoreFolder(categories, "Outdoor Living");
  if (featured) return featured;
  const usable = usableStoreCategories(categories);
  const matches = usable.filter((c) => {
    const text = normalizeMatchText(`${c.name} ${c.path}`);
    return /outdoor|patio|garden|lawn/i.test(text);
  });
  if (!matches.length) return null;
  return sortSellerThemeFolders(matches, usable, true)[0] || null;
}

function isFeaturedStorePath(
  path: string,
  categories: EbayStoreCategory[],
): boolean {
  const needle = normalizeStorePath(path);
  return HIGLOU_FEATURED_STORE_FOLDERS.some((label) => {
    const cat = findFeaturedStoreFolder(categories, label);
    return cat && normalizeStorePath(cat.path) === needle;
  });
}

/**
 * Prefer the seller's featured Store folders
 * (Tools, Smart Home, Outdoor Living, Bath and Plumbing).
 * Never steal lighting items into competing Higlou "Lighting" when Smart Home exists.
 */
export function preferSellerStorePath(
  suggestedPath: string,
  haystack: string,
  categories: EbayStoreCategory[],
): string {
  const suggested = normalizeStorePath(suggestedPath);

  // Lock: if caller already chose a featured folder, never remap it away
  // (this was sending Smart Home → Lighting for LED titles).
  if (isFeaturedStorePath(suggested, categories)) {
    return suggested;
  }

  const featured = pickFeaturedStoreAssignment(haystack, categories);
  if (featured) return featured.primary;

  const tools = findSellerToolsFolder(categories);
  if (
    tools &&
    (HIGLOU_TOOLS_PATH_RE.test(suggested) || TOOLS_PRODUCT_RE.test(haystack)) &&
    !PLUMBING_PRODUCT_RE.test(haystack) &&
    !OUTDOOR_PRODUCT_RE.test(haystack)
  ) {
    return normalizeStorePath(tools.path);
  }

  const bath = findSellerBathPlumbingFolder(categories);
  if (
    bath &&
    (HIGLOU_PLUMBING_PATH_RE.test(suggested) ||
      PLUMBING_PRODUCT_RE.test(haystack)) &&
    !TOOLS_PRODUCT_RE.test(haystack)
  ) {
    return normalizeStorePath(bath.path);
  }

  const outdoor = findSellerOutdoorLivingFolder(categories);
  if (
    outdoor &&
    (HIGLOU_OUTDOOR_PATH_RE.test(suggested) ||
      OUTDOOR_PRODUCT_RE.test(haystack) ||
      (/outdoor/i.test(suggested) && LIGHTING_PRODUCT_RE.test(haystack)))
  ) {
    return normalizeStorePath(outdoor.path);
  }

  const smartHome = findSellerSmartHomeFolder(categories);
  // When Smart Home exists, Lighting (Higlou competitor) is NOT the destination.
  if (
    smartHome &&
    (HIGLOU_LIGHTING_PATH_RE.test(suggested) ||
      LIGHTING_PRODUCT_RE.test(haystack) ||
      SMART_HOME_PRODUCT_RE.test(haystack) ||
      /^\/lighting(\/|$)/i.test(suggested)) &&
    !TOOLS_PRODUCT_RE.test(haystack) &&
    !PLUMBING_PRODUCT_RE.test(haystack) &&
    !OUTDOOR_PRODUCT_RE.test(haystack)
  ) {
    return normalizeStorePath(smartHome.path);
  }

  const lighting = findSellerLightingFolder(categories);
  if (
    !smartHome &&
    lighting &&
    (HIGLOU_LIGHTING_PATH_RE.test(suggested) ||
      LIGHTING_PRODUCT_RE.test(haystack)) &&
    !TOOLS_PRODUCT_RE.test(haystack) &&
    !PLUMBING_PRODUCT_RE.test(haystack) &&
    !OUTDOOR_PRODUCT_RE.test(haystack)
  ) {
    return normalizeStorePath(lighting.path);
  }

  return suggested;
}

/**
 * Pick an optional 2nd Store folder (StoreCategory2ID) from featured set.
 * Examples:
 *   LED bulb → Lighting or Smart Home (1st) + Smart Home (2nd if different)
 *   Outdoor LED → Outdoor Living + Smart Home
 *   Smart plug → Smart Home only (no 2nd)
 */
export function pickSecondaryStorePath(
  haystack: string,
  primaryPath: string,
  categories: EbayStoreCategory[],
): string | null {
  const primary = normalizeStorePath(primaryPath);
  const usable = usableStoreCategories(categories);
  const smartHome = findSellerSmartHomeFolder(usable);
  const outdoor = findSellerOutdoorLivingFolder(usable);
  const tools = findSellerToolsFolder(usable);
  const bath = findSellerBathPlumbingFolder(usable);

  const candidates: EbayStoreCategory[] = [];

  // LED / smart / wifi → always try Smart Home as 2nd when primary is elsewhere.
  if (smartHome && SMART_HOME_PRODUCT_RE.test(haystack)) {
    candidates.push(smartHome);
  }

  // Outdoor + lighting/LED → Outdoor Living as secondary if primary was Smart Home.
  if (outdoor && OUTDOOR_PRODUCT_RE.test(haystack)) {
    candidates.push(outdoor);
  }

  // Tool-ish secondary rarely; skip if primary is already Tools.
  if (tools && TOOLS_PRODUCT_RE.test(haystack) && !OUTDOOR_PRODUCT_RE.test(haystack)) {
    candidates.push(tools);
  }

  if (bath && PLUMBING_PRODUCT_RE.test(haystack)) {
    candidates.push(bath);
  }

  for (const cat of candidates) {
    const path = normalizeStorePath(cat.path);
    if (path !== primary) return path;
  }

  return null;
}

/** Match folder name words to title with simple plural/singular tolerance. */
function folderWordInHaystack(word: string, hay: string): boolean {
  const w = word.toLowerCase();
  if (new RegExp(`\\b${w}\\b`, "i").test(hay)) return true;
  if (w.endsWith("s") && w.length > 3) {
    const stem = w.slice(0, -1);
    if (new RegExp(`\\b${stem}\\b`, "i").test(hay)) return true;
  } else if (w.length >= 3) {
    if (new RegExp(`\\b${w}s\\b`, "i").test(hay)) return true;
  }
  return false;
}

function scoreExistingStoreCategory(
  haystack: string,
  cat: EbayStoreCategory,
  allCategories: EbayStoreCategory[],
): number {
  const hay = normalizeMatchText(haystack);
  const name = normalizeMatchText(cat.name);
  const path = normalizeMatchText(cat.path);
  const folderText = `${name} ${path}`;
  let score = 0;

  const significantWords = name
    .split(" ")
    .filter((w) => w.length >= 3 && !/^(and|the|for|with)$/i.test(w));

  for (const word of significantWords) {
    if (folderWordInHaystack(word, hay)) score += 4;
  }

  // Exact top-level Tools / Tool folder vs tool products — strong boost.
  if (
    (/^(tools?)$/i.test(name) || /^tools?$/i.test(path.replace(/\s/g, ""))) &&
    TOOLS_PRODUCT_RE.test(haystack)
  ) {
    score += 14;
  }

  // Boost the seller's four featured folders when the product matches.
  for (const featured of HIGLOU_FEATURED_STORE_FOLDERS) {
    if (normalizeMatchText(featured) !== name) continue;
    if (featured === "Tools" && TOOLS_PRODUCT_RE.test(haystack)) score += 16;
    if (featured === "Bath and Plumbing" && PLUMBING_PRODUCT_RE.test(haystack))
      score += 16;
    if (featured === "Outdoor Living" && OUTDOOR_PRODUCT_RE.test(haystack))
      score += 16;
    if (featured === "Smart Home" && SMART_HOME_PRODUCT_RE.test(haystack))
      score += 16;
  }

  for (const hint of STORE_THEME_HINTS) {
    if (!(hint.folder.test(folderText) && hint.product.test(haystack))) {
      continue;
    }
    score += hint.boost;

    // Prefer broad seller folders ("Bath and Plumbing") over narrow leaves ("Pumps").
    if (significantWords.length >= 2) {
      score += 8;
    } else if (significantWords.length === 1) {
      const hasBroaderPeer = allCategories.some((peer) => {
        if (peer.categoryId === cat.categoryId) return false;
        const peerName = normalizeMatchText(peer.name);
        const peerWords = peerName
          .split(" ")
          .filter((w) => w.length >= 3 && !/^(and|the|for|with)$/i.test(w));
        return (
          peerWords.length >= 2 &&
          hint.folder.test(peerName) &&
          Boolean(peer.categoryId) &&
          !isReservedStoreFolderName(peer.name)
        );
      });
      if (hasBroaderPeer) score -= 8;
    }
  }

  return score;
}

export function pickBestExistingStoreCategory(
  haystack: string,
  categories: EbayStoreCategory[],
): { cat: EbayStoreCategory; score: number } | null {
  const usable = usableStoreCategories(categories);
  if (!usable.length) return null;

  // Score ALL folders (including parents like Bath and Plumbing). Restricting
  // to leaves made competing /Plumbing/Pumps win while Bath and Plumbing lost.
  let best: { cat: EbayStoreCategory; score: number } | null = null;
  for (const cat of usable) {
    const score = scoreExistingStoreCategory(haystack, cat, usable);
    if (
      !best ||
      score > best.score ||
      (score === best.score &&
        normalizeMatchText(cat.name).length >
          normalizeMatchText(best.cat.name).length)
    ) {
      best = { cat, score };
    }
  }
  // Threshold 4: theme match on a broad seller folder is enough.
  return best && best.score >= 4 ? best : null;
}

/**
 * Map a Higlou taxonomy path onto the closest existing seller Store folder.
 * e.g. /Plumbing/Pumps → /Bath and Plumbing
 */
export function mapTaxonomyPathToExistingStore(
  taxonomyPath: string,
  categories: EbayStoreCategory[],
): EbayStoreCategory | null {
  const needle = normalizeStorePath(taxonomyPath);
  if (!needle || /\/other$/i.test(needle)) return null;

  const usable = categories.filter(
    (c) =>
      c.categoryId &&
      !isReservedStoreFolderName(c.name) &&
      !/\/other$/i.test(normalizeStorePath(c.path)),
  );
  if (!usable.length) return null;

  // Exact path / name match first
  const exact = usable.find(
    (c) => normalizeStorePath(c.path) === needle,
  );
  if (exact) return exact;
  const leafName = needle.split("/").filter(Boolean).pop()?.toLowerCase();
  if (leafName) {
    const byName = usable.find(
      (c) => c.name.trim().toLowerCase() === leafName,
    );
    if (byName) return byName;
  }

  // Theme map: Higlou department → seller folder regex
  const theme =
    /plumbing|pump|faucet|bath|toilet|sink|shower/i.test(needle)
      ? /bath|plumb|pump|faucet|sink|toilet/
      : /lighting|lamp|led|bulb|hue/i.test(needle)
        ? /light|lamp|led|bulb|hue/
        : /batter/i.test(needle)
          ? /batter|power/
          : /tool|drill|measur|hand tool|power tool/i.test(needle)
            ? /tool|drill|power|measur|batter/
            : /vacuum|clean|kitchen|home/i.test(needle)
              ? /home|clean|vacuum|kitchen/
              : /electr|cable|charg/i.test(needle)
                ? /electr|cable|charg/
                : /auto/i.test(needle)
                  ? /auto|car|vehicle/
                  : /outdoor|garden/i.test(needle)
                    ? /outdoor|garden|lawn/
                    : /hardware|fastener/i.test(needle)
                      ? /hardware|fastener/
                      : null;

  if (!theme) return null;

  // Include parents (Bath and Plumbing) — not only leaves.
  const matches = usable.filter((c) =>
    theme.test(normalizeMatchText(`${c.name} ${c.path}`)),
  );
  if (!matches.length) return null;

  // Prefer longer / more specific seller folder names (Bath and Plumbing > Pumps).
  matches.sort((a, b) => {
    const aWords = normalizeMatchText(a.name)
      .split(" ")
      .filter((w) => w.length >= 3 && w !== "and").length;
    const bWords = normalizeMatchText(b.name)
      .split(" ")
      .filter((w) => w.length >= 3 && w !== "and").length;
    if (bWords !== aWords) return bWords - aWords;
    return (
      normalizeMatchText(b.name).length - normalizeMatchText(a.name).length
    );
  });
  return matches[0];
}

function pickAssignableStorePath(
  cat: EbayStoreCategory,
  categories: EbayStoreCategory[],
): string {
  const path = normalizeStorePath(cat.path);
  if (isLeafStoreCategory(path, categories)) return path;
  // Parent with children — only pick a leaf UNDER this folder (never a sibling
  // like /Plumbing/Pumps when the match was /Bath and Plumbing).
  const prefix = `${path}/`;
  const childLeaves = categories
    .map((c) => normalizeStorePath(c.path))
    .filter(
      (p) =>
        p.startsWith(prefix) &&
        isLeafStoreCategory(p, categories) &&
        !/\/other$/i.test(p),
    )
    .sort((a, b) => a.length - b.length);
  if (childLeaves[0]) return childLeaves[0];
  // Keep the parent path; assign will create a General leaf under it if needed.
  return path;
}

function mergeTaxonomyCategories(
  categories: EbayStoreCategory[],
): EbayStoreCategory[] {
  const byPath = new Map<string, EbayStoreCategory>();
  for (const path of HIGLOU_DEFAULT_STORE_PATHS) {
    const normalized = normalizeStorePath(path);
    byPath.set(normalized, {
      path: normalized,
      name: normalized.split("/").filter(Boolean).pop() || normalized,
    });
  }
  for (const cat of categories) {
    const normalized = normalizeStorePath(cat.path);
    const prev = byPath.get(normalized);
    byPath.set(normalized, {
      path: normalized,
      name: cat.name || prev?.name || normalized,
      categoryId: cat.categoryId || prev?.categoryId,
    });
  }
  return Array.from(byPath.values());
}

/**
 * Create any missing Store folders for the given paths (parents then leaves).
 */
export async function ensureStorePaths(
  accessToken: string,
  paths: string[],
  categories: EbayStoreCategory[] = [],
): Promise<{ categories: EbayStoreCategory[]; created: string[] }> {
  let cats =
    categories.length > 0
      ? categories
      : (await listSellerStoreCategories(accessToken)).categories;
  const created: string[] = [];
  const uniquePaths = Array.from(
    new Set(
      paths
        .map(normalizeStorePath)
        .filter(Boolean)
        .filter((p) => !/^\/other$/i.test(p)),
    ),
  );

  for (const path of uniquePaths) {
    const before = resolveStoreCategoryId(path, cats);
    const ensured = await ensureStoreCategoryId(accessToken, path, cats);
    cats = ensured.categories;
    if (!before && resolveStoreCategoryId(path, cats)) {
      created.push(path);
    }
  }

  return { categories: cats, created };
}

/** Make sure Higlou default leaf folders exist on the eBay Store. */
export async function ensureHiglouStoreTree(
  accessToken: string,
  categories: EbayStoreCategory[] = [],
): Promise<{ categories: EbayStoreCategory[]; created: string[] }> {
  const taxonomy = mergeTaxonomyCategories([]);
  const leafDefaults = HIGLOU_DEFAULT_STORE_PATHS.filter((path) => {
    const normalized = normalizeStorePath(path);
    if (/^\/other$/i.test(normalized)) return false; // reserved by eBay
    const leaf = normalized.split("/").filter(Boolean).pop() || "";
    if (isReservedStoreFolderName(leaf)) return false;
    return isLeafStoreCategory(normalized, taxonomy);
  });
  return ensureStorePaths(accessToken, leafDefaults, categories);
}

/**
 * One-shot: classify every active listing against YOUR Store folders, create
 * only missing suggested paths, then assign. Does not bootstrap Higlou's full
 * default tree (that competed with folders like Bath and Plumbing).
 */
export async function autoOrganizeStore(
  accessToken: string,
  options?: { minConfidence?: number; maxItems?: number },
): Promise<{
  applied: number;
  failed: Array<{ offerId: string; error: string }>;
  createdFolders: string[];
  scanned: number;
  skipped: number;
  beforeByFolder: Record<string, number>;
  afterByFolder: Record<string, number>;
}> {
  const minConfidence = options?.minConfidence ?? 0.15;
  const maxItems = Math.min(500, Math.max(1, options?.maxItems || 500));

  const store = await listSellerStoreCategories(accessToken);
  let categories = store.categories;

  const offers = await listSellerOffers(accessToken, {
    limit: 100,
    maxPages: 40,
  });
  const beforeByFolder = folderDistribution(offers);
  const suggestions = classifyOffersForStore(offers, categories);
  const toApply = suggestions
    .filter((s) => !s.unchanged && s.confidence >= minConfidence)
    .slice(0, maxItems);

  // Only create folders that were actually suggested and are missing.
  const neededPaths = toApply
    .flatMap((s) => [s.suggestedPath, s.suggestedPath2])
    .filter((path): path is string => Boolean(path))
    .filter((path) => !resolveStoreCategoryId(path, categories));
  const ensured = await ensureStorePaths(
    accessToken,
    neededPaths,
    categories,
  );
  categories = ensured.categories;

  const result = await applyStoreOrganizeSuggestions(
    accessToken,
    toApply.map((s) => ({
      offerId: s.offerId,
      suggestedPath: s.suggestedPath,
      suggestedPath2: s.suggestedPath2,
      listingId: s.listingId,
      title: s.title,
      brand: s.brand,
      productType: s.productType,
      categoryName: s.categoryName,
      categoryId: s.categoryId,
    })),
    categories,
  );

  const failedIds = new Set(result.failed.map((f) => f.offerId));
  const afterByFolder = { ...beforeByFolder };
  for (const row of toApply) {
    if (failedIds.has(row.offerId)) continue;
    const from = row.currentStorePaths[0] || "(none)";
    const to = row.suggestedPath;
    afterByFolder[from] = Math.max(0, (afterByFolder[from] || 0) - 1);
    afterByFolder[to] = (afterByFolder[to] || 0) + 1;
    if (row.suggestedPath2) {
      afterByFolder[row.suggestedPath2] =
        (afterByFolder[row.suggestedPath2] || 0) + 1;
    }
  }

  return {
    applied: result.applied,
    failed: result.failed,
    createdFolders: ensured.created,
    scanned: offers.length,
    skipped: suggestions.length - toApply.length,
    beforeByFolder,
    afterByFolder,
  };
}

export function folderDistribution(
  offers: Array<{ currentStorePaths: string[] }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const offer of offers) {
    const key = offer.currentStorePaths[0] || "(none)";
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

/**
 * Set Store folder(s) on a published listing via Trading API only.
 * Supports primary StoreCategoryID + optional StoreCategory2ID (max 2).
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
    /** Extra text so plumbing/tools/lighting remap to seller folders. */
    haystack?: string;
  },
): Promise<void> {
  const inputPaths = storeCategoryNames
    .map(normalizeStorePath)
    .filter(Boolean)
    .slice(0, 2);
  if (!inputPaths.length) {
    throw new Error("At least one store category path is required");
  }

  let categories = options?.categories || [];
  if (!categories.some((c) => c.categoryId)) {
    const store = await listSellerStoreCategories(accessToken);
    categories = store.categories;
    options?.setCategories?.(categories);
  }

  const listingId =
    String(options?.listingId || "").trim() ||
    String(offerId || "").trim();

  if (!listingId || !/^\d+$/.test(listingId)) {
    throw new Error(
      "Missing eBay item ID. Only published listings can be organized. Scan again after publishing.",
    );
  }

  const haystack = String(options?.haystack || "");

  const resolveOne = async (
    rawPath: string,
    cats: EbayStoreCategory[],
  ): Promise<{ categoryId: string; categories: EbayStoreCategory[] }> => {
    let live = usableStoreCategories(cats);
    const named = namedStoreCategories(cats);
    const inputPath = normalizeStorePath(rawPath);

    // Featured destinations are locked — do not remap Smart Home → Lighting.
    let targetPath = isFeaturedStorePath(inputPath, named)
      ? inputPath
      : preferSellerStorePath(inputPath, haystack, named);

    const bath = findSellerBathPlumbingFolder(named);
    const tools = findSellerToolsFolder(named);
    const lighting = findSellerLightingFolder(named);
    const smartHome = findSellerSmartHomeFolder(named);
    const outdoor = findSellerOutdoorLivingFolder(named);

    // Competing Higlou folders → featured folders
    if (bath && (HIGLOU_PLUMBING_PATH_RE.test(targetPath) || /^\/plumbing(\/|$)/i.test(targetPath))) {
      targetPath = normalizeStorePath(bath.path);
    } else if (tools && HIGLOU_TOOLS_PATH_RE.test(targetPath) && !isFeaturedStorePath(targetPath, named)) {
      // Only remap Higlou /Tools/Power Tools style paths; keep featured /Tools.
      if (/^\/tools\//i.test(targetPath)) {
        targetPath = normalizeStorePath(tools.path);
      }
    } else if (outdoor && HIGLOU_OUTDOOR_PATH_RE.test(targetPath)) {
      targetPath = normalizeStorePath(outdoor.path);
    } else if (
      smartHome &&
      (HIGLOU_LIGHTING_PATH_RE.test(targetPath) ||
        /^\/lighting(\/|$)/i.test(targetPath) ||
        (lighting &&
          normalizeStorePath(targetPath) === normalizeStorePath(lighting.path)))
    ) {
      // Lighting (18 items stuck here) must move to Smart Home.
      targetPath = normalizeStorePath(smartHome.path);
    }

    // Re-lock after remaps
    if (
      !isFeaturedStorePath(targetPath, named) &&
      smartHome &&
      LIGHTING_PRODUCT_RE.test(haystack) &&
      !TOOLS_PRODUCT_RE.test(haystack) &&
      !PLUMBING_PRODUCT_RE.test(haystack) &&
      !OUTDOOR_PRODUCT_RE.test(haystack)
    ) {
      targetPath = normalizeStorePath(smartHome.path);
    }

    const exact =
      live.find(
        (c) => normalizeStorePath(c.path) === normalizeStorePath(targetPath),
      ) ||
      named.find(
        (c) => normalizeStorePath(c.path) === normalizeStorePath(targetPath),
      );

    if (exact && isLeafStoreCategory(exact.path, live.length ? live : named)) {
      targetPath = normalizeStorePath(exact.path);
    } else if (exact && !isLeafStoreCategory(exact.path, live.length ? live : named)) {
      // Parent folder (e.g. Tools with 5 children): prefer a General leaf under
      // it rather than a random sibling like Power Tools that may not match.
      const pool = live.length ? live : named;
      const general = pool.find(
        (c) =>
          normalizeStorePath(c.path) ===
            normalizeStorePath(`${exact.path}/General`) && c.categoryId,
      );
      if (general) {
        targetPath = normalizeStorePath(general.path);
      } else {
        targetPath = normalizeStorePath(`${normalizeStorePath(exact.path)}/General`);
      }
    } else if (!exact) {
      const themeFolder =
        bath &&
        (HIGLOU_PLUMBING_PATH_RE.test(targetPath) ||
          PLUMBING_PRODUCT_RE.test(haystack)) &&
        !TOOLS_PRODUCT_RE.test(haystack)
          ? bath
          : tools &&
              (HIGLOU_TOOLS_PATH_RE.test(targetPath) ||
                TOOLS_PRODUCT_RE.test(haystack)) &&
              !PLUMBING_PRODUCT_RE.test(haystack) &&
              !OUTDOOR_PRODUCT_RE.test(haystack)
            ? tools
            : outdoor &&
                (HIGLOU_OUTDOOR_PATH_RE.test(targetPath) ||
                  OUTDOOR_PRODUCT_RE.test(haystack))
              ? outdoor
              : smartHome &&
                  (SMART_HOME_PRODUCT_RE.test(haystack) ||
                    LIGHTING_PRODUCT_RE.test(haystack) ||
                    HIGLOU_LIGHTING_PATH_RE.test(targetPath))
                ? smartHome
                : !smartHome &&
                    lighting &&
                    (HIGLOU_LIGHTING_PATH_RE.test(targetPath) ||
                      LIGHTING_PRODUCT_RE.test(haystack))
                  ? lighting
                  : null;

      if (themeFolder) {
        targetPath = normalizeStorePath(themeFolder.path);
        const pool = live.length ? live : named;
        if (!isLeafStoreCategory(targetPath, pool)) {
          targetPath = normalizeStorePath(
            `${normalizeStorePath(themeFolder.path)}/General`,
          );
        }
      } else if (!isLeafStoreCategory(targetPath, live.length ? live : named)) {
        targetPath = pickLeafStorePath(targetPath, live.length ? live : named);
      }
    }

    let ensured = await ensureStoreCategoryId(accessToken, targetPath, cats);
    live = usableStoreCategories(ensured.categories);
    let categoryId = ensured.categoryId;
    const catMeta = ensured.categories.find((c) => c.categoryId === categoryId);
    if (catMeta && !isLeafStoreCategory(catMeta.path, live)) {
      // Never bounce featured Smart Home/Bath into Lighting children.
      const leafPath = normalizeStorePath(
        `${normalizeStorePath(catMeta.path)}/General`,
      );
      ensured = await ensureStoreCategoryId(
        accessToken,
        leafPath,
        ensured.categories,
      );
      categoryId = ensured.categoryId;
    }
    return { categoryId, categories: ensured.categories };
  };

  // Primary
  let primary = await resolveOne(inputPaths[0], categories);
  categories = primary.categories;
  options?.setCategories?.(categories);

  // Optional secondary (Smart Home, etc.)
  let secondaryId = "0";
  let path2 =
    inputPaths[1] ||
    pickSecondaryStorePath(haystack, inputPaths[0], usableStoreCategories(categories));
  if (path2 && normalizeStorePath(path2) !== normalizeStorePath(inputPaths[0])) {
    try {
      const secondary = await resolveOne(path2, categories);
      categories = secondary.categories;
      options?.setCategories?.(categories);
      if (secondary.categoryId !== primary.categoryId) {
        secondaryId = secondary.categoryId;
      }
    } catch {
      // Secondary is best-effort — primary still applies.
      secondaryId = "0";
    }
  }

  await assignStoreCategoryViaTrading(
    accessToken,
    listingId,
    primary.categoryId,
    secondaryId,
  );
}

export async function applyStoreOrganizeSuggestions(
  accessToken: string,
  suggestions: Array<{
    offerId: string;
    suggestedPath: string;
    suggestedPath2?: string | null;
    listingId?: string | null;
    skip?: boolean;
    title?: string | null;
    brand?: string | null;
    productType?: string | null;
    categoryName?: string | null;
    categoryId?: string | null;
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
      const paths = [row.suggestedPath, row.suggestedPath2].filter(
        (p): p is string => Boolean(p && String(p).trim()),
      );
      await assignStoreCategoriesToOffer(accessToken, row.offerId, paths, {
        listingId: row.listingId,
        categories: liveCategories,
        haystack: [
          row.title,
          row.brand,
          row.productType,
          row.categoryName,
          row.categoryId,
          row.suggestedPath,
          row.suggestedPath2,
        ]
          .filter(Boolean)
          .join(" "),
        setCategories: (next) => {
          liveCategories = next;
        },
      });
      applied += 1;
    } catch (error) {
      failed.push({
        offerId: row.offerId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Stop burning remaining quota / queue when eBay daily limit is hit.
      if (isEbayUsageLimitError(error)) break;
    }
  }

  return { applied, failed };
}

/**
 * After live publish: classify title → prefer seller folders (Bath and Plumbing)
 * → create only if missing → assign with retries (eBay lags right after publish).
 */
export async function organizeListingOnPublish(
  accessToken: string,
  input: {
    listingId: string;
    title: string;
    sku?: string;
    categoryId?: string;
    categoryName?: string;
    brand?: string;
    productType?: string;
  },
): Promise<{
  storePath: string;
  storePath2: string | null;
  createdFolder: boolean;
  confidence: number;
  reason: string;
}> {
  const listingId = String(input.listingId || "").trim();
  if (!listingId || !/^\d+$/.test(listingId)) {
    throw new Error("organizeListingOnPublish requires a numeric eBay listingId");
  }

  const title = String(input.title || "").trim() || listingId;
  const haystack = offerClassifyHaystack({
    offerId: listingId,
    sku: String(input.sku || listingId),
    status: "PUBLISHED",
    title,
    categoryId: String(input.categoryId || ""),
    listingId,
    price: null,
    currentStorePaths: [],
    categoryName: input.categoryName,
    brand: input.brand,
    productType: input.productType,
  });

  let lastError: unknown = null;
  let storePath = "/Home/General Merchandise";
  let storePath2: string | null = null;
  let reason = "Assigned on publish";
  let confidence = 0.5;
  let createdFolder = false;

  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) await sleep(2000 * attempt);
    try {
      const store = await listSellerStoreCategories(accessToken);
      const [suggestion] = classifyOffersForStore(
        [
          {
            offerId: listingId,
            sku: String(input.sku || listingId),
            status: "PUBLISHED",
            title,
            categoryId: String(input.categoryId || ""),
            listingId,
            price: null,
            currentStorePaths: [],
            categoryName: input.categoryName,
            brand: input.brand,
            productType: input.productType,
          },
        ],
        store.categories,
      );

      storePath = preferSellerStorePath(
        suggestion?.suggestedPath || storePath,
        haystack,
        store.categories,
      );
      storePath2 =
        suggestion?.suggestedPath2 ||
        pickSecondaryStorePath(haystack, storePath, store.categories);
      confidence = suggestion?.confidence ?? confidence;
      reason = suggestion?.reason || reason;

      const beforeId = resolveStoreCategoryId(storePath, store.categories);
      const paths = [storePath, storePath2].filter(
        (p): p is string => Boolean(p && String(p).trim()),
      );
      await assignStoreCategoriesToOffer(accessToken, listingId, paths, {
        listingId,
        categories: store.categories,
        haystack,
      });
      createdFolder = !beforeId;

      return {
        storePath,
        storePath2,
        createdFolder,
        confidence,
        reason,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError || "Store organize on publish failed"));
}
