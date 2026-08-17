import { parseHomeDepotLink } from "@/lib/homedepot/item-id";
import {
  isHomeDepotBlockedPage,
  parseHomeDepotProductPage,
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
  const res = await fetch(`https://r.jina.ai/${productUrl}`, {
    headers: { Accept: "text/plain" },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_MS),
  });
  if (!res.ok) return "";
  return res.text();
}

export async function fetchHomeDepotProduct(input: string): Promise<HomeDepotProductDraft> {
  try {
    const parsed = parseHomeDepotLink(input);
    if (!parsed) {
      throw new Error("Paste a full Home Depot product link, or the item number.");
    }

    const canonical = parsed.canonicalUrl;
    const itemId = parsed.itemId;

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
