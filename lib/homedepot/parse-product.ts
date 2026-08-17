import { DEFAULT_VALUES } from "@/config/default-values";

export type HomeDepotProductDraft = {
  itemId: string;
  url: string;
  title: string;
  brand: string;
  model: string;
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

const HD_JUNK =
  /swatchImages|logo|sprite|pixel|icon|badge|social|homedepot-header/i;

export function homeDepotImageKey(url: string): string {
  const uuid = url.match(/\/productImages\/([a-f0-9-]{8,})/i)?.[1];
  if (uuid) return uuid.toLowerCase();
  return upgradeHomeDepotImage(url) || url;
}

/** Prefer the 1000px Home Depot gallery file. */
export function upgradeHomeDepotImage(url: string): string {
  const clean = String(url || "").trim().replace(/&amp;/g, "&").split("?")[0] || "";
  if (!/^https:\/\//i.test(clean)) return "";
  if (HD_JUNK.test(clean)) return "";
  if (!/thdstatic|homedepot-static|homedepot\.com/i.test(clean)) return "";
  if (!/productImages|product-images|mediacontent/i.test(clean) && !/\.(jpe?g|png|webp)$/i.test(clean)) {
    return "";
  }
  return clean
    .replace(/_(\d+)_(\d+)\.(jpe?g|png|webp)/i, "_$1_1000.$3")
    .replace(/_(300|400|600)\.(jpe?g|png|webp)/i, "_1000.$2");
}

export function homeDepotImageCandidates(url: string): string[] {
  const upgraded = upgradeHomeDepotImage(url);
  if (!upgraded) return [];
  const mid = upgraded.replace(/_(\d+)_1000\.(jpe?g|png|webp)/i, "_$1_600.$2");
  const original = String(url || "").trim().split("?")[0] || "";
  return [...new Set([upgraded, mid, original].filter((u) => /^https:\/\//i.test(u)))];
}

function uniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const url = upgradeHomeDepotImage(raw);
    if (!url) continue;
    const key = homeDepotImageKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out;
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
        if (/product/i.test(String(rec["@type"] || ""))) out.push(rec);
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

function collectImageUrls(html: string): string[] {
  return [
    ...html.matchAll(
      /https:\/\/(?:images\.)?(?:thdstatic|homedepot-static)\.com\/[^"'\\\s>]+\.(?:jpe?g|png|webp)/gi,
    ),
  ].map((m) => m[0].replace(/\\u002F/g, "/"));
}

function featureBullets(html: string): string[] {
  const fromHtml = [
    ...html.matchAll(
      /<(?:li|p)[^>]*class="[^"]*(?:overview|bullet|sui-list)[^"]*"[^>]*>([\s\S]*?)<\/(?:li|p)>/gi,
    ),
  ]
    .map((m) => stripTags(m[1] || ""))
    .filter((line) => line.length > 12 && !/skip to|sign in|cookie/i.test(line));
  if (fromHtml.length) return fromHtml.slice(0, 8);
  return [...html.matchAll(/^\s*[-*]\s+(.{12,220})$/gm)]
    .map((m) => stripTags(m[1] || ""))
    .slice(0, 8);
}

function specValue(html: string, label: string): string {
  const re = new RegExp(
    `>(?:\\s*)${label}(?:\\s*)<\\/[a-z]+>[\\s\\S]{0,180}?>\\s*([^<]{2,80})\\s*<`,
    "i",
  );
  return stripTags(html.match(re)?.[1] || "");
}

function jsonString(html: string, key: string): string {
  const re = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`, "i");
  return decodeEntities(html.match(re)?.[1] || "");
}

function priceFromHtml(html: string, ldPrice: number | null): number | null {
  if (ldPrice != null && Number.isFinite(ldPrice) && ldPrice > 0) return ldPrice;
  const amount =
    html.match(/"currentPrice"\s*:\s*\{[^}]*"value"\s*:\s*([0-9.]+)/)?.[1] ||
    html.match(/"originalPrice"\s*:\s*\{[^}]*"value"\s*:\s*([0-9.]+)/)?.[1];
  const n = amount ? Number(amount) : null;
  return n != null && Number.isFinite(n) && n > 0 ? n : null;
}

function titleFromHtml(html: string): string {
  return stripTags(
    html.match(/data-testid="product-title"[^>]*>\s*([\s\S]*?)<\//i)?.[1] ||
      html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ||
      attr(html, "og:title") ||
      html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ||
      html.match(/^#\s+(.+)$/m)?.[1] ||
      "",
  )
    .replace(/\s*\|\s*The Home Depot.*$/i, "")
    .replace(/\s*-\s*The Home Depot.*$/i, "")
    .trim();
}

export function parseHomeDepotProductPage(
  html: string,
  meta: { itemId: string; url: string },
): HomeDepotProductDraft {
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
  const ldGtin = String(
    ld.gtin13 || ld.gtin12 || ld.gtin || ld.sku || "",
  ).replace(/\D/g, "");
  const ldMpn = typeof ld.mpn === "string" ? ld.mpn : "";

  const title = titleFromHtml(html) || decodeEntities(ldName);
  const brand =
    specValue(html, "Brand") ||
    jsonString(html, "brandName") ||
    decodeEntities(ldBrand);
  const model =
    specValue(html, "Model(?:\\s*#| Number)?") ||
    jsonString(html, "modelNumber") ||
    ldMpn;
  const upc =
    specValue(html, "UPC") ||
    jsonString(html, "upc") ||
    (ldGtin.length >= 8 && ldGtin.length <= 14 && ldGtin !== meta.itemId
      ? ldGtin
      : "");

  const imageUrls = uniqueUrls([
    ...ldImages,
    attr(html, "og:image"),
    ...collectImageUrls(html),
  ]).slice(0, DEFAULT_VALUES.maxImages);

  return {
    itemId: meta.itemId,
    url: meta.url,
    title,
    brand,
    model,
    price: priceFromHtml(html, Number.isFinite(ldPrice) ? ldPrice : null),
    features: featureBullets(html),
    imageUrls,
    upc,
  };
}

export function isHomeDepotBlockedPage(html: string): boolean {
  return /access denied|akamai|bot detection|pardon our interruption|captcha/i.test(
    html,
  );
}
