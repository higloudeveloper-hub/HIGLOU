const HD_HOST =
  /(^|\.)homedepot\.(com|ca|com\.mx)(:\d+)?$/i;

function hostIsHomeDepot(host: string): boolean {
  const h = host.replace(/^www\./i, "").toLowerCase();
  return HD_HOST.test(h);
}

function itemIdFromPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1] || "";
  const digits = last.match(/^(\d{8,12})(?:[/?#]|$)/)?.[1];
  if (digits) return digits;
  const p = pathname.match(/\/(?:p|product)\/(?:[^/]+\/)?(\d{8,12})(?:\/|$)/i);
  return p?.[1] || null;
}

export type ParsedHomeDepotLink = {
  itemId: string;
  canonicalUrl: string;
  original: string;
  host: string;
};

/** Pull a Home Depot item id from a product URL or a bare 8–12 digit id. */
export function parseHomeDepotLink(input: string): ParsedHomeDepotLink | null {
  const original = String(input || "").trim();
  if (!original) return null;

  if (/^\d{8,12}$/.test(original)) {
    return {
      itemId: original,
      canonicalUrl: `https://www.homedepot.com/p/${original}`,
      original,
      host: "www.homedepot.com",
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

  if (!hostIsHomeDepot(url.hostname)) return null;

  const fromQuery =
    url.searchParams.get("itemId") ||
    url.searchParams.get("itemid") ||
    url.searchParams.get("ItemId");
  const itemId =
    fromQuery && /^\d{8,12}$/.test(fromQuery)
      ? fromQuery
      : itemIdFromPath(url.pathname);

  if (!itemId) return null;

  const host = url.hostname.toLowerCase().startsWith("www.")
    ? url.hostname.toLowerCase()
    : `www.${url.hostname.toLowerCase()}`;
  return {
    itemId,
    canonicalUrl: `https://${host}${url.pathname.replace(/\/$/, "") || `/p/${itemId}`}`,
    original,
    host,
  };
}
