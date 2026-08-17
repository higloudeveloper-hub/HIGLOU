import { parseHomeDepotLink } from "@/lib/homedepot/item-id";
import {
  fetchHomeDepotMobileGallery,
  homeDepotSessionCookie,
  IPHONE_SAFARI_UA,
} from "@/lib/homedepot/mobile-gallery";
import {
  collectHomeDepotImageUrlsFromHtml,
  dedupeHomeDepotImages,
  isHomeDepotBlockedPage,
} from "@/lib/homedepot/parse-product";

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";

function headersFor(userAgent: string, cookie?: string): Record<string, string> {
  return {
    "User-Agent": userAgent,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": userAgent.includes("iPhone") ? '"iOS"' : '"Android"',
    ...(cookie ? { Cookie: cookie } : {}),
  };
}

function galleryCount(html: string): number {
  return dedupeHomeDepotImages(collectHomeDepotImageUrlsFromHtml(html)).length;
}

function scoreHtml(html: string): number {
  if (!html || isHomeDepotBlockedPage(html)) return 0;
  return html.length + galleryCount(html) * 50_000;
}

async function readPage(url: string, userAgent: string, cookie?: string): Promise<string> {
  const res = await fetch(url, {
    headers: headersFor(userAgent, cookie),
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

  const fromIphoneApi = await fetchHomeDepotMobileGallery(parsed.itemId).catch(
    () => "",
  );
  if (galleryCount(fromIphoneApi) >= 6) return fromIphoneApi;

  const cookie = await homeDepotSessionCookie().catch(() => "");
  const pages = await Promise.all(
    [IPHONE_SAFARI_UA, ANDROID_UA].map(async (ua) => {
      try {
        return await readPage(parsed.canonicalUrl, ua, cookie);
      } catch {
        return "";
      }
    }),
  );
  let best = fromIphoneApi;
  let bestScore = scoreHtml(fromIphoneApi);
  for (const body of pages) {
    const score = scoreHtml(body);
    if (score > bestScore) {
      best = body;
      bestScore = score;
    }
  }
  if (fromIphoneApi && galleryCount(fromIphoneApi) > galleryCount(best)) {
    return `${fromIphoneApi}\n${best}`;
  }
  return bestScore > 0 ? best : "";
}
