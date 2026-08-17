import { DEFAULT_VALUES } from "@/config/default-values";
import { parseAmazonLink } from "@/lib/amazon/asin";
import { fetchAmazonPageHtml } from "@/lib/amazon/fetch-page";
import {
  collectAmazonImageUrlsFromHtml,
  isCaptchaPage,
  parseAmazonProductPage,
  type AmazonProductDraft,
} from "@/lib/amazon/parse-product";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const FETCH_MS = 20_000;

function headersFor(userAgent: string): Record<string, string> {
  return {
    "User-Agent": userAgent,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
  };
}

function galleryCount(html: string): number {
  if (!html || isCaptchaPage(html)) return 0;
  return collectAmazonImageUrlsFromHtml(html).length;
}

async function fetchViaEdgePage(origin: string, productUrl: string): Promise<string> {
  try {
    const pageUrl = new URL("/api/amazon/page", origin);
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

async function readUrl(url: string, userAgent: string): Promise<string> {
  const res = await fetch(url, {
    headers: headersFor(userAgent),
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_MS),
  });
  return res.text();
}

async function resolveShortLink(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: headersFor(IPHONE_UA),
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_MS),
  });
  return res.url || url;
}

function pickRicherHtml(current: string, next: string): string {
  if (galleryCount(next) > galleryCount(current)) return next;
  if (galleryCount(next) === galleryCount(current) && next.length > current.length) {
    return next;
  }
  return current;
}

async function fetchHtml(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: headersFor(DESKTOP_UA),
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_MS),
    });
    if (!res.ok) return "";
    return res.text();
  } catch {
    return "";
  }
}

async function searchAmazonPhotos(asin: string): Promise<string[]> {
  const queries = [
    `"${asin}" media-amazon images/I`,
    `${asin} site:amazon.com`,
    `"${asin}" site:amazon.com`,
  ];
  const pooled: string[] = [];
  for (const query of queries) {
    const [bing, ddg] = await Promise.all([
      fetchHtml(
        `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1&count=50`,
      ),
      fetchHtml(
        `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
      ),
    ]);
    pooled.push(...collectAmazonImageUrlsFromHtml(bing));
    pooled.push(...collectAmazonImageUrlsFromHtml(ddg));
    const unique = collectAmazonImageUrlsFromHtml(pooled.join("\n"));
    if (unique.length >= DEFAULT_VALUES.maxImages) return unique;
  }
  return collectAmazonImageUrlsFromHtml(pooled.join("\n"));
}

export async function fetchAmazonProduct(
  input: string,
  opts?: { pageOrigin?: string },
): Promise<AmazonProductDraft> {
  try {
    const parsed = parseAmazonLink(input);
    if (!parsed) {
      throw new Error("Paste a full Amazon product link, or the 10-character ASIN.");
    }

    let canonical = parsed.canonicalUrl;
    let asin = parsed.asin;

    if (parsed.short || !asin) {
      canonical = await resolveShortLink(parsed.canonicalUrl);
      const again = parseAmazonLink(canonical);
      if (!again?.asin) {
        throw new Error("Could not read that Amazon short link. Open the product and copy the full URL.");
      }
      asin = again.asin;
      canonical = again.canonicalUrl;
    }

    let html = "";
    try {
      html = await fetchAmazonPageHtml(canonical);
    } catch {
      html = "";
    }

    if (galleryCount(html) < 3 && opts?.pageOrigin) {
      html = pickRicherHtml(html, await fetchViaEdgePage(opts.pageOrigin, canonical));
    }

    if (galleryCount(html) < 3) {
      try {
        html = pickRicherHtml(html, await readUrl(canonical, DESKTOP_UA));
      } catch {
        /* keep what we have */
      }
    }

    if (galleryCount(html) < 3 || isCaptchaPage(html)) {
      html = pickRicherHtml(html, await fetchViaReader(canonical));
    }

    const product = parseAmazonProductPage(html, { asin, url: canonical });
    if (product.imageUrls.length < 3) {
      const searched = await searchAmazonPhotos(asin);
      const seen = new Set(product.imageUrls.map((url) => url));
      for (const url of searched) {
        if (seen.has(url)) continue;
        seen.add(url);
        product.imageUrls.push(url);
        if (product.imageUrls.length >= DEFAULT_VALUES.maxImages) break;
      }
    }

    if (!product.title && product.imageUrls.length === 0) {
      throw new Error(
        "Amazon did not return the listing. Copy the full product URL and try again.",
      );
    }
    if (product.imageUrls.length === 0) {
      throw new Error(
        "Found the Amazon title, but no photos. Try another link or drop photos instead.",
      );
    }
    return product;
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error("Amazon took too long. Try the full product URL again.");
    }
    throw error;
  }
}
