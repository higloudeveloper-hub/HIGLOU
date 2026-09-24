/**
 * Prefer opening the Amazon shopping app (not mobile Safari/Chrome web)
 * when a shopper taps a Higlou /go smart link from Facebook.
 *
 * Facebook's in-app browser often ignores Universal Links, so we try
 * Amazon custom URL schemes + Android Intents, then fall back to https.
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

/** Keep Associate tag= and other query params on the https fallback. */
export function amazonHttpsProductUrl(destinationUrl: string): string | null {
  const raw = String(destinationUrl || "").trim();
  if (!/^https?:\/\//i.test(raw)) return null;
  try {
    const u = new URL(raw);
    if (!/amazon\.|amzn\./i.test(u.hostname)) return null;
    const asin = extractAsinFromAmazonUrl(raw);
    if (!asin) return raw;
    // Canonical mobile-friendly product URL (app Universal Links claim this path)
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
  /** iOS Amazon Shopping custom scheme */
  iosScheme: string;
  /** Alternate iOS web-in-app scheme */
  iosWebScheme: string;
  /** Android Intent → Amazon Shopping package */
  androidIntent: string;
};

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

/**
 * Tiny bridge page: try Amazon app, then https fallback.
 * Safe for Facebook in-app browsers that block Universal Links.
 */
export function amazonAppBridgeHtml(links: AmazonAppDeepLinks): string {
  const https = JSON.stringify(links.https);
  const ios = JSON.stringify(links.iosScheme);
  const iosWeb = JSON.stringify(links.iosWebScheme);
  const android = JSON.stringify(links.androidIntent);
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>Abriendo Amazon…</title>
<style>
  body{margin:0;min-height:100dvh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#fff7ed;color:#1c1917}
  .card{max-width:20rem;padding:1.5rem;text-align:center}
  h1{font-size:1.1rem;margin:0 0 .5rem}
  p{font-size:.9rem;color:#78716c;margin:0 0 1.25rem;line-height:1.4}
  a{display:inline-flex;align-items:center;justify-content:center;height:2.75rem;padding:0 1.25rem;border-radius:999px;background:#ff9900;color:#111;font-weight:700;text-decoration:none}
</style>
</head>
<body>
<div class="card">
  <h1>Abriendo la app de Amazon</h1>
  <p>Si no se abre sola, tocá el botón.</p>
  <a id="open" href=${https}>Abrir en Amazon</a>
</div>
<script>
(function(){
  var https=${https};
  var ios=${ios};
  var iosWeb=${iosWeb};
  var android=${android};
  var ua=navigator.userAgent||"";
  var isAndroid=/Android/i.test(ua);
  var isIOS=/iPhone|iPad|iPod/i.test(ua);
  var btn=document.getElementById("open");
  if(btn) btn.setAttribute("href", https);
  function tryApp(){
    if(isAndroid){ location.href=android; return; }
    if(isIOS){
      location.href=ios;
      setTimeout(function(){ location.href=iosWeb; }, 250);
      return;
    }
    location.replace(https);
  }
  tryApp();
  setTimeout(function(){ location.replace(https); }, 1400);
})();
</script>
</body>
</html>`;
}
