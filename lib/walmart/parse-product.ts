import { DEFAULT_VALUES } from "@/config/default-values";
import { isUsableCatalogBullet } from "@/lib/catalog/bullets";

export type WalmartProductDraft = {
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
  return decodeEntities(
    value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  );
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

const WALMART_JUNK =
  /walmart[_-]?logo|spark-logo|social|sprite|pixel|icon|badge|favicon|placeholder/i;

export function isWalmartBlockedPage(html: string): boolean {
  const text = String(html || "");
  if (!text) return true;
  return /px-captcha|enablejs|robot check|access denied|blocked|pardon our interruption|verify you are human/i.test(
    text,
  ) && !/__NEXT_DATA__|walmartimages/i.test(text);
}

export function walmartImageId(url: string): string | null {
  const path = String(url || "").split("?")[0] || "";
  const asr = path.match(/\/asr\/([^/?#]+)/i)?.[1];
  if (asr) return asr.replace(/\.(jpe?g|png|webp|gif)$/i, "").toLowerCase();
  const seo = path.match(/\/seo\/([^/?#]+)/i)?.[1];
  if (seo) return seo.replace(/\.(jpe?g|png|webp|gif)$/i, "").toLowerCase();
  const file = path.split("/").pop() || "";
  const base = file.replace(/\.(jpe?g|png|webp|gif)$/i, "");
  return base.length >= 8 ? base.toLowerCase() : null;
}

/** Prefer a large Walmart CDN variant. */
export function upgradeWalmartImage(url: string): string {
  const clean = String(url || "").trim().replace(/&amp;/g, "&");
  if (!/^https:\/\//i.test(clean) && !clean.startsWith("//")) return "";
  const abs = clean.startsWith("//") ? `https:${clean}` : clean;
  if (WALMART_JUNK.test(abs)) return "";
  if (!/walmartimages|walmart\.com\/images/i.test(abs)) return "";
  const noHash = abs.split("#")[0] || abs;
  if (/[?&]odnHeight=/i.test(noHash)) {
    return noHash
      .replace(/odnHeight=\d+/ig, "odnHeight=2000")
      .replace(/odnWidth=\d+/ig, "odnWidth=2000");
  }
  const join = noHash.includes("?") ? "&" : "?";
  return `${noHash}${join}odnHeight=2000&odnWidth=2000&odnBg=FFFFFF`;
}

export function walmartImageCandidates(url: string): string[] {
  const upgraded = upgradeWalmartImage(url);
  const original = String(url || "").trim().replace(/&amp;/g, "&");
  const abs = original.startsWith("//") ? `https:${original}` : original;
  return [...new Set([upgraded, abs].filter((row) => /^https:\/\//i.test(row)))];
}

function uniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const url = upgradeWalmartImage(raw);
    if (!url) continue;
    const key = walmartImageId(url) || url;
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
        const type = String(rec["@type"] || "");
        if (/product/i.test(type)) out.push(rec);
        const graph = rec["@graph"];
        if (Array.isArray(graph)) {
          for (const node of graph) {
            if (
              node &&
              typeof node === "object" &&
              /product/i.test(
                String((node as Record<string, unknown>)["@type"] || ""),
              )
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

function nextDataJson(html: string): unknown {
  const start = html.search(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>/i);
  if (start < 0) return null;
  const gt = html.indexOf(">", start);
  if (gt < 0) return null;
  const brace = html.indexOf("{", gt);
  if (brace < 0) return null;
  const json = extractBalancedObject(html, brace);
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function extractBalancedObject(source: string, start: number): string {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (inString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return "";
}

function looksLikeProduct(rec: Record<string, unknown>): boolean {
  const id = String(rec.usItemId || rec.itemId || rec.id || "").trim();
  const name = String(rec.name || rec.productName || rec.title || "").trim();
  if (!/^\d{5,15}$/.test(id) || name.length < 3) return false;
  return Boolean(
    rec.imageInfo || rec.priceInfo || rec.brand || rec.shortDescription,
  );
}

function findProductNode(value: unknown, depth = 0): Record<string, unknown> | null {
  if (!value || depth > 14) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findProductNode(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  if (looksLikeProduct(rec)) return rec;
  const nested = rec.product;
  if (nested && typeof nested === "object") {
    const hit = findProductNode(nested, depth + 1);
    if (hit) return hit;
  }
  for (const child of Object.values(rec)) {
    if (child && typeof child === "object") {
      const hit = findProductNode(child, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

function collectImageUrls(value: unknown, out: string[], depth = 0) {
  if (!value || depth > 8 || out.length > 40) return;
  if (typeof value === "string") {
    if (/walmartimages/i.test(value)) out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectImageUrls(item, out, depth + 1));
    return;
  }
  if (typeof value !== "object") return;
  const rec = value as Record<string, unknown>;
  const url = String(rec.url || rec.thumbnailUrl || rec.src || "");
  if (url) out.push(url);
  if (rec.allImages) collectImageUrls(rec.allImages, out, depth + 1);
  if (rec.imageInfo) collectImageUrls(rec.imageInfo, out, depth + 1);
}

function pickLongestText(...values: string[]): string {
  let best = "";
  for (const raw of values) {
    const text = stripTags(raw);
    if (text.length > best.length) best = text;
  }
  return best.replace(/\s*[|:].*amazon\.com.*/i, "").trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numberPrice(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function productPrice(product: Record<string, unknown>): number | null {
  const info = asRecord(product.priceInfo);
  const current = asRecord(info?.currentPrice);
  return (
    numberPrice(current?.price) ||
    numberPrice(current?.priceString) ||
    numberPrice(product.price)
  );
}

function specValue(
  product: Record<string, unknown>,
  idml: Record<string, unknown> | null,
  names: RegExp,
): string {
  const bags = [product.specifications, idml?.specifications, idml?.idml];
  for (const bag of bags) {
    if (!Array.isArray(bag)) continue;
    for (const row of bag) {
      const rec = asRecord(row);
      if (!rec) continue;
      const label = String(rec.name || rec.key || rec.label || "");
      const value = String(rec.value || rec.values || "").trim();
      if (names.test(label) && value) return stripTags(value);
    }
  }
  return "";
}

function productUpc(
  product: Record<string, unknown>,
  idml: Record<string, unknown> | null,
): string {
  const direct = String(
    product.upc || product.upc12 || product.gtin || product.ean || "",
  ).replace(/\D/g, "");
  if (direct.length === 12 || direct.length === 13) return direct;
  const fromSpec = specValue(product, idml, /^(upc|gtin|ean)$/i).replace(/\D/g, "");
  if (fromSpec.length === 12 || fromSpec.length === 13) return fromSpec;
  return "";
}

function featureBullets(product: Record<string, unknown>, html: string): string[] {
  const fromHtml = String(product.shortDescription || product.longDescription || "");
  const li = [...fromHtml.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((m) => stripTags(m[1] || ""))
    .filter((line) => isUsableCatalogBullet(line));
  if (li.length) return li.slice(0, 8);
  const plain = stripTags(fromHtml);
  if (isUsableCatalogBullet(plain)) return [plain.slice(0, 220)];
  const meta = stripTags(attr(html, "description"));
  return isUsableCatalogBullet(meta) ? [meta.slice(0, 220)] : [];
}

export function collectWalmartImageUrlsFromHtml(html: string): string[] {
  const decoded = String(html || "");
  const next = nextDataJson(decoded);
  const product = findProductNode(next);
  const fromJson: string[] = [];
  if (product) collectImageUrls(product.imageInfo || product, fromJson);
  const ldImages: string[] = [];
  for (const ld of jsonLdProducts(decoded)) {
    const image = ld.image;
    if (typeof image === "string") ldImages.push(image);
    if (Array.isArray(image)) {
      for (const row of image) {
        if (typeof row === "string") ldImages.push(row);
        else if (row && typeof row === "object") {
          ldImages.push(String((row as { url?: string }).url || ""));
        }
      }
    }
  }
  return uniqueUrls([
    ...fromJson,
    ...ldImages,
    attr(decoded, "og:image"),
    ...[...decoded.matchAll(/https:\/\/i[0-9]\.walmartimages\.com\/[^"'\\\s>]+/gi)].map(
      (m) => m[0],
    ),
  ]);
}

export function parseWalmartProductPage(
  html: string,
  meta: { itemId: string; url: string },
): WalmartProductDraft {
  const next = nextDataJson(html);
  const product = findProductNode(next) || {};
  const data = asRecord(asRecord(asRecord(asRecord(next)?.props)?.pageProps)?.initialData)?.data;
  const idml = asRecord(data?.idml) || asRecord(product.idml);

  const ld = jsonLdProducts(html)[0] || {};
  const ldName = String(ld.name || "");
  const ldBrand =
    typeof ld.brand === "string"
      ? ld.brand
      : ld.brand && typeof ld.brand === "object"
        ? String((ld.brand as { name?: string }).name || "")
        : "";
  const offers = ld.offers as { price?: string | number } | undefined;
  const ldPrice = offers?.price != null ? Number(offers.price) : null;

  const itemId =
    String(product.usItemId || product.itemId || "").replace(/\D/g, "") ||
    meta.itemId;
  const title =
    pickLongestText(
      String(product.name || ""),
      String(product.productName || ""),
      ldName,
      attr(html, "og:title"),
    );
  const brand =
    stripTags(String(product.brand || product.manufacturerName || "")) ||
    stripTags(ldBrand);
  const model =
    specValue(product, idml, /^(model|model\s*number|item\s*model)$/i) ||
    stripTags(String(product.model || product.manufacturerProductId || ""));
  const price =
    productPrice(product) ??
    (Number.isFinite(ldPrice) && (ldPrice as number) > 0 ? (ldPrice as number) : null);

  return {
    itemId,
    url: meta.url,
    title,
    brand,
    model,
    price,
    features: featureBullets(product, html),
    imageUrls: collectWalmartImageUrlsFromHtml(html).slice(
      0,
      DEFAULT_VALUES.maxImages,
    ),
    upc: productUpc(product, idml),
  };
}
