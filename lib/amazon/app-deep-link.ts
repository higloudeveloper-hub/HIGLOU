/**
 * Amazon product landing for Facebook taps.
 *
 * 1) User sees the product first (no auto “leave Facebook” jump).
 * 2) Only when they tap Comprar / Carrito we open the Amazon app
 *    (user gesture → deep link). HTTPS is always the safe fallback.
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

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type AmazonProductLandingInput = {
  links: AmazonAppDeepLinks;
  title?: string | null;
  imageUrl?: string | null;
  priceLabel?: string | null;
};

/**
 * Product-first landing: show photo + title, then Comprar / Carrito
 * opens the Amazon app only on tap (no auto leave-Facebook alert).
 */
export function amazonProductLandingHtml(input: AmazonProductLandingInput): string {
  const { links } = input;
  const title = escapeHtml(
    String(input.title || "").trim() || "Producto en Amazon",
  );
  const price = escapeHtml(String(input.priceLabel || "").trim());
  const image = String(input.imageUrl || "").trim();
  const safeImage =
    image && /^https?:\/\//i.test(image) ? escapeHtml(image) : "";

  const https = JSON.stringify(links.https);
  const ios = JSON.stringify(links.iosScheme);
  const iosWeb = JSON.stringify(links.iosWebScheme);
  const android = JSON.stringify(links.androidIntent);

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<meta name="robots" content="noindex"/>
<meta property="og:title" content="${title}"/>
${safeImage ? `<meta property="og:image" content="${safeImage}"/>` : ""}
<title>${title}</title>
<style>
  :root{color-scheme:light}
  *{box-sizing:border-box}
  body{margin:0;min-height:100dvh;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f4f2;color:#191919}
  .wrap{max-width:28rem;margin:0 auto;min-height:100dvh;display:flex;flex-direction:column;background:#fff}
  .photo{aspect-ratio:1;background:#fff;display:grid;place-items:center;border-bottom:1px solid #ececec}
  .photo img{max-width:100%;max-height:100%;object-fit:contain;padding:1rem}
  .photo .ph{color:#a8a8a8;font-size:.85rem;font-weight:600}
  .body{padding:1.1rem 1.15rem 1.5rem;flex:1}
  .brand{font-size:.7rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#8a8a8a;margin:0 0 .35rem}
  h1{font-size:1.15rem;line-height:1.35;margin:0;font-weight:650}
  .price{margin-top:.55rem;font-size:1.35rem;font-weight:750;color:#111}
  .hint{margin:.85rem 0 0;font-size:.82rem;line-height:1.45;color:#707070}
  .actions{display:grid;gap:.65rem;margin-top:1.25rem}
  button,.btn{
    appearance:none;border:0;cursor:pointer;width:100%;height:3rem;border-radius:999px;
    font-size:.95rem;font-weight:700;display:inline-flex;align-items:center;justify-content:center;
    text-decoration:none;color:#111;
  }
  .buy{background:#ff9900}
  .buy:active{filter:brightness(.95)}
  .cart{background:#fff;border:1.5px solid #d5d5d5}
  .cart:active{background:#f7f7f7}
  .web{margin-top:.35rem;text-align:center;font-size:.78rem}
  .web a{color:#3665F3;font-weight:600;text-decoration:none}
</style>
</head>
<body>
<main class="wrap">
  <div class="photo">
    ${
      safeImage
        ? `<img src="${safeImage}" alt="${title}" loading="eager"/>`
        : `<span class="ph">Producto Amazon</span>`
    }
  </div>
  <div class="body">
    <p class="brand">Amazon</p>
    <h1>${title}</h1>
    ${price ? `<p class="price">${price}</p>` : ""}
    <p class="hint">Miralo acá. Cuando quieras comprar, tocá un botón y te abrimos la app de Amazon.</p>
    <div class="actions">
      <button type="button" class="buy" id="btn-buy">Comprar ahora</button>
      <button type="button" class="cart" id="btn-cart">Agregar al carrito</button>
    </div>
    <p class="web"><a id="web-link" href=${https}>Ver en amazon.com</a></p>
  </div>
</main>
<script>
(function(){
  var https=${https};
  var ios=${ios};
  var iosWeb=${iosWeb};
  var android=${android};
  var ua=navigator.userAgent||"";
  var isAndroid=/Android/i.test(ua);
  var isIOS=/iPhone|iPad|iPod/i.test(ua);
  var web=document.getElementById("web-link");
  if(web) web.setAttribute("href", https);

  function openAmazonApp(){
    // Only on user tap — avoids Facebook “leaving this page” auto-prompt.
    if(isAndroid){
      location.href=android;
      setTimeout(function(){ location.href=https; }, 1600);
      return;
    }
    if(isIOS){
      location.href=ios;
      setTimeout(function(){ location.href=iosWeb; }, 300);
      setTimeout(function(){ location.href=https; }, 1600);
      return;
    }
    location.href=https;
  }

  var buy=document.getElementById("btn-buy");
  var cart=document.getElementById("btn-cart");
  if(buy) buy.addEventListener("click", openAmazonApp);
  if(cart) cart.addEventListener("click", openAmazonApp);
})();
</script>
</body>
</html>`;
}

/** @deprecated use amazonProductLandingHtml — kept name for older imports */
export function amazonAppBridgeHtml(links: AmazonAppDeepLinks): string {
  return amazonProductLandingHtml({ links });
}
