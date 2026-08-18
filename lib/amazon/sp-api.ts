import {
  type AmazonCatalogSnapshot,
  type AmazonProductTypeSchema,
} from "@/lib/amazon/listing-attributes";
import {
  sellingPartnerIdFromAccessToken,
  sellingPartnerIdFromPayload,
} from "@/lib/amazon/seller-id";
import { getAmazonSpConfig } from "@/lib/amazon/sp-config";

export type AmazonSpIssue = {
  code?: string;
  message?: string;
  severity?: string;
  attributeNames?: string[];
  categories?: string[];
  enforcements?: {
    actions?: Array<{ action?: string }>;
  };
};

async function amazonFetch(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const cfg = getAmazonSpConfig();
  const res = await fetch(`${cfg.apiBase}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-amz-access-token": accessToken,
      "user-agent": "Higlou/1.0 (Language=JavaScript)",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, json };
}

export async function resolveAmazonSellingPartnerId(
  accessToken: string,
): Promise<string> {
  const fromToken = sellingPartnerIdFromAccessToken(accessToken);
  if (fromToken) return fromToken;

  const fromEnv = (process.env.AMAZON_SELLING_PARTNER_ID || "").trim();
  const paths = [
    "/sellers/v1/account",
    "/sellers/2021-07-01/account",
    "/sellers/v1/marketplaceParticipations",
  ];
  for (const path of paths) {
    const { ok, json } = await amazonFetch(accessToken, path);
    if (!ok) continue;
    const found = sellingPartnerIdFromPayload(json);
    if (found) return found;
  }

  const cfg = getAmazonSpConfig();
  const { json: feeJson } = await amazonFetch(
    accessToken,
    "/products/fees/v0/items/B08N5WRWNW/feesEstimate",
    {
      method: "POST",
      body: JSON.stringify({
        FeesEstimateRequest: {
          MarketplaceId: cfg.marketplaceId,
          IsAmazonFulfilled: false,
          PriceToEstimateFees: {
            ListingPrice: { CurrencyCode: "USD", Amount: 10 },
          },
          Identifier: "higlou-seller-id",
        },
      }),
    },
  );
  const fromFees = sellingPartnerIdFromPayload(feeJson);
  if (fromFees) return fromFees;

  return fromEnv;
}

export function amazonIssuesText(payload: Record<string, unknown>): string {
  const issues = (payload.issues || payload.errors || []) as AmazonSpIssue[];
  if (!Array.isArray(issues) || !issues.length) {
    const err = payload.errors as AmazonSpIssue[] | undefined;
    if (Array.isArray(err) && err[0]?.message) return String(err[0].message);
    return "";
  }
  return issues
    .map((issue) => String(issue.message || issue.code || "").trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(" · ");
}

export function amazonErrorIssues(issues: AmazonSpIssue[] | undefined): AmazonSpIssue[] {
  return (Array.isArray(issues) ? issues : []).filter((issue) => {
    const severity = String(issue.severity || "");
    const categories = (issue.categories || []).join(" ");
    return (
      /error|invalid/i.test(severity) ||
      /MISSING_ATTRIBUTE|INVALID_ATTRIBUTE|MISSING_PRICE|INVALID_PRICE/i.test(categories)
    );
  });
}

export function amazonBrandGatingReason(issues: AmazonSpIssue[] | undefined): string {
  const list = Array.isArray(issues) ? issues : [];
  const blocked = list.find((issue) => {
    const categories = (issue.categories || []).join(" ");
    const message = String(issue.message || "");
    const actions = (issue.enforcements?.actions || [])
      .map((action) => String(action.action || ""))
      .join(" ");
    return (
      /QUALIFICATION_REQUIRED/i.test(categories) ||
      /LISTING_SUPPRESSED/i.test(actions) ||
      /approval to list in this brand/i.test(message)
    );
  });
  if (!blocked) return "";
  if (/approval to list in this brand/i.test(String(blocked.message || ""))) {
    return "Amazon blocked this brand. Open Seller Central → Selling applications and request approval. Until Amazon approves it, the offer will not show in Inventory.";
  }
  return String(blocked.message || "").trim() || "Amazon suppressed this listing.";
}

export function amazonIncompleteListingReason(
  issues: AmazonSpIssue[] | undefined,
  status?: string,
): string {
  const brand = amazonBrandGatingReason(issues);
  if (brand) return brand;
  const errors = amazonErrorIssues(issues);
  const text = amazonIssuesText({ issues: errors });
  if (/^INVALID$/i.test(String(status || "")) && text) {
    return `Amazon says this listing is not ready: ${text}`;
  }
  if (text) return `Amazon still needs: ${text}`;
  if (/^INVALID$/i.test(String(status || ""))) {
    return "Amazon rejected this listing as incomplete.";
  }
  return "";
}

export type AmazonCatalogHit = {
  asin: string;
  title: string;
  productType: string;
  identifiers?: string[];
};

export async function searchAmazonCatalogByIdentifier(opts: {
  accessToken: string;
  marketplaceId: string;
  identifier: string;
  identifierType: "ASIN" | "UPC" | "EAN" | "GTIN";
}): Promise<AmazonCatalogHit[]> {
  const params = new URLSearchParams({
    marketplaceIds: opts.marketplaceId,
    identifiers: opts.identifier,
    identifiersType: opts.identifierType,
    includedData: "summaries,identifiers,productTypes,attributes",
    pageSize: "10",
  });
  const { ok, json } = await amazonFetch(
    opts.accessToken,
    `/catalog/2022-04-01/items?${params.toString()}`,
  );
  if (!ok) {
    const detail = amazonIssuesText(json) || "Amazon catalog lookup failed";
    throw new Error(detail);
  }
  return catalogHitsFromPayload(json);
}

function catalogHitsFromPayload(json: Record<string, unknown>): AmazonCatalogHit[] {
  const items = (json.items as Array<Record<string, unknown>> | undefined) || [];
  return items
    .map((item) => {
      const summaries = (item.summaries as Array<Record<string, unknown>>) || [];
      const types = (item.productTypes as Array<Record<string, unknown>>) || [];
      const identifiers: string[] = [];
      const walk = (value: unknown) => {
        if (!value) return;
        if (Array.isArray(value)) {
          value.forEach(walk);
          return;
        }
        if (typeof value === "object") {
          const row = value as Record<string, unknown>;
          if (typeof row.identifier === "string") identifiers.push(row.identifier);
          if (typeof row.value === "string" && row.value.length <= 40) {
            identifiers.push(row.value);
          }
          Object.values(row).forEach(walk);
        }
      };
      walk(item.identifiers);
      walk(item.attributes);
      return {
        asin: String(item.asin || summaries[0]?.asin || "").toUpperCase(),
        title: String(summaries[0]?.itemName || ""),
        productType: String(types[0]?.productType || "PRODUCT"),
        identifiers,
      };
    })
    .filter((row) => /^[A-Z0-9]{10}$/.test(row.asin));
}

export async function searchAmazonCatalogByKeywords(opts: {
  accessToken: string;
  marketplaceId: string;
  keywords: string;
  brand?: string;
}): Promise<AmazonCatalogHit[]> {
  const keywords = String(opts.keywords || "").trim();
  if (!keywords) return [];
  const params = new URLSearchParams({
    marketplaceIds: opts.marketplaceId,
    keywords,
    includedData: "summaries,identifiers,productTypes,attributes",
    pageSize: "20",
  });
  const { ok, json } = await amazonFetch(
    opts.accessToken,
    `/catalog/2022-04-01/items?${params.toString()}`,
  );
  if (!ok) {
    const detail = amazonIssuesText(json) || "Amazon catalog search failed";
    throw new Error(detail);
  }
  return catalogHitsFromPayload(json);
}

export async function searchAmazonCatalogForListing(opts: {
  accessToken: string;
  marketplaceId: string;
  queries: string[];
}): Promise<AmazonCatalogHit[]> {
  const seen = new Set<string>();
  const hits: AmazonCatalogHit[] = [];
  for (const query of opts.queries.slice(0, 4)) {
    const batch = await searchAmazonCatalogByKeywords({
      accessToken: opts.accessToken,
      marketplaceId: opts.marketplaceId,
      keywords: query,
    });
    for (const hit of batch) {
      if (seen.has(hit.asin)) continue;
      seen.add(hit.asin);
      hits.push(hit);
    }
    if (hits.length >= 12) break;
  }
  return hits;
}

export function amazonListingBlockedReason(
  issues: AmazonSpIssue[] | undefined,
): string {
  const list = Array.isArray(issues) ? issues : [];
  const blocked = list.find((issue) => {
    const severity = String(issue.severity || "");
    const categories = (issue.categories || []).join(" ");
    const actions = (issue.enforcements?.actions || [])
      .map((action) => String(action.action || ""))
      .join(" ");
    return (
      /error|invalid/i.test(severity) ||
      /QUALIFICATION_REQUIRED/i.test(categories) ||
      /LISTING_SUPPRESSED/i.test(actions)
    );
  });
  if (!blocked) return "";
  const message = String(blocked.message || "").trim();
  if (/approval to list in this brand/i.test(message)) {
    return "Amazon blocked this brand. Open Seller Central → Selling applications and request approval. Until Amazon approves it, the offer will not show in Inventory.";
  }
  return message || "Amazon suppressed this listing.";
}

function catalogImagesFromPayload(json: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const walk = (value: unknown) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value === "object") {
      const row = value as Record<string, unknown>;
      const link = String(row.link || row.url || "");
      if (/^https:\/\//i.test(link)) urls.push(link);
      Object.values(row).forEach(walk);
    }
  };
  walk(json.images);
  return [...new Set(urls)];
}

export async function getAmazonCatalogItem(opts: {
  accessToken: string;
  marketplaceId: string;
  asin: string;
}): Promise<AmazonCatalogSnapshot | null> {
  const asin = opts.asin.trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) return null;
  const params = new URLSearchParams({
    marketplaceIds: opts.marketplaceId,
    includedData:
      "summaries,attributes,images,identifiers,productTypes,classifications",
  });
  const { ok, json } = await amazonFetch(
    opts.accessToken,
    `/catalog/2022-04-01/items/${encodeURIComponent(asin)}?${params.toString()}`,
  );
  if (!ok) return null;
  const summaries = (json.summaries as Array<Record<string, unknown>>) || [];
  const types = (json.productTypes as Array<Record<string, unknown>>) || [];
  const summary = summaries[0] || {};
  const browse = summary.browseClassification as
    | { classificationId?: string }
    | undefined;
  const brand = String(summary.brand || summary.brandName || "").trim();
  const manufacturer = String(summary.manufacturer || "").trim();
  const attributes = {
    ...((json.attributes as Record<string, unknown>) || {}),
  };
  return {
    asin,
    title: String(summary.itemName || ""),
    productType: String(types[0]?.productType || "PRODUCT"),
    attributes,
    images: catalogImagesFromPayload(json),
    browseNodeId: browse?.classificationId
      ? String(browse.classificationId)
      : undefined,
    brand,
    manufacturer,
  };
}

export async function searchAmazonProductType(opts: {
  accessToken: string;
  marketplaceId: string;
  itemName: string;
}): Promise<string> {
  const itemName = String(opts.itemName || "").trim();
  if (!itemName) return "";
  const params = new URLSearchParams({
    marketplaceIds: opts.marketplaceId,
    itemName,
  });
  const { ok, json } = await amazonFetch(
    opts.accessToken,
    `/definitions/2020-09-01/productTypes?${params.toString()}`,
  );
  if (!ok) return "";
  const types = (json.productTypes as Array<Record<string, unknown>>) || [];
  const named = types.find((row) => {
    const name = String(row.name || row.productType || "");
    return name && name !== "PRODUCT";
  });
  return String(named?.name || named?.productType || "");
}

export async function getAmazonProductTypeSchema(opts: {
  accessToken: string;
  marketplaceId: string;
  sellerId: string;
  productType: string;
  requirements?: "LISTING" | "LISTING_OFFER_ONLY";
}): Promise<AmazonProductTypeSchema | null> {
  const productType = String(opts.productType || "PRODUCT").trim() || "PRODUCT";
  const requirements = opts.requirements || "LISTING";
  const params = new URLSearchParams({
    marketplaceIds: opts.marketplaceId,
    sellerId: opts.sellerId,
    locale: "en_US",
    productTypeVersion: "LATEST",
    requirements,
  });
  if (requirements === "LISTING") params.set("parentageLevel", "NONE");
  const { ok, json } = await amazonFetch(
    opts.accessToken,
    `/definitions/2020-09-01/productTypes/${encodeURIComponent(productType)}?${params.toString()}`,
  );
  if (!ok) return null;
  const schema = json.schema as { link?: { resource?: string } } | undefined;
  const url = schema?.link?.resource || "";
  if (!url) return null;
  const schemaJson = (await fetch(url, { cache: "no-store" }).then((res) =>
    res.json(),
  )) as {
    required?: string[];
    properties?: Record<string, Record<string, unknown>>;
  };
  return {
    productType,
    required: Array.isArray(schemaJson.required)
      ? schemaJson.required.map(String)
      : [],
    properties: schemaJson.properties || {},
    raw: schemaJson as Record<string, unknown>,
  };
}

export async function getAmazonListingItem(opts: {
  accessToken: string;
  sellerId: string;
  sku: string;
  marketplaceId: string;
}): Promise<{
  sku: string;
  status: string;
  asin: string;
  issues: AmazonSpIssue[];
  attributes: Record<string, unknown>;
}> {
  const params = new URLSearchParams({
    marketplaceIds: opts.marketplaceId,
    includedData: "summaries,issues,attributes",
  });
  const { ok, status, json } = await amazonFetch(
    opts.accessToken,
    `/listings/2021-08-01/items/${encodeURIComponent(opts.sellerId)}/${encodeURIComponent(opts.sku)}?${params.toString()}`,
  );
  const issues = (json.issues as AmazonSpIssue[] | undefined) || [];
  if (!ok) {
    throw new Error(
      amazonIssuesText(json) || `Amazon listing lookup failed (${status})`,
    );
  }
  const summaries = (json.summaries as Array<Record<string, unknown>>) || [];
  return {
    sku: String(json.sku || opts.sku),
    status: String(summaries[0]?.status || json.status || ""),
    asin: String(summaries[0]?.asin || ""),
    issues,
    attributes: (json.attributes as Record<string, unknown>) || {},
  };
}

export async function putAmazonListingOffer(opts: {
  accessToken: string;
  sellerId: string;
  sku: string;
  marketplaceId: string;
  productType: string;
  attributes: Record<string, unknown>;
  requirements?: "LISTING" | "LISTING_OFFER_ONLY";
  mode?: "DEFAULT" | "VALIDATION_PREVIEW";
}): Promise<{ sku: string; status: string; issues: AmazonSpIssue[] }> {
  const params = new URLSearchParams({
    marketplaceIds: opts.marketplaceId,
    includedData: "issues",
    issueLocale: "en_US",
  });
  if (opts.mode === "VALIDATION_PREVIEW") {
    params.set("mode", "VALIDATION_PREVIEW");
  }
  const { ok, status, json } = await amazonFetch(
    opts.accessToken,
    `/listings/2021-08-01/items/${encodeURIComponent(opts.sellerId)}/${encodeURIComponent(opts.sku)}?${params.toString()}`,
    {
      method: "PUT",
      body: JSON.stringify({
        productType: opts.productType || "PRODUCT",
        requirements: opts.requirements || "LISTING",
        attributes: opts.attributes,
      }),
    },
  );
  const issues = (json.issues as AmazonSpIssue[] | undefined) || [];
  const listingStatus = String(json.status || (ok ? "ACCEPTED" : "INVALID"));
  if (opts.mode === "VALIDATION_PREVIEW") {
    return {
      sku: String(json.sku || opts.sku),
      status: listingStatus,
      issues: issues.length ? issues : ((json.errors as AmazonSpIssue[]) || []),
    };
  }
  if (!ok || /^INVALID$/i.test(listingStatus)) {
    throw new Error(
      amazonIncompleteListingReason(issues, listingStatus) ||
        amazonIssuesText(json) ||
        `Amazon listing failed (${status})`,
    );
  }
  const blocked = amazonBrandGatingReason(issues) || amazonListingBlockedReason(issues);
  if (blocked) throw new Error(blocked);
  return {
    sku: String(json.sku || opts.sku),
    status: listingStatus,
    issues,
  };
}
