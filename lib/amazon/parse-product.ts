import { DEFAULT_VALUES } from "@/config/default-values";
import { isUsableCatalogBullet } from "@/lib/catalog/bullets";

export type AmazonProductDraft = {
  asin: string;
  url: string;
  title: string;
  brand: string;
  price: number | null;
  features: string[];
  imageUrls: string[];
  upc: string;
};

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, " ")
    .trim();
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function attr(html: string, property: string): string {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const alt = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
    "i",
  );
  return decodeEntities(html.match(re)?.[1] || html.match(alt)?.[1] || "");
}

function uniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const url = upgradeAmazonImage(raw);
    if (!url) continue;
    const key = amazonImageId(url) || url;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out;
}

const AMAZON_JUNK =
  /amazon_logo|social_share|nav-sprite|grey-pixel|play-icon|prime-logo|\/images\/[GS]\//i;

/** Amazon CDN id, without size tokens like `._AC_US40_`. */
export function amazonImageId(url: string): string | null {
  const path = String(url || "").split("?")[0] || "";
  const file = path.match(/\/images\/I\/([^/?#]+)/i)?.[1];
  if (!file) return null;
  const base = decodeURIComponent(file).replace(/\.(jpe?g|png|webp|gif)$/i, "");
  const id = base.replace(/\._.+$/i, "").trim();
  return id.length >= 3 ? id : null;
}

/** Large-file candidates for one Amazon photo (original first). */
export function amazonImageCandidates(url: string): string[] {
  const clean = String(url || "").trim().replace(/&amp;/g, "&");
  const id = amazonImageId(clean);
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (next: string) => {
    if (!next || seen.has(next)) return;
    seen.add(next);
    out.push(next);
  };
  if (/^https:\/\//i.test(clean) && !AMAZON_JUNK.test(clean)) push(clean);
  if (id) {
    push(`https://m.media-amazon.com/images/I/${id}.jpg`);
    push(`https://m.media-amazon.com/images/I/${id}._AC_SL1500_.jpg`);
    push(`https://m.media-amazon.com/images/I/${id}._SL1500_.jpg`);
  }
  return out;
}

/** Prefer a large Amazon image variant. */
export function upgradeAmazonImage(url: string): string {
  const clean = String(url || "").trim().replace(/&amp;/g, "&");
  if (!/^https:\/\//i.test(clean)) return "";
  if (AMAZON_JUNK.test(clean)) return "";
  if (!/amazon|ssl-images-amazon|media-amazon/i.test(clean)) return clean;
  const id = amazonImageId(clean);
  if (!id) return "";
  return `https://m.media-amazon.com/images/I/${id}._AC_SL1500_.jpg`;
}

function jsonLdProducts(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    try {
      const parsed = JSON.parse(match[1] || "") as unknown;
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const rec = item as Record<string, unknown>;
        const type = String(rec["@type"] || "");
        if (/product/i.test(type)) out.push(rec);
        const graph = rec["@graph"];
        if (Array.isArray(graph)) {
          for (const node of graph) {
            if (
              node &&
              typeof node === "object" &&
              /product/i.test(String((node as Record<string, unknown>)["@type"] || ""))
            ) {
              out.push(node as Record<string, unknown>);
            }
          }
        }
      }
    } catch {
      /* skip bad json-ld */
    }
  }
  return out;
}

function decodeAmazonMarkup(html: string): string {
  return String(html || "")
    .replace(/&quot;/g, '"')
    .replace(/\\u002[fF]/g, "/")
    .replace(/\\\//g, "/")
    .replace(/\\u003c/gi, "<");
}

function extractBalanced(
  source: string,
  start: number,
  openCh: "{" | "[",
): string {
  const closeCh = openCh === "{" ? "}" : "]";
  if (source[start] !== openCh) return "";
  let depth = 0;
  let inStr = false;
  let quote = "";
  let escape = false;
  for (let i = start; i < source.length; i += 1) {
    const c = source[i];
    if (inStr) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === quote) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      quote = c;
      continue;
    }
    if (c === openCh) depth += 1;
    else if (c === closeCh) {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return "";
}

function blockAfterKey(
  html: string,
  key: string,
  openCh: "{" | "[",
): string {
  const re = new RegExp(`['"]${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"]\\s*:`, "i");
  const match = re.exec(html);
  if (!match || match.index == null) return "";
  let i = match.index + match[0].length;
  while (i < html.length && /\s/.test(html[i])) i += 1;
  if (html[i] !== openCh) {
    const found = html.indexOf(openCh, i);
    if (found < 0 || found - i > 80) return "";
    i = found;
  }
  return extractBalanced(html, i, openCh);
}

function urlsFromGalleryBlock(block: string): string[] {
  if (!block) return [];
  const hiRes = [
    ...block.matchAll(
      /['"](?:hiRes|mainUrl|hiResImage)['"]\s*:\s*['"](https:[^"']+)['"]/g,
    ),
  ].map((m) => m[1]);
  const large = [
    ...block.matchAll(/['"]large['"]\s*:\s*['"](https:[^"']+)['"]/g),
  ].map((m) => m[1]);
  const mainKeys = [
    ...block.matchAll(
      /['"](https:\/\/[^"']+(?:media-amazon|ssl-images-amazon)[^"']*\/images\/I\/[^"']+)['"]\s*:/gi,
    ),
  ].map((m) => m[1]);
  const thumbs = [
    ...block.matchAll(
      /['"](?:thumb|thumbUrl)['"]\s*:\s*['"](https:[^"']+)['"]/g,
    ),
  ].map((m) => m[1]);
  return [...hiRes, ...large, ...mainKeys, ...thumbs].filter(
    (url) => !/play-icon|vidthumb|video-thumbnail|360_icon/i.test(url),
  );
}

function colorNameForAsin(html: string, asin: string): string {
  const id = String(asin || "").trim().toUpperCase();
  if (!id) return "";
  const obj =
    blockAfterKey(html, "colorToAsin", "{") ||
    blockAfterKey(html, "asinToColor", "{");
  if (!obj) return "";
  const re = /['"]([^"']+)['"]\s*:\s*['"]([A-Z0-9]{10})['"]/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(obj))) {
    if (match[2].toUpperCase() === id && match[1] && match[1].toLowerCase() !== "initial") {
      return match[1];
    }
  }
  return "";
}

function colorImagesForProduct(html: string, asin?: string): string[] {
  const decoded = decodeAmazonMarkup(html);
  const obj = blockAfterKey(decoded, "colorImages", "{");
  if (!obj) return [];
  const color = colorNameForAsin(decoded, asin || "");
  if (color) {
    const named = blockAfterKey(obj, color, "[");
    if (named) return urlsFromGalleryBlock(named);
  }
  const initial = blockAfterKey(obj, "initial", "[");
  return urlsFromGalleryBlock(initial);
}

function imageGalleryData(html: string): string[] {
  const decoded = decodeAmazonMarkup(html);
  return urlsFromGalleryBlock(blockAfterKey(decoded, "imageGalleryData", "["));
}

function primaryImages(html: string): string[] {
  const decoded = decodeAmazonMarkup(html);
  const aroundLanding = (() => {
    const idx = decoded.search(/id=["']landingImage["']/i);
    if (idx < 0) return "";
    return decoded.slice(Math.max(0, idx - 200), idx + 2500);
  })();
  const oldHires = [
    ...decoded.matchAll(/data-old-hires=["'](https:[^"']+)["']/gi),
  ].map((m) => m[1]);
  const landingSrc =
    aroundLanding.match(/\ssrc=["'](https:[^"']+)["']/i)?.[1] || "";
  const dynamic = [
    ...aroundLanding.matchAll(/"(https:\/\/[^"]+(?:media-amazon|ssl-images-amazon)[^"]*)"/gi),
  ].map((m) => m[1]);
  return [...oldHires, ...dynamic, landingSrc];
}

function markdownProductImages(text: string): string[] {
  const cut =
    String(text || "").split(
      /\n#{1,3}\s+(Customers who|Products related|Sponsored|Frequently bought|Compare with)/i,
    )[0] || text;
  return [
    ...cut.matchAll(
      /https:\/\/[^\s)"']+(?:media-amazon|ssl-images-amazon)[^\s)"']+/gi,
    ),
  ].map((m) => m[0]);
}

export function collectAmazonImageUrlsFromHtml(
  html: string,
  asin?: string,
): string[] {
  const official = uniqueUrls([
    ...colorImagesForProduct(html, asin),
    ...imageGalleryData(html),
    ...primaryImages(html),
  ]);
  if (official.length) return official;
  return uniqueUrls(markdownProductImages(html));
}

function featureBullets(html: string): string[] {
  const section =
    html.match(
      /id="feature-bullets"[\s\S]*?<ul[\s\S]*?>([\s\S]*?)<\/ul>/i,
    )?.[1] || "";
  const fromHtml = [
    ...section.matchAll(/<span[^>]*class="[^"]*a-list-item[^"]*"[^>]*>([\s\S]*?)<\/span>/gi),
  ]
    .map((m) => stripTags(m[1] || ""))
    .filter((line) => isUsableCatalogBullet(line));
  if (fromHtml.length) return fromHtml.slice(0, 8);
  return [...html.matchAll(/^\s*[-*]\s+(.{8,220})$/gm)]
    .map((m) => stripTags(m[1] || ""))
    .filter((line) => isUsableCatalogBullet(line))
    .slice(0, 8);
}

function brandFromHtml(html: string): string {
  const byline =
    html.match(/id="bylineInfo"[^>]*>[\s\S]*?>([^<]+)</i)?.[1] ||
    html.match(/id="bylineInfo"[^>]*>([^<]+)</i)?.[1] ||
    "";
  return stripTags(byline)
    .replace(/^(visit the|brand:)\s+/i, "")
    .replace(/\s+store$/i, "")
    .trim();
}

function priceFromHtml(html: string): number | null {
  const amount =
    html.match(/"priceAmount"\s*:\s*([0-9.]+)/)?.[1] ||
    html.match(/id="priceblock_ourprice"[^>]*>\s*\$?\s*([0-9,.]+)/i)?.[1] ||
    html.match(/class="a-price-whole">\s*([0-9,]+)/)?.[1];
  if (!amount) return null;
  const n = Number(String(amount).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function upcFromHtml(html: string): string {
  const row =
    html.match(/>\s*(?:UPC|GTIN)[\s\S]{0,120}?>\s*([0-9]{8,14})\s*</i)?.[1] ||
    html.match(/"upc"\s*:\s*"([0-9]{8,14})"/i)?.[1] ||
    "";
  return row;
}

function titleFromHtml(html: string): string {
  return stripTags(
    html.match(/id="productTitle"[^>]*>\s*([\s\S]*?)<\/span>/i)?.[1] ||
      attr(html, "og:title") ||
      html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ||
      html.match(/^#\s+(.+)$/m)?.[1] ||
      "",
  )
    .replace(/\s*:\s*amazon\.co.*$/i, "")
    .trim();
}

export function parseAmazonProductPage(
  html: string,
  meta: { asin: string; url: string },
): AmazonProductDraft {
  const ld = jsonLdProducts(html)[0] || {};
  const ldName = typeof ld.name === "string" ? ld.name : "";
  const ldBrand =
    typeof ld.brand === "string"
      ? ld.brand
      : ld.brand && typeof ld.brand === "object"
        ? String((ld.brand as { name?: string }).name || "")
        : "";
  const ldImages = Array.isArray(ld.image)
    ? ld.image.filter((u): u is string => typeof u === "string")
    : typeof ld.image === "string"
      ? [ld.image]
      : [];
  const offers = ld.offers as { price?: string | number } | undefined;
  const ldPrice = offers?.price != null ? Number(offers.price) : null;

  const title = titleFromHtml(html) || decodeEntities(ldName);
  const brand = brandFromHtml(html) || decodeEntities(ldBrand);
  const price =
    priceFromHtml(html) ??
    (Number.isFinite(ldPrice) && (ldPrice as number) > 0 ? (ldPrice as number) : null);

  const imageUrls = uniqueUrls([
    ...collectAmazonImageUrlsFromHtml(html, meta.asin),
    ...ldImages,
    attr(html, "og:image"),
  ]).slice(0, DEFAULT_VALUES.maxImages);

  return {
    asin: meta.asin,
    url: meta.url,
    title,
    brand,
    price,
    features: featureBullets(html),
    imageUrls,
    upc: upcFromHtml(html),
  };
}

export function isCaptchaPage(html: string): boolean {
  return /opfcaptcha|validatecaptcha|enter the characters you see/i.test(html);
}
