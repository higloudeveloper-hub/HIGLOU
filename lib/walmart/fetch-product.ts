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

const FETCH_MS = 28_000;

function headersFor(userAgent: string): Record<string, string> {
  return {
    "User-Agent": userAgent,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
  };
}

function scoreHtml(html: string, itemId: string): number {
  if (!html || isWalmartBlockedPage(html)) return 0;
  const id = String(itemId || "").trim();
  let score = 0;
  if (/__NEXT_DATA__/i.test(html)) score += 50_000;
  if (id && new RegExp(`"usItemId"\\s*:\\s*"${id}"`).test(html)) score += 200_000;
  if (id && new RegExp(`"itemId"\\s*:\\s*"${id}"`).test(html)) score += 120_000;
  if (id && html.includes(`/ip/${id}`)) score += 20_000;
  const gallery = collectWalmartImageUrlsFromHtml(html, id).length;
  score += Math.min(gallery, 24) * 3_000;
  score += Math.min(html.length, 800_000) / 80;
  return score;
}

function pickRicherHtml(current: string, next: string, itemId: string): string {
  return scoreHtml(next, itemId) > scoreHtml(current, itemId) ? next : current;
}

function galleryCount(html: string, itemId: string): number {
  if (!html || isWalmartBlockedPage(html)) return 0;
  return collectWalmartImageUrlsFromHtml(html, itemId).length;
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

/**
 * Walmart PerimeterX blocks datacenter IPs (307 → /blocked).
 * Jina markdown often returns "Similar items" junk; HTML retains __NEXT_DATA__.
 */
async function fetchViaReader(productUrl: string, itemId: string): Promise<string> {
  const headers: Record<string, string> = {
    Accept: "text/html,text/plain;q=0.9,*/*;q=0.8",
    "X-Return-Format": "html",
    "X-Timeout": "25",
  };
  const key = process.env.JINA_API_KEY?.trim();
  if (key) headers.Authorization = `Bearer ${key}`;
  try {
    const res = await fetch(`https://r.jina.ai/${productUrl}`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_MS),
    });
    if (!res.ok) return "";
    const text = await res.text();
    if (galleryCount(text, itemId) >= 1 && !isWalmartBlockedPage(text)) return text;
    return "";
  } catch {
    return "";
  }
}

async function readUrl(url: string, userAgent: string): Promise<string> {
  const res = await fetch(url, {
    headers: headersFor(userAgent),
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_MS),
  });
  const text = await res.text();
  if (/\/blocked\?/i.test(String(res.url || "")) || isWalmartBlockedPage(text)) {
    return "";
  }
  return text;
}

async function fetchViaImpit(url: string, itemId: string): Promise<string> {
  try {
    const { Impit } = await import("impit");
    let best = "";
    for (const browser of ["firefox", "chrome"] as const) {
      try {
        const impit = new Impit({ browser, timeout: FETCH_MS });
        const res = await impit.fetch(url, {
          headers: headersFor(DESKTOP_UA),
          redirect: "follow",
        });
        if (!res.ok) continue;
        const text = await res.text();
        if (isWalmartBlockedPage(text)) continue;
        best = pickRicherHtml(best, text, itemId);
        if (galleryCount(best, itemId) >= 2 && scoreHtml(best, itemId) >= 200_000) {
          break;
        }
      } catch {
        /* try next browser profile */
      }
    }
    return best;
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
    const { itemId, canonicalUrl } = parsed;

    let html = String(opts?.pageHtml || "").trim();

    // Prefer Jina HTML early — origin is usually PerimeterX-blocked on Vercel.
    if (galleryCount(html, itemId) < 2 || scoreHtml(html, itemId) < 200_000) {
      html = pickRicherHtml(html, await fetchViaReader(canonicalUrl, itemId), itemId);
    }

    if (galleryCount(html, itemId) < 2 || scoreHtml(html, itemId) < 200_000) {
      try {
        html = pickRicherHtml(
          html,
          await fetchWalmartPageHtml(canonicalUrl),
          itemId,
        );
      } catch {
        /* keep */
      }
    }

    if (galleryCount(html, itemId) < 2 && opts?.pageOrigin) {
      html = pickRicherHtml(
        html,
        await fetchViaEdgePage(opts.pageOrigin, canonicalUrl),
        itemId,
      );
    }

    if (galleryCount(html, itemId) < 2 || scoreHtml(html, itemId) < 200_000) {
      try {
        html = pickRicherHtml(
          html,
          await readUrl(canonicalUrl, DESKTOP_UA),
          itemId,
        );
      } catch {
        /* keep */
      }
    }

    if (galleryCount(html, itemId) < 2 || scoreHtml(html, itemId) < 200_000) {
      html = pickRicherHtml(
        html,
        await fetchViaImpit(canonicalUrl, itemId),
        itemId,
      );
    }

    // One more Jina pass if earlier paths polluted the winner.
    if (scoreHtml(html, itemId) < 200_000) {
      html = pickRicherHtml(html, await fetchViaReader(canonicalUrl, itemId), itemId);
    }

    if (!html || isWalmartBlockedPage(html)) {
      throw new Error(
        "Walmart blocked the request. Paste the full walmart.com/ip/… link and try again.",
      );
    }

    const product = parseWalmartProductPage(html, {
      itemId,
      url: canonicalUrl,
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
