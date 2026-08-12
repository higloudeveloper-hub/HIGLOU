/**
 * Higlou eBay Store organization — list offers, resolve Store category paths,
 * classify listings, and assign storeCategoryNames via Inventory API.
 * Scope: Higlou only (higloudeveloper-hub/HIGLOU).
 */

import { getEbayConfig } from "@/lib/ebay/config";

export type EbayStoreCategory = {
  path: string;
  name: string;
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

/** Flatten custom category nodes from Trading API GetStore XML. */
function parseStoreCategoriesFromXml(xml: string): EbayStoreCategory[] {
  const out: EbayStoreCategory[] = [];
  // Match CustomCategory blocks with Name; build paths from nested structure is hard in regex.
  // Prefer flat Name extraction + parent hints when present.
  const nameRe =
    /<CustomCategory>[\s\S]*?<CategoryID>(\d+)<\/CategoryID>[\s\S]*?<Name>([^<]+)<\/Name>[\s\S]*?(?:<Order>\d+<\/Order>)?[\s\S]*?<\/CustomCategory>/gi;
  const names: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = nameRe.exec(xml))) {
    const name = m[2].trim();
    if (name) names.push(name);
  }
  // Also try simpler Name tags under CustomCategories
  if (!names.length) {
    const simple = xml.matchAll(/<Name>([^<]+)<\/Name>/g);
    for (const hit of simple) {
      const name = hit[1].trim();
      if (name && !/eBay|Store|Description/i.test(name)) names.push(name);
    }
  }
  for (const name of names) {
    const path = normalizeStorePath(`/${name}`);
    if (path && !out.some((c) => c.path === path)) {
      out.push({ path, name });
    }
  }
  return out;
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

export async function listSellerOffers(
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
      const offerId = String(offer.offerId || "").trim();
      const sku = String(offer.sku || "").trim();
      if (!offerId || !sku) continue;
      const title =
        String(offer.listing?.title || "").trim() ||
        String(offer.listingDescription || "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 120) ||
        sku;
      rows.push({
        offerId,
        sku,
        status: String(offer.status || "").toUpperCase(),
        title,
        categoryId: String(offer.categoryId || ""),
        listingId: offer.listing?.listingId
          ? String(offer.listing.listingId)
          : null,
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
 * Set storeCategoryNames on an existing offer without dropping other fields.
 * Reads the offer, merges paths, PUTs the full body back.
 */
export async function assignStoreCategoriesToOffer(
  accessToken: string,
  offerId: string,
  storeCategoryNames: string[],
): Promise<void> {
  const paths = storeCategoryNames
    .map(normalizeStorePath)
    .filter(Boolean)
    .slice(0, 2);
  if (!paths.length) {
    throw new Error("At least one store category path is required");
  }

  const offer = (await inventoryFetch(
    accessToken,
    `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`,
    { method: "GET" },
  )) as {
    sku?: string;
    marketplaceId?: string;
    format?: string;
    availableQuantity?: number;
    categoryId?: string;
    secondaryCategoryId?: string;
    listingDescription?: string;
    merchantLocationKey?: string;
    listingPolicies?: Record<string, unknown>;
    pricingSummary?: Record<string, unknown>;
    tax?: Record<string, unknown>;
    listingDuration?: string;
    includeCatalogProductDetails?: boolean;
    hideBuyerDetails?: boolean;
  };

  const sku = String(offer.sku || "").trim();
  const categoryId = String(offer.categoryId || "").trim();
  if (!sku || !categoryId) {
    throw new Error("Offer is missing sku or categoryId — cannot update Store folder");
  }

  const body: Record<string, unknown> = {
    sku,
    marketplaceId: String(offer.marketplaceId || "EBAY_US"),
    format: offer.format || "FIXED_PRICE",
    availableQuantity: Math.max(1, Number(offer.availableQuantity) || 1),
    categoryId,
    listingDescription: offer.listingDescription || "",
    pricingSummary: offer.pricingSummary || {
      price: { value: "0.99", currency: "USD" },
    },
    storeCategoryNames: paths,
  };
  if (offer.secondaryCategoryId) {
    body.secondaryCategoryId = offer.secondaryCategoryId;
  }
  if (offer.merchantLocationKey) {
    body.merchantLocationKey = offer.merchantLocationKey;
  }
  if (offer.listingPolicies) {
    body.listingPolicies = offer.listingPolicies;
  }
  if (offer.tax) body.tax = offer.tax;
  if (offer.listingDuration) body.listingDuration = offer.listingDuration;
  if (typeof offer.includeCatalogProductDetails === "boolean") {
    body.includeCatalogProductDetails = offer.includeCatalogProductDetails;
  }
  if (typeof offer.hideBuyerDetails === "boolean") {
    body.hideBuyerDetails = offer.hideBuyerDetails;
  }

  await inventoryFetch(
    accessToken,
    `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`,
    { method: "PUT", body: JSON.stringify(body) },
  );
}

export async function applyStoreOrganizeSuggestions(
  accessToken: string,
  suggestions: Array<{ offerId: string; suggestedPath: string; skip?: boolean }>,
): Promise<{
  applied: number;
  failed: Array<{ offerId: string; error: string }>;
}> {
  let applied = 0;
  const failed: Array<{ offerId: string; error: string }> = [];

  for (const row of suggestions) {
    if (row.skip) continue;
    try {
      await assignStoreCategoriesToOffer(accessToken, row.offerId, [
        row.suggestedPath,
      ]);
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
