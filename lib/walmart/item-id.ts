const WALMART_HOST =
  /(^|\.)walmart\.(com|ca|com\.mx)(:\d+)?$/i;

function hostIsWalmart(host: string): boolean {
  const h = host.replace(/^www\./i, "").toLowerCase();
  return WALMART_HOST.test(h);
}

function itemIdFromPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  const ip = parts.findIndex((part) => /^ip$/i.test(part));
  if (ip >= 0) {
    for (let i = parts.length - 1; i > ip; i -= 1) {
      const digits = parts[i].match(/^(\d{5,15})$/)?.[1];
      if (digits) return digits;
    }
  }
  const match = pathname.match(/\/ip\/(?:[^/]+\/)?(\d{5,15})(?:\/|$)/i);
  return match?.[1] || null;
}

export type ParsedWalmartLink = {
  itemId: string;
  canonicalUrl: string;
  original: string;
  host: string;
};

/** Pull a Walmart item id from /ip/slug/id or /ip/id. Bare numbers stay Home Depot. */
export function parseWalmartLink(input: string): ParsedWalmartLink | null {
  const original = String(input || "").trim();
  if (!original) return null;

  let raw = original;
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (!hostIsWalmart(url.hostname)) return null;

  const fromQuery =
    url.searchParams.get("itemId") ||
    url.searchParams.get("item_id") ||
    url.searchParams.get("id");
  const itemId =
    (fromQuery && /^\d{5,15}$/.test(fromQuery) ? fromQuery : null) ||
    itemIdFromPath(url.pathname);
  if (!itemId) return null;

  const host = url.hostname.toLowerCase().startsWith("www.")
    ? url.hostname.toLowerCase()
    : `www.${url.hostname.toLowerCase()}`;
  return {
    itemId,
    canonicalUrl: `https://${host}/ip/${itemId}`,
    original,
    host,
  };
}
