const ASIN_RE = /^[A-Z0-9]{10}$/i;

const AMAZON_HOST =
  /(^|\.)amazon\.(com|ca|com\.mx|co\.uk|de|fr|it|es|nl|se|pl|com\.be|ie|com\.au|com\.br|in|sg|ae|sa|co\.jp|com\.tr)(:\d+)?$/i;

function looksLikeAsin(value: string): boolean {
  return ASIN_RE.test(value.trim());
}

function hostIsAmazon(host: string): boolean {
  const h = host.replace(/^www\./i, "").toLowerCase();
  return AMAZON_HOST.test(h) || h === "amzn.to" || h === "amzn.com" || h === "a.co";
}

function asinFromPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  for (let i = 0; i < parts.length; i += 1) {
    const token = parts[i];
    const next = parts[i + 1];
    if (
      next &&
      /^(dp|product|aw|d|gp|asin)$/i.test(token) === false &&
      looksLikeAsin(next) &&
      /^(dp|gp|product|aw|d|asin)$/i.test(token)
    ) {
      return next.toUpperCase();
    }
    if (/^(dp|product|asin)$/i.test(token) && next && looksLikeAsin(next)) {
      return next.toUpperCase();
    }
    if (looksLikeAsin(token) && i > 0) {
      const prev = parts[i - 1];
      if (/^(dp|product|gp|aw|d|asin)$/i.test(prev)) {
        return token.toUpperCase();
      }
    }
  }
  const dp = pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/asin)\/([A-Z0-9]{10})/i);
  return dp?.[1] ? dp[1].toUpperCase() : null;
}

export type ParsedAmazonLink = {
  asin: string;
  canonicalUrl: string;
  original: string;
  short: boolean;
};

/** Pull an ASIN from a full Amazon URL, a short link, or a bare ASIN. */
export function parseAmazonLink(input: string): ParsedAmazonLink | null {
  const original = String(input || "").trim();
  if (!original) return null;

  if (looksLikeAsin(original)) {
    const asin = original.toUpperCase();
    return {
      asin,
      canonicalUrl: `https://www.amazon.com/dp/${asin}`,
      original,
      short: false,
    };
  }

  let raw = original;
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const short = /^(www\.)?(amzn\.to|amzn\.com|a\.co)$/i.test(url.hostname);
  if (!hostIsAmazon(url.hostname)) return null;

  const fromQuery =
    url.searchParams.get("asin") ||
    url.searchParams.get("ASIN") ||
    url.searchParams.get("pd_rd_i");
  const asin = (fromQuery && looksLikeAsin(fromQuery)
    ? fromQuery.toUpperCase()
    : asinFromPath(url.pathname));

  if (!asin && !short) return null;
  if (!asin && short) {
    return {
      asin: "",
      canonicalUrl: url.toString(),
      original,
      short: true,
    };
  }

  const host = url.hostname.toLowerCase().startsWith("www.")
    ? url.hostname
    : `www.${url.hostname}`;
  return {
    asin: asin || "",
    canonicalUrl: asin
      ? `https://${host}/dp/${asin}`
      : url.toString(),
    original,
    short,
  };
}

/** ASIN the seller already gave Higlou: import, AMZ-SKU, or item specific. */
export function amazonAsinFromListing(listing: {
  asin?: string;
  amazonAsin?: string;
  sku?: string;
  description?: string;
  itemSpecifics?: Array<{ label?: string; key?: string; value?: string }>;
}): string {
  const direct = String(listing.asin || listing.amazonAsin || "")
    .trim()
    .toUpperCase();
  if (looksLikeAsin(direct)) return direct;
  const sku = String(listing.sku || "").trim();
  const amz = sku.match(/^AMZ-([A-Z0-9]{10})$/i);
  if (amz?.[1]) return amz[1].toUpperCase();
  const fromSku = parseAmazonLink(sku)?.asin || "";
  if (fromSku && looksLikeAsin(fromSku)) return fromSku;
  for (const row of listing.itemSpecifics || []) {
    const label = String(row.label || row.key || "").replace(/^C:/, "").trim();
    if (!/^(asin|amazon\s*asin)$/i.test(label)) continue;
    const value = String(row.value || "").trim().toUpperCase();
    if (looksLikeAsin(value)) return value;
  }
  const fromCopy = String(listing.description || "").match(
    /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i,
  );
  if (fromCopy?.[1] && looksLikeAsin(fromCopy[1])) return fromCopy[1].toUpperCase();
  return "";
}

/** Official Amazon product page for an imported listing. */
export function amazonListingUrl(listing: {
  amazonUrl?: string;
  asin?: string;
  amazonAsin?: string;
  sku?: string;
  description?: string;
  itemSpecifics?: Array<{ label?: string; key?: string; value?: string }>;
}): string {
  const stored = parseAmazonLink(String(listing.amazonUrl || ""));
  if (stored?.asin) return stored.canonicalUrl;
  const asin = amazonAsinFromListing(listing);
  return asin ? `https://www.amazon.com/dp/${asin}` : "";
}
