import {
  identityFromHomeDepotLink,
  parseHomeDepotLink,
} from "@/lib/homedepot/item-id";
import {
  collectHomeDepotImageUrlsFromHtml,
  isHomeDepotBlockedPage,
  parseHomeDepotProductPage,
  selectHomeDepotSearchPhotos,
  type HomeDepotProductDraft,
} from "@/lib/homedepot/parse-product";

const FETCH_MS = 20_000;

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";
const FACEBOOK_UA =
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

// Desktop Chrome is Akamai 403. iPhone Safari still returns the product page.
const USER_AGENTS = [IPHONE_UA, ANDROID_UA, FACEBOOK_UA, DESKTOP_UA];

function headersFor(userAgent: string): Record<string, string> {
  return {
    "User-Agent": userAgent,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
  };
}

async function readUrl(
  url: string,
  userAgent: string,
): Promise<{ finalUrl: string; body: string; ok: boolean }> {
  const res = await fetch(url, {
    headers: headersFor(userAgent),
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_MS),
  });
  const body = await res.text();
  return { finalUrl: res.url || url, body, ok: res.ok };
}

function htmlLooksUsable(html: string, ok: boolean): boolean {
  if (!html || html.length < 800) return false;
  if (isHomeDepotBlockedPage(html)) return false;
  if (ok) return true;
  return collectHomeDepotImageUrlsFromHtml(html).length > 0;
}

async function fetchProductHtml(productUrl: string): Promise<string> {
  let best = "";
  for (const ua of USER_AGENTS) {
    try {
      const page = await readUrl(productUrl, ua);
      if (htmlLooksUsable(page.body, page.ok)) return page.body;
      if (page.body.length > best.length) best = page.body;
    } catch {
      /* try the next client */
    }
  }
  const reader = await fetchViaReader(productUrl);
  if (reader) return reader;
  return best;
}

async function fetchViaReader(productUrl: string): Promise<string> {
  const headers: Record<string, string> = { Accept: "text/plain" };
  const key = process.env.JINA_API_KEY?.trim();
  if (key) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(`https://r.jina.ai/${productUrl}`, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_MS),
  });
  if (!res.ok) return "";
  return res.text();
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: headersFor(DESKTOP_UA),
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_MS),
  });
  if (!res.ok) return "";
  return res.text();
}

async function fetchDuckDuckGoImages(query: string): Promise<string[]> {
  const page = await fetchHtml(
    `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
  );
  if (!page) return [];
  const vqd =
    page.match(/vqd=([0-9-]+)/)?.[1] ||
    page.match(/vqd['"]?\s*[:=]\s*['"]([^'"]+)/)?.[1] ||
    "";
  const fromHtml = collectHomeDepotImageUrlsFromHtml(page);
  if (!vqd) return fromHtml;

  const api = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${encodeURIComponent(vqd)}`;
  const res = await fetch(api, {
    headers: {
      ...headersFor(DESKTOP_UA),
      Referer: "https://duckduckgo.com/",
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_MS),
  });
  if (!res.ok) return fromHtml;
  const json = (await res.json()) as { results?: Array<{ image?: string }> };
  return [
    ...fromHtml,
    ...(json.results || [])
      .map((row) => String(row.image || "").trim())
      .filter((url) => /^https:\/\//i.test(url)),
  ];
}

async function searchCatalogPhotos(opts: {
  brand: string;
  model: string;
  itemId: string;
}): Promise<string[]> {
  const queries = [
    [opts.model, opts.itemId, "site:homedepot.com"].filter(Boolean).join(" "),
    [opts.brand, opts.model, opts.itemId, "homedepot"].filter(Boolean).join(" "),
  ].filter((q) => q.replace(/\s+/g, " ").trim().length >= 8);

  for (const query of queries) {
    try {
      const bing = await fetchHtml(
        `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1`,
      );
      const fromBing = selectHomeDepotSearchPhotos(
        collectHomeDepotImageUrlsFromHtml(bing),
        opts,
      );
      if (fromBing.length) return fromBing;
    } catch {
      /* Bing is a fallback */
    }

    try {
      const found = selectHomeDepotSearchPhotos(
        await fetchDuckDuckGoImages(query),
        opts,
      );
      if (found.length) return found;
    } catch {
      /* DuckDuckGo is a fallback */
    }
  }
  return [];
}

export async function fetchHomeDepotProduct(input: string): Promise<HomeDepotProductDraft> {
  try {
    const parsed = parseHomeDepotLink(input);
    if (!parsed) {
      throw new Error("Paste a full Home Depot product link, or the item number.");
    }

    const canonical = parsed.canonicalUrl;
    const itemId = parsed.itemId;
    const fromSlug = identityFromHomeDepotLink(parsed);

    const html = await fetchProductHtml(canonical);
    const product = parseHomeDepotProductPage(html, { itemId, url: canonical });
    product.title = product.title || fromSlug.title;
    product.brand = product.brand || fromSlug.brand;
    product.model = product.model || fromSlug.model;

    if (!product.imageUrls.length) {
      product.imageUrls = await searchCatalogPhotos({
        brand: product.brand,
        model: product.model,
        itemId,
      });
    }

    if (!product.title && product.imageUrls.length === 0) {
      throw new Error(
        "Home Depot did not return the listing. Copy the full product URL and try again.",
      );
    }
    if (product.imageUrls.length === 0) {
      throw new Error(
        "Found the Home Depot title, but no photos. Try another link or drop photos instead.",
      );
    }
    return product;
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error("Home Depot took too long. Try the full product URL again.");
    }
    throw error;
  }
}
