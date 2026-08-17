import { DEFAULT_VALUES } from "@/config/default-values";
import { HOME_DEPOT_OFFICIAL_MAX_IMAGES } from "@/lib/homedepot/gallery-request";
import {
  identityFromHomeDepotLink,
  parseHomeDepotLink,
} from "@/lib/homedepot/item-id";
import { fetchHomeDepotMobileGallery, homeDepotSessionCookie, IPHONE_SAFARI_UA } from "@/lib/homedepot/mobile-gallery";
import { fetchHomeDepotOfficialGallery } from "@/lib/homedepot/official-gallery";
import {
  collectHomeDepotImageUrlsFromHtml,
  dedupeHomeDepotImages,
  homeDepotMediaStem,
  homeDepotStemVariants,
  isGenericHomeDepotModel,
  isHomeDepotBlockedPage,
  parseHomeDepotProductPage,
  selectHomeDepotSearchPhotos,
  type HomeDepotProductDraft,
} from "@/lib/homedepot/parse-product";

const FETCH_MS = 20_000;

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";
const GOOGLEBOT_UA =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const BINGBOT_UA =
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)";
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

// Desktop Chrome is Akamai 403. Prefer clients that still get the gallery JSON.
const USER_AGENTS = [IPHONE_SAFARI_UA, ANDROID_UA, GOOGLEBOT_UA, BINGBOT_UA, DESKTOP_UA];

function headersFor(userAgent: string, cookie?: string): Record<string, string> {
  const mobile = /iPhone|Android/i.test(userAgent);
  return {
    "User-Agent": userAgent,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    ...(cookie ? { Cookie: cookie } : {}),
    ...(mobile
      ? {
          "sec-ch-ua-mobile": "?1",
          "sec-ch-ua-platform": userAgent.includes("iPhone") ? '"iOS"' : '"Android"',
        }
      : {}),
  };
}

async function readUrl(
  url: string,
  userAgent: string,
  cookie?: string,
): Promise<{ finalUrl: string; body: string; ok: boolean }> {
  const res = await fetch(url, {
    headers: headersFor(userAgent, cookie),
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_MS),
  });
  const body = await res.text();
  return { finalUrl: res.url || url, body, ok: res.ok };
}

function galleryCount(html: string): number {
  if (!html || isHomeDepotBlockedPage(html)) return 0;
  return dedupeHomeDepotImages(collectHomeDepotImageUrlsFromHtml(html)).length;
}

function htmlLooksUsable(html: string): boolean {
  if (!html || html.length < 800) return false;
  if (isHomeDepotBlockedPage(html)) return false;
  return galleryCount(html) >= 3 || html.length > 80_000;
}

async function fetchViaEdgePage(origin: string, productUrl: string): Promise<string> {
  try {
    const pageUrl = new URL("/api/homedepot/page", origin);
    pageUrl.searchParams.set("url", productUrl);
    const res = await fetch(pageUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_MS),
    });
    if (!res.ok) return "";
    return res.text();
  } catch {
    return "";
  }
}

