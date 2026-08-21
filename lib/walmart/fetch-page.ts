import { parseWalmartLink } from "@/lib/walmart/item-id";
import {
  collectWalmartImageUrlsFromHtml,
  isWalmartBlockedPage,
} from "@/lib/walmart/parse-product";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";

function headersFor(userAgent: string): Record<string, string> {
  return {
    "User-Agent": userAgent,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "sec-ch-ua-mobile": "?1",
  };
}

function galleryCount(html: string): number {
  if (!html || isWalmartBlockedPage(html)) return 0;
  return collectWalmartImageUrlsFromHtml(html).length;
}

function scoreHtml(html: string): number {
  if (!html || isWalmartBlockedPage(html)) return 0;
  const next = /__NEXT_DATA__/i.test(html) ? 80_000 : 0;
  return html.length + galleryCount(html) * 40_000 + next;
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

/** Fetch a Walmart product page. Safe for Edge (no Node APIs). */
export async function fetchWalmartPageHtml(input: string): Promise<string> {
  const parsed = parseWalmartLink(input);
  if (!parsed) return "";
  const urls = [parsed.canonicalUrl, `https://www.walmart.com/ip/${parsed.itemId}`];
  const pages = await Promise.all(
    urls.flatMap((url) =>
      [IPHONE_UA, ANDROID_UA].map(async (ua) => {
        try {
          return await readPage(url, ua);
        } catch {
          return "";
        }
      }),
    ),
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
