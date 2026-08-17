import {
  identityFromHomeDepotLink,
  parseHomeDepotLink,
} from "@/lib/homedepot/item-id";
import {
  isHomeDepotBlockedPage,
  parseHomeDepotProductPage,
  uniqueHomeDepotImages,
  type HomeDepotProductDraft,
} from "@/lib/homedepot/parse-product";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
};

const FETCH_MS = 20_000;

async function readUrl(url: string): Promise<{ finalUrl: string; body: string; ok: boolean }> {
  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_MS),
  });
  const body = await res.text();
  return { finalUrl: res.url || url, body, ok: res.ok };
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

async function fetchDuckDuckGoImages(query: string): Promise<string[]> {
  const page = await fetch(
    `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
    {
      headers: BROWSER_HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_MS),
    },
  );
  if (!page.ok) return [];
  const html = await page.text();
  const vqd =
    html.match(/vqd=([0-9-]+)/)?.[1] ||
    html.match(/vqd['"]?\s*[:=]\s*['"]([^'"]+)/)?.[1] ||
    "";
  if (!vqd) return [];

  const api = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${encodeURIComponent(vqd)}`;
  const res = await fetch(api, {
    headers: {
      ...BROWSER_HEADERS,
      Referer: "https://duckduckgo.com/",
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_MS),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { results?: Array<{ image?: string }> };
  return (json.results || [])
    .map((row) => String(row.image || "").trim())
    .filter((url) => /^https:\/\//i.test(url));
}

function preferCatalogPhotos(
  urls: string[],
  model: string,
  itemId: string,
): string[] {
  const all = uniqueHomeDepotImages(urls);
  const needle = (model || itemId).toLowerCase();
  const matched = needle
    ? all.filter((url) => url.toLowerCase().includes(needle))
    : [];
  return matched.length ? matched : all;
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

    let html = "";
    try {
      const page = await readUrl(canonical);
      html = page.body;
      if (!page.ok || isHomeDepotBlockedPage(html) || html.length < 800) {
        const reader = await fetchViaReader(canonical);
        if (reader) html = reader;
      }
    } catch {
      html = await fetchViaReader(canonical);
    }

    const product = parseHomeDepotProductPage(html, { itemId, url: canonical });
    product.title = product.title || fromSlug.title;
    product.brand = product.brand || fromSlug.brand;
    product.model = product.model || fromSlug.model;

    if (!product.imageUrls.length) {
      const query = [product.model, product.brand, itemId, "homedepot"]
        .filter(Boolean)
        .join(" ");
      try {
        const found = await fetchDuckDuckGoImages(query);
        product.imageUrls = preferCatalogPhotos(
          found,
          product.model,
          itemId,
        );
      } catch {
        /* search is a fallback */
      }
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
