import { parseAmazonLink } from "@/lib/amazon/asin";
import {
  isCaptchaPage,
  parseAmazonProductPage,
  type AmazonProductDraft,
} from "@/lib/amazon/parse-product";

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

async function resolveShortLink(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_MS),
  });
  return res.url || url;
}

async function fetchViaReader(productUrl: string): Promise<string> {
  const res = await fetch(`https://r.jina.ai/${productUrl}`, {
    headers: { Accept: "text/plain" },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_MS),
  });
  if (!res.ok) return "";
  return res.text();
}

export async function fetchAmazonProduct(input: string): Promise<AmazonProductDraft> {
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
      const page = await readUrl(canonical);
      html = page.body;
      if (!page.ok || isCaptchaPage(html) || html.length < 800) {
        const reader = await fetchViaReader(canonical);
        if (reader) html = reader;
      }
    } catch {
      html = await fetchViaReader(canonical);
    }

    const product = parseAmazonProductPage(html, { asin, url: canonical });
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
