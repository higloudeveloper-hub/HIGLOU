/**
 * Amazon deep-link helpers (optional CTAs elsewhere).
 * Facebook smart links (/go) redirect to the official HTTPS product page —
 * never auto-open the Amazon app from the share hop.
 */

import { extractAsinFromAmazonUrl } from "@/lib/monetization/affiliate/tagged-url";

export function isAmazonAppCrawler(userAgent: string | null | undefined): boolean {
  const ua = String(userAgent || "");
  return /facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|WhatsApp|Discordbot|Googlebot|bingbot|Applebot|preview/i.test(
    ua,
  );
}

export function isMobileClient(userAgent: string | null | undefined): boolean {
  const ua = String(userAgent || "");
  if (!ua) return false;
  if (isAmazonAppCrawler(ua)) return false;
  return /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    ua,
  );
}

export function isAndroidClient(userAgent: string | null | undefined): boolean {
  return /Android/i.test(String(userAgent || ""));
}

export function isIosClient(userAgent: string | null | undefined): boolean {
  return /iPhone|iPad|iPod/i.test(String(userAgent || ""));
}

/** Keep Associate tag= and other query params on the https product URL. */
export function amazonHttpsProductUrl(destinationUrl: string): string | null {
  const raw = String(destinationUrl || "").trim();
  if (!/^https?:\/\//i.test(raw)) return null;
  try {
    const u = new URL(raw);
    if (!/amazon\.|amzn\./i.test(u.hostname)) return null;
    const asin = extractAsinFromAmazonUrl(raw);
    if (!asin) return raw;
    const host = u.hostname.toLowerCase().includes("amazon.")
      ? u.hostname
      : "www.amazon.com";
    const out = new URL(`https://${host}/dp/${asin}`);
    u.searchParams.forEach((v, k) => out.searchParams.set(k, v));
    return out.toString();
  } catch {
    return null;
  }
}

export type AmazonAppDeepLinks = {
  https: string;
  asin: string;
  iosScheme: string;
  iosWebScheme: string;
  androidIntent: string;
};

/**
 * Build Amazon app schemes for an explicit user tap (e.g. a “Open app” button).
 * Do not use these for the Facebook → /go hop — that must stay HTTPS product page.
 */
export function buildAmazonAppDeepLinks(
  destinationUrl: string,
): AmazonAppDeepLinks | null {
  const https = amazonHttpsProductUrl(destinationUrl);
  if (!https) return null;
  const asin = extractAsinFromAmazonUrl(https);
  if (!asin) return null;

  let host = "www.amazon.com";
  let tagQuery = "";
  try {
    const u = new URL(https);
    host = u.hostname || host;
    tagQuery = u.search ? u.search : "";
  } catch {
    /* keep defaults */
  }

  const pathAndQuery = `/dp/${asin}${tagQuery}`;
  const iosScheme = `com.amazon.mobile.shopping://www.amazon.com${pathAndQuery}`;
  const iosWebScheme = `com.amazon.mobile.shopping.web://${host}${pathAndQuery}`;
  const androidIntent =
    `intent://${host}${pathAndQuery}` +
    `#Intent;scheme=https;package=com.amazon.mShop.android.shopping;` +
    `S.browser_fallback_url=${encodeURIComponent(https)};end`;

  return { https, asin, iosScheme, iosWebScheme, androidIntent };
}
