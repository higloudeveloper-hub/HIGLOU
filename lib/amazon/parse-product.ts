import { DEFAULT_VALUES } from "@/config/default-values";

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
  const id = amazonImageId(url);
  if (!id) {
    const upgraded = upgradeAmazonImage(url);
    return upgraded ? [upgraded] : [];
  }
  return [
    `https://m.media-amazon.com/images/I/${id}.jpg`,
    `https://m.media-amazon.com/images/I/${id}._AC_SL1500_.jpg`,
    `https://m.media-amazon.com/images/I/${id}._SL1500_.jpg`,
  ];
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

function colorImages(html: string): string[] {
  const block =
    html.match(/['"]colorImages['"]\s*:\s*\{\s*['"]initial['"]\s*:\s*(\[[\s\S]*?\])/i)?.[1] ||
    html.match(/colorImages['"]\s*:\s*\{\s*initial:\s*(\[[\s\S]*?\])/i)?.[1];
  if (!block) return [];
  const urls: string[] = [];
  const re = /"(?:hiRes|large|mainUrl)"\s*:\s*"(https:[^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(block))) {
    urls.push(match[1].replace(/\\u002F/g, "/"));
  }
  return urls;
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
    .filter((line) => line.length > 8 && !/make sure this fits/i.test(line));
  if (fromHtml.length) return fromHtml.slice(0, 8);
  return [...html.matchAll(/^\s*[-*]\s+(.{12,220})$/gm)]
    .map((m) => stripTags(m[1] || ""))
    .filter((line) => !/make sure this fits|skip to|sign in/i.test(line))
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

function imagesFromMarkdown(text: string): string[] {
  const urls = [
    ...text.matchAll(/https:\/\/[^\s)"']+(?:media-amazon|ssl-images-amazon)[^\s)"']+/gi),
  ].map((m) => m[0]);
  return urls;
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
    ...colorImages(html),
    ...ldImages,
    attr(html, "og:image"),
    ...imagesFromMarkdown(html),
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
