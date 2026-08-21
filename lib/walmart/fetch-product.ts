import { parseWalmartLink } from "@/lib/walmart/item-id";
import { fetchWalmartPageHtml } from "@/lib/walmart/fetch-page";
import {
  collectWalmartImageUrlsFromHtml,
  isWalmartBlockedPage,
  parseWalmartProductPage,
  type WalmartProductDraft,
} from "@/lib/walmart/parse-product";

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
  if (!html || isWalmartBlockedPage(html)) return 0;
  return collectWalmartImageUrlsFromHtml(html).length;
}

function pickRicherHtml(current: string, next: string): string {
  const nextGallery = galleryCount(next);
  const currentGallery = galleryCount(current);
  if (nextGallery > currentGallery) return next;
  if (nextGallery === currentGallery && next.length > current.length) return next;
  return current;
}

async function fetchViaEdgePage(origin: string, productUrl: string): Promise<string> {
  try {
    const pageUrl = new URL("/api/walmart/page", origin);
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

async function fetchViaImpit(url: string): Promise<string> {
  try {
    const { Impit } = await import("impit");
    const impit = new Impit({ browser: "chrome", timeout: FETCH_MS });
    const res = await impit.fetch(url, {
      headers: headersFor(DESKTOP_UA),
    });
    if (!res.ok) return "";
    return res.text();
  } catch {
    return "";
  }
}

export async function fetchWalmartProduct(
  input: string,
  opts?: { pageOrigin?: string; pageHtml?: string },
): Promise<WalmartProductDraft> {
  try {
    const parsed = parseWalmartLink(input);
    if (!parsed) {
      throw new Error("Paste a full Walmart product link (walmart.com/ip/…).");
    }

    let html = String(opts?.pageHtml || "").trim();
    if (galleryCount(html) < 2) {
      try {
        html = pickRicherHtml(html, await fetchWalmartPageHtml(parsed.canonicalUrl));
      } catch {
        /* keep what we have */
      }
    }

    if (galleryCount(html) < 2 && opts?.pageOrigin) {
      html = pickRicherHtml(
        html,
        await fetchViaEdgePage(opts.pageOrigin, parsed.canonicalUrl),
      );
    }

    if (galleryCount(html) < 2 || isWalmartBlockedPage(html)) {
      try {
        html = pickRicherHtml(html, await readUrl(parsed.canonicalUrl, DESKTOP_UA));
      } catch {
        /* keep */
      }
    }

    if (galleryCount(html) < 2 || isWalmartBlockedPage(html)) {
      html = pickRicherHtml(html, await fetchViaReader(parsed.canonicalUrl));
    }

    if (galleryCount(html) < 2) {
      html = pickRicherHtml(html, await fetchViaImpit(parsed.canonicalUrl));
    }

    const product = parseWalmartProductPage(html, {
      itemId: parsed.itemId,
      url: parsed.canonicalUrl,
    });
    if (!product.title && product.imageUrls.length === 0) {
      throw new Error(
        "Walmart did not return the listing. Copy the full product URL and try again.",
      );
    }
    if (product.imageUrls.length === 0) {
      throw new Error(
        "Found the Walmart title, but no photos. Try another link or drop photos instead.",
      );
    }
    return product;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      throw new Error("Walmart took too long. Try the full product URL again.");
    }
    throw error;
  }
}
