/** Same product JSON the Home Depot iPhone app/mobile site uses. */

export const IPHONE_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

import { HOME_DEPOT_PRODUCT_GALLERY_QUERY } from "@/lib/homedepot/gallery-request";

export { HOME_DEPOT_PRODUCT_GALLERY_QUERY };

export const HOME_DEPOT_SEARCH_GALLERY_QUERY = `query searchModel($keyword: String, $channel: Channel = MOBILE) {
  searchModel(keyword: $keyword, channel: $channel, storefilter: ALL) {
    products(startIndex: 0, pageSize: 6) {
      itemId
      identifiers { brandName modelNumber productLabel }
      media { images { url type sizes } }
    }
  }
}`;

function iphoneHeaders(
  referer: string,
  experience: string,
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    "User-Agent": IPHONE_SAFARI_UA,
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Content-Type": "application/json",
    Origin: "https://www.homedepot.com",
    Referer: referer,
    "x-experience-name": experience,
    "x-hd-dc": "origin",
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": '"iOS"',
    ...extra,
  };
}

let sessionCookieJob: Promise<string> | null = null;

/** Homepage cookies — the /p/ page is often 403 without a session. */
export function homeDepotSessionCookie(): Promise<string> {
  if (!sessionCookieJob) {
    sessionCookieJob = (async () => {
      const res = await fetch("https://www.homedepot.com/", {
        headers: {
          "User-Agent": IPHONE_SAFARI_UA,
          Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      const cookies =
        typeof res.headers.getSetCookie === "function"
          ? res.headers.getSetCookie()
          : [];
      return cookies
        .map((row) => String(row || "").split(";")[0].trim())
        .filter(Boolean)
        .join("; ");
    })().catch(() => "");
  }
  return sessionCookieJob;
}

function galleryHits(body: string): number {
  return (String(body || "").match(/productImages/g) || []).length;
}

async function postJson(
  url: string,
  payload: unknown,
  experience: string,
  referer: string,
  cookie: string,
): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: iphoneHeaders(
      referer,
      experience,
      cookie ? { Cookie: cookie } : undefined,
    ),
    body: JSON.stringify(payload),
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(16_000),
  });
  return res.text();
}

/** iPhone-style GraphQL gallery. Safe for Edge (no Node APIs). */
export async function fetchHomeDepotMobileGallery(itemId: string): Promise<string> {
  const id = String(itemId || "").trim();
  if (!/^\d{8,12}$/.test(id)) return "";
  const referer = `https://www.homedepot.com/p/${id}`;
  const productPayload = {
    operationName: "productClientOnlyProduct",
    variables: { itemId: id, storeId: "121", zipCode: "30339" },
    query: HOME_DEPOT_PRODUCT_GALLERY_QUERY,
  };
  const searchPayload = {
    operationName: "searchModel",
    variables: { keyword: id, channel: "MOBILE", storefilter: "ALL" },
    query: HOME_DEPOT_SEARCH_GALLERY_QUERY,
  };

  const cookie = await homeDepotSessionCookie();
  const attempts = [
    postJson(
      "https://apionline.homedepot.com/federation-gateway/graphql?opname=productClientOnlyProduct",
      productPayload,
      "general-merchandise",
      referer,
      cookie,
    ),
    postJson(
      "https://www.homedepot.com/federation-gateway/graphql?opname=productClientOnlyProduct",
      productPayload,
      "general-merchandise",
      referer,
      cookie,
    ),
    postJson(
      "https://apionline.homedepot.com/federation-gateway/graphql?opname=searchModel",
      searchPayload,
      "general-merchandise",
      referer,
      cookie,
    ),
    postJson(
      "https://apionline.homedepot.com/federation-gateway/graphql?opname=productClientOnlyProduct",
      productPayload,
      "mobile-web",
      referer,
      cookie,
    ),
  ].map((job) => job.catch(() => ""));

  const bodies = await Promise.all(attempts);
  let best = "";
  let bestHits = 0;
  for (const body of bodies) {
    const hits = galleryHits(body);
    if (hits > bestHits) {
      best = body;
      bestHits = hits;
    }
  }
  return bestHits >= 2 ? best : "";
}