async function fetchProductHtml(productUrl: string): Promise<string> {
  const cookie = await homeDepotSessionCookie().catch(() => "");
  const pages = await Promise.all(
    USER_AGENTS.map(async (ua) => {
      try {
        return (await readUrl(productUrl, ua, cookie)).body;
      } catch {
        return "";
      }
    }),
  );
  let best = "";
  let bestScore = 0;
  for (const body of pages) {
    const images = galleryCount(body);
    const score = body.length + images * 50_000;
    if (score > bestScore) {
      best = body;
      bestScore = score;
    }
  }
  if (htmlLooksUsable(best) && galleryCount(best) >= 6) return best;
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

async function fetchBingAsyncImages(query: string): Promise<string[]> {
  try {
    const page = await fetchHtml(
      `https://www.bing.com/images/async?q=${encodeURIComponent(query)}&first=0&count=35`,
    );
    return collectHomeDepotImageUrlsFromHtml(page);
  } catch {
    return [];
  }
}

async function runImageSearch(
  queries: string[],
  opts: { brand: string; model: string; itemId: string; stem?: string },
): Promise<string[]> {
  const pooled: string[] = [];
  for (const query of queries) {
    const [bingPage, bingAsync, ddg] = await Promise.all([
      fetchHtml(
        `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1&count=50`,
      ).catch(() => ""),
      fetchBingAsyncImages(query),
      fetchDuckDuckGoImages(query).catch(() => [] as string[]),
    ]);
    pooled.push(...collectHomeDepotImageUrlsFromHtml(bingPage));
    pooled.push(...bingAsync);
    pooled.push(...ddg);

    let soFar = selectHomeDepotSearchPhotos(pooled, opts);
    if (soFar.length >= DEFAULT_VALUES.maxImages) return soFar;
    if (soFar.length < 4) {
      const extraPage = await fetchHtml(
        `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=21&count=50`,
      ).catch(() => "");
      pooled.push(...collectHomeDepotImageUrlsFromHtml(extraPage));
      soFar = selectHomeDepotSearchPhotos(pooled, opts);
    }
    if (soFar.length >= 6) return soFar;
  }
  return selectHomeDepotSearchPhotos(pooled, opts);
}

function homeDepotModelSearchTokens(model: string): string[] {
  const m = String(model || "").trim();
  if (!m || isGenericHomeDepotModel(m)) return [];
  const tokens = [m];
  const stripped = m.replace(/-[A-Z0-9]{1,3}$/i, "");
  if (
    stripped &&
    stripped !== m &&
    /\d/.test(stripped) &&
    !isGenericHomeDepotModel(stripped)
  ) {
    tokens.push(stripped);
  }
  return tokens;
}

function homeDepotTitleSearchToken(title: string): string {
  return String(title || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 8)
    .join(" ");
}

export function homeDepotSearchQueries(opts: {
  brand: string;
  model: string;
  itemId: string;
  stem?: string;
  title?: string;
}): string[] {
  const models = homeDepotModelSearchTokens(opts.model);
  const stems = homeDepotStemVariants(opts.stem || "");
  const title = homeDepotTitleSearchToken(opts.title || "");
  const extraTypes = ["64", "e1", "e4", "4f", "c3", "40", "1d"] as const;
  const modelQueries = models.flatMap((model) => [
    [opts.brand, model, "homedepot"].filter(Boolean).join(" "),
    [opts.brand, model, "thdstatic"].filter(Boolean).join(" "),
    `"${model}-64" OR "${model}-e1" OR "${model}-e4" OR "${model}-4f" OR "${model}-c3" OR "${model}-1d" OR "${model}-40" thdstatic`,
    [model, "thdstatic"].filter(Boolean).join(" "),
    [model, "site:homedepot.com"].filter(Boolean).join(" "),
  ]);
  const typeQueries = models.slice(0, 1).flatMap((model) =>
    extraTypes.map((type) => `"${model}-${type}" thdstatic`),
  );
  const stemQueries = stems.flatMap((stem) => [
    `${stem} thdstatic`,
    `"${stem}-e1" OR "${stem}-e2" OR "${stem}-e4" OR "${stem}-1d" OR "${stem}-40" OR "${stem}-a0" thdstatic`,
  ]);
  return [
    ...modelQueries,
    ...typeQueries,
    ...stemQueries,
    title ? `${title} thdstatic` : "",
    title ? `${title} homedepot` : "",
    [opts.itemId, "homedepot"].filter(Boolean).join(" "),
    [opts.itemId, "thdstatic"].filter(Boolean).join(" "),
  ].filter((q, index, all) => {
    const compact = q.replace(/\s+/g, " ").trim();
    return (
      compact.length >= 8 &&
      all.indexOf(q) === index &&
      !/^site:homedepot\.com$/i.test(compact) &&
      compact !== "homedepot"
    );
  });
}

async function searchCatalogPhotos(opts: {
  brand: string;
  model: string;
  itemId: string;
  stem?: string;
  title?: string;
}): Promise<string[]> {
  return runImageSearch(homeDepotSearchQueries(opts), opts);
}

export async function searchHomeDepotCatalogPhotos(opts: {
  brand: string;
  model: string;
  itemId: string;
  stem?: string;
  title?: string;
}): Promise<string[]> {
  return searchCatalogPhotos(opts);
}

export async function fetchHomeDepotProduct(
  input: string,
  opts?: { pageHtml?: string; pageOrigin?: string },
): Promise<HomeDepotProductDraft> {
  try {
    const parsed = parseHomeDepotLink(input);
    if (!parsed) {
      throw new Error("Paste a full Home Depot product link, or the item number.");
    }

    const canonical = parsed.canonicalUrl;
    const itemId = parsed.itemId;
    const fromSlug = identityFromHomeDepotLink(parsed);

    let html = opts?.pageHtml?.trim() || "";
    let officialCount = galleryCount(html);
    if (officialCount < 6) {
      const official = await fetchHomeDepotOfficialGallery(itemId).catch(() => "");
      const officialHits = galleryCount(official);
      if (officialHits > officialCount) {
        html = html ? `${official}\n${html}` : official;
        officialCount = officialHits;
      }
    }
    if (galleryCount(html) < 6) {
      const fromIphoneApi = await fetchHomeDepotMobileGallery(itemId).catch(
        () => "",
      );
      if (galleryCount(fromIphoneApi) > galleryCount(html)) {
        html = html ? `${fromIphoneApi}\n${html}` : fromIphoneApi;
      }
    }
    if (galleryCount(html) < 6 && opts?.pageOrigin) {
      const fromEdge = await fetchViaEdgePage(opts.pageOrigin, canonical);
      if (galleryCount(fromEdge) > galleryCount(html)) html = fromEdge;
    }
    if (galleryCount(html) < 6) {
      const fetched = await fetchProductHtml(canonical);
      if (galleryCount(fetched) > galleryCount(html)) html = fetched;
    }
    const product = parseHomeDepotProductPage(html, {
      itemId,
      url: canonical,
      maxImages:
        officialCount >= 1 ? HOME_DEPOT_OFFICIAL_MAX_IMAGES : DEFAULT_VALUES.maxImages,
    });
    product.title = product.title || fromSlug.title;
    product.brand = product.brand || fromSlug.brand;
    product.model = product.model || fromSlug.model;

    const owned = {
      brand: product.brand,
      model: product.model,
      itemId,
      stem: homeDepotMediaStem(product.imageUrls[0] || ""),
      title: product.title,
    };
    const photoOpts = {
      ...owned,
      maxImages:
        officialCount >= 1 ? HOME_DEPOT_OFFICIAL_MAX_IMAGES : DEFAULT_VALUES.maxImages,
    };
    product.imageUrls = selectHomeDepotSearchPhotos(
      [...product.imageUrls, ...collectHomeDepotImageUrlsFromHtml(html)],
      photoOpts,
    );
    owned.stem = owned.stem || homeDepotMediaStem(product.imageUrls[0] || "");
    const stemBeforeSearch = owned.stem;

    if (officialCount < 1 && product.imageUrls.length < 8) {
      const extra = await searchCatalogPhotos(owned);
      product.imageUrls = selectHomeDepotSearchPhotos(
        [...product.imageUrls, ...extra],
        owned,
      );
    }
    owned.stem = homeDepotMediaStem(product.imageUrls[0] || "") || owned.stem;
    if (
      officialCount < 1 &&
      product.imageUrls.length < 8 &&
      owned.stem &&
      owned.stem.length >= 12 &&
      owned.stem !== stemBeforeSearch
    ) {
      const extra = await searchCatalogPhotos(owned);
      product.imageUrls = selectHomeDepotSearchPhotos(
        [...product.imageUrls, ...extra],
        owned,
      );
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
