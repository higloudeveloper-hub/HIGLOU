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

/** Trailing HD model: 17000148, DCD791P1, BEBRNOV-PD27, or combo 2541-20-48-73-2010. */
export function modelFromHomeDepotSlug(slug: string): string {
  const s = String(slug || "").trim();
  if (!s) return "";
  const combo = s.match(/(\d{3,5}-\d{2}(?:-\d{2,4}){1,8})$/i)?.[1];
  if (combo && combo.replace(/-/g, "").length >= 6) return combo;

  const tokens = s.split("-").filter(Boolean);
  const walked = trailingHomeDepotModel(tokens);
  if (walked) return walked;

  const last = tokens[tokens.length - 1] || "";
  if (/^[A-Z0-9][A-Z0-9.]{5,}$/i.test(last)) return last;
  return "";
}

const HD_SLUG_STOP =
  /^(and|the|with|for|from|inch|in|ft|oz|led|light|lights|bulb|bulbs|watt|watts|pack|kit|set|only|black|white|red|plus|ultra|bright|adjustable|panels|panel|wired|outdoor|head|security|flood|motion|sensing|lumens|lumen)$/i;

function looksLikeHomeDepotModelToken(token: string): boolean {
  const t = String(token || "").trim();
  if (!t || t.length > 20) return false;
  if (HD_SLUG_STOP.test(t)) return false;
  if (/\d/.test(t)) return true;
  return t.length >= 5 && /^[A-Z0-9]+$/.test(t) && t === t.toUpperCase();
}

function trailingHomeDepotModel(tokens: string[]): string {
  const parts: string[] = [];
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (!looksLikeHomeDepotModelToken(tokens[i])) break;
    parts.unshift(tokens[i]);
  }
  const model = parts.join("-");
  const compact = model.replace(/-/g, "");
  if (!model || !/\d/.test(model) || compact.length < 6) return "";
  return model;
}

/** Title / brand / model from the SEO slug when Home Depot blocks the HTML. */
export function identityFromHomeDepotLink(parsed: ParsedHomeDepotLink): {
  title: string;
  brand: string;
  model: string;
} {
  const rawTokens = parsed.slug.split("-").map((t) => t.trim()).filter(Boolean);
  if (!rawTokens.length) {
    return { title: "", brand: "", model: "" };
  }
  const model = modelFromHomeDepotSlug(parsed.slug);
  let used = rawTokens;
  if (model) {
    const parts = model.split("-");
    const tail = rawTokens.slice(-parts.length).join("-");
    if (tail.toLowerCase() === model.toLowerCase()) {
      used = rawTokens.slice(0, -parts.length);
    }
  }
  const words = used.map((t) => t.replace(/([a-z])([A-Z])/g, "$1 $2"));
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
