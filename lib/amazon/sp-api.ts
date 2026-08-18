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

export type AmazonCatalogHit = {
  asin: string;
  title: string;
  productType: string;
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
    includedData: "summaries,identifiers,productTypes",
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
  const items = (json.items as Array<Record<string, unknown>> | undefined) || [];
  return items
    .map((item) => {
      const summaries = (item.summaries as Array<Record<string, unknown>>) || [];
      const types = (item.productTypes as Array<Record<string, unknown>>) || [];
      return {
        asin: String(item.asin || summaries[0]?.asin || "").toUpperCase(),
        title: String(summaries[0]?.itemName || ""),
        productType: String(types[0]?.productType || "PRODUCT"),
      };
    })
    .filter((row) => /^[A-Z0-9]{10}$/.test(row.asin));
}

export async function putAmazonListingOffer(opts: {
  accessToken: string;
  sellerId: string;
  sku: string;
  marketplaceId: string;
  productType: string;
  attributes: Record<string, unknown>;
}): Promise<{ sku: string; status: string; issues: AmazonSpIssue[] }> {
  const params = new URLSearchParams({
    marketplaceIds: opts.marketplaceId,
    includedData: "issues,identifiers",
  });
  const { ok, status, json } = await amazonFetch(
    opts.accessToken,
    `/listings/2021-08-01/items/${encodeURIComponent(opts.sellerId)}/${encodeURIComponent(opts.sku)}?${params.toString()}`,
    {
      method: "PUT",
      body: JSON.stringify({
        productType: opts.productType || "PRODUCT",
        requirements: "LISTING_OFFER_ONLY",
        attributes: opts.attributes,
      }),
    },
  );
  const issues = (json.issues as AmazonSpIssue[] | undefined) || [];
  if (!ok) {
    throw new Error(
      amazonIssuesText(json) || `Amazon listing failed (${status})`,
    );
  }
  const blocking = issues.filter((issue) =>
    /error|invalid/i.test(String(issue.severity || "")),
  );
  if (blocking.length) {
    throw new Error(
      blocking
        .map((issue) => issue.message || issue.code)
        .filter(Boolean)
        .join(" · ") || "Amazon rejected the listing",
    );
  }
  return {
    sku: String(json.sku || opts.sku),
    status: String(json.status || "ACCEPTED"),
    issues,
  };
}
