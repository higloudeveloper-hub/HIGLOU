import {
  identityFromHomeDepotLink,
  parseHomeDepotLink,
} from "@/lib/homedepot/item-id";
import {
  collectHomeDepotImageUrlsFromHtml,
  homeDepotMediaStem,
  isHomeDepotBlockedPage,
  parseHomeDepotProductPage,
  selectHomeDepotSearchPhotos,
  uniqueHomeDepotImages,
  type HomeDepotProductDraft,
} from "@/lib/homedepot/parse-product";

const FETCH_MS = 20_000;

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";
const GOOGLEBOT_UA =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

// Desktop Chrome is Akamai 403. Prefer clients that still get the gallery JSON.
const USER_AGENTS = [IPHONE_UA, ANDROID_UA, GOOGLEBOT_UA, DESKTOP_UA];

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

function galleryCount(html: string): number {
  return uniqueHomeDepotImages(collectHomeDepotImageUrlsFromHtml(html)).length;
}

function htmlLooksUsable(html: string): boolean {
  if (!html || html.length < 800) return false;
  if (isHomeDepotBlockedPage(html)) return false;
  return galleryCount(html) >= 3 || html.length > 80_000;
}

async function fetchProductHtml(productUrl: string): Promise<string> {
  let best = "";
  let bestScore = 0;
  for (const ua of USER_AGENTS) {
    try {
      const page = await readUrl(productUrl, ua);
      const images = galleryCount(page.body);
      const score = page.body.length + images * 50_000;
      if (score > bestScore) {
        best = page.body;
        bestScore = score;
      }
      if (htmlLooksUsable(page.body) && images >= 6) return page.body;
    } catch {
      /* try the next client */
    }
  }
  const reader = await fetchViaReader(productUrl);
  if (reader && galleryCount(reader) > galleryCount(best)) return reader;
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
  stem?: string;
}): Promise<string[]> {
  const queries = [
    [opts.model, opts.itemId, "site:homedepot.com"].filter(Boolean).join(" "),
    [opts.itemId, "homedepot"].filter(Boolean).join(" "),
    [opts.brand, opts.model, opts.itemId, "homedepot"].filter(Boolean).join(" "),
  ].filter((q, index, all) => {
    const compact = q.replace(/\s+/g, " ").trim();
    return compact.length >= 8 && all.indexOf(q) === index;
  });

  const pooled: string[] = [];
  for (const query of queries) {
    for (const first of [1, 21, 41]) {
      try {
        const bing = await fetchHtml(
          `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=${first}`,
        );
        pooled.push(...collectHomeDepotImageUrlsFromHtml(bing));
      } catch {
        /* Bing is a fallback */
      }
    }

    try {
      pooled.push(...(await fetchDuckDuckGoImages(query)));
    } catch {
      /* DuckDuckGo is a fallback */
    }

    const soFar = selectHomeDepotSearchPhotos(pooled, opts);
    if (soFar.length >= 8) return soFar;
  }
  return selectHomeDepotSearchPhotos(pooled, opts);
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

    const owned = {
      brand: product.brand,
      model: product.model,
      itemId,
      stem: homeDepotMediaStem(product.imageUrls[0] || ""),
    };
    product.imageUrls = selectHomeDepotSearchPhotos(product.imageUrls, owned);

    if (product.imageUrls.length < 3) {
      const extra = await searchCatalogPhotos(owned);
      product.imageUrls = uniqueHomeDepotImages([
        ...product.imageUrls,
        ...extra,
      ]);
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
