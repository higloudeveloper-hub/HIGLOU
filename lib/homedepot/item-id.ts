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
  slug: string;
};

function slugFromPath(pathname: string, itemId: string): string {
  const parts = pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1] || "";
  const slug = last === itemId ? parts[parts.length - 2] || "" : last;
  if (!slug || /^\d{8,12}$/.test(slug)) return "";
  return decodeURIComponent(slug);
}

/** Title / brand / model from the SEO slug when Home Depot blocks the HTML. */
export function identityFromHomeDepotLink(parsed: ParsedHomeDepotLink): {
  title: string;
  brand: string;
  model: string;
} {
  const tokens = parsed.slug
    .split("-")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.replace(/([a-z])([A-Z])/g, "$1 $2"));
  if (!tokens.length) {
    return { title: "", brand: "", model: "" };
  }
  const last = tokens[tokens.length - 1] || "";
  const model = /^[A-Z0-9][A-Z0-9.]{3,}$/i.test(last) ? last : "";
  const words = model ? tokens.slice(0, -1) : tokens;
  const title = words.join(" ").replace(/\s+/g, " ").trim();
  return {
    title,
    brand: words[0] || "",
    model,
  };
}

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
      slug: "",
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
    slug: slugFromPath(url.pathname, itemId),
  };
}
