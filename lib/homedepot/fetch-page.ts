import { parseHomeDepotLink } from "@/lib/homedepot/item-id";
import {
  collectHomeDepotImageUrlsFromHtml,
  dedupeHomeDepotImages,
  isHomeDepotBlockedPage,
} from "@/lib/homedepot/parse-product";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";

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
  return dedupeHomeDepotImages(collectHomeDepotImageUrlsFromHtml(html)).length;
}

function scoreHtml(html: string): number {
  if (!html || isHomeDepotBlockedPage(html)) return 0;
  return html.length + galleryCount(html) * 50_000;
}

async function readPage(url: string, userAgent: string): Promise<string> {
  const res = await fetch(url, {
    headers: headersFor(userAgent),
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(18_000),
  });
  return res.text();
}

/** Fetch a Home Depot product page. Safe for Edge (no Node APIs). */
export async function fetchHomeDepotPageHtml(input: string): Promise<string> {
  const parsed = parseHomeDepotLink(input);
  if (!parsed) return "";
  const pages = await Promise.all(
    [IPHONE_UA, ANDROID_UA].map(async (ua) => {
      try {
        return await readPage(parsed.canonicalUrl, ua);
      } catch {
        return "";
      }
    }),
  );
  let best = "";
  let bestScore = 0;
  for (const body of pages) {
    const score = scoreHtml(body);
    if (score > bestScore) {
      best = body;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : "";
}
