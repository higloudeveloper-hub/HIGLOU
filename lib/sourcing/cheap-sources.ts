import type { VisionProductIdentity } from "@/lib/sourcing/vision-identity";

export type CheapSourcePlatform =
  | "alibaba"
  | "aliexpress"
  | "brand"
  | "google_lens"
  | "web_match";

export type CheapSourceOffer = {
  platform: CheapSourcePlatform;
  title: string;
  url: string;
  price: number | null;
  currency: string;
  moq: number | null;
  imageUrl: string | null;
  matchedBy: "vision" | "query" | "web_match" | "link";
  /** Rough landed unit cost (shipping/duty buffer). */
  landedEstimate: number | null;
  /** How much cheaper vs current Amazon/retail buy. */
  saveVsBuy: number | null;
};

export type CheapSourceResult = {
  query: string;
  identity: VisionProductIdentity;
  buyPrice: number | null;
  sellPrice: number | null;
  offers: CheapSourceOffer[];
  bestSave: number | null;
  searchLinks: Array<{ platform: CheapSourcePlatform; label: string; url: string }>;
  warnings: string[];
};

const FETCH_MS = 22_000;

async function fetchViaJina(url: string): Promise<string> {
  const headers: Record<string, string> = {
    Accept: "text/html,text/plain;q=0.9,*/*;q=0.8",
    "X-Return-Format": "html",
    "X-Timeout": "20",
  };
  const key = process.env.JINA_API_KEY?.trim();
  if (key) headers.Authorization = `Bearer ${key}`;
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_MS),
    });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
}

function moneyFromText(raw: string): number | null {
  const m = String(raw || "").match(/\$?\s*(\d{1,5}(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  const n = Number(String(m[1]).replace(",", "."));
  return Number.isFinite(n) && n > 0 && n < 50_000 ? n : null;
}

function slugQuery(q: string): string {
  return encodeURIComponent(q.trim()).replace(/%20/g, "-");
}

export function alibabaSearchUrl(query: string): string {
  return `https://www.alibaba.com/trade/search?fsb=y&IndexArea=product_en&SearchText=${encodeURIComponent(query)}`;
}

export function aliexpressSearchUrl(query: string): string {
  const slug = slugQuery(query);
  return `https://www.aliexpress.us/w/wholesale-${slug}.html`;
}

export function brandDirectSearchUrl(brand: string, query: string): string {
  const q = [brand, query, "official", "wholesale", "distributor"]
    .filter(Boolean)
    .join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

export function googleLensUrl(imageUrl: string): string {
  return `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}`;
}

/** Parse Alibaba search HTML (Jina or raw) into offers. */
export function parseAlibabaSearchHits(
  html: string,
  limit = 6,
): Array<{ title: string; url: string; price: number | null; imageUrl: string | null }> {
  const out: Array<{
    title: string;
    url: string;
    price: number | null;
    imageUrl: string | null;
  }> = [];
  const seen = new Set<string>();
  const re =
    /https?:\/\/(?:www\.)?alibaba\.com\/product-detail\/[^"'\\\s<>]+/gi;
  for (const match of html.matchAll(re)) {
    const url = match[0].replace(/[),.]+$/, "");
    if (seen.has(url)) continue;
    seen.add(url);
    const window = html.slice(
      Math.max(0, (match.index || 0) - 200),
      (match.index || 0) + 400,
    );
    const title =
      window.match(/title["']?\s*[:=]\s*["']([^"']{8,120})/i)?.[1] ||
      decodeURIComponent(
        (url.match(/product-detail\/([^_/?]+)/i)?.[1] || "")
          .replace(/-/g, " ")
          .slice(0, 100),
      ) ||
      "Alibaba product";
    const price = moneyFromText(window);
    out.push({ title, url, price, imageUrl: null });
    if (out.length >= limit) break;
  }
  return out;
}

/** Parse AliExpress search HTML into offers. */
export function parseAliExpressSearchHits(
  html: string,
  limit = 6,
): Array<{ title: string; url: string; price: number | null; imageUrl: string | null }> {
  const out: Array<{
    title: string;
    url: string;
    price: number | null;
    imageUrl: string | null;
  }> = [];
  const seen = new Set<string>();
  const re =
    /https?:\/\/(?:www\.)?aliexpress\.(?:com|us)\/item\/\d+\.html[^"'\\\s<>]*/gi;
  for (const match of html.matchAll(re)) {
    let url = match[0].replace(/[),.]+$/, "");
    url = url.replace(/\?.*$/, "");
    if (seen.has(url)) continue;
    seen.add(url);
    const window = html.slice(
      Math.max(0, (match.index || 0) - 180),
      (match.index || 0) + 360,
    );
    const title =
      window.match(/title["']?\s*[:=]\s*["']([^"']{8,120})/i)?.[1] ||
      `AliExpress item ${url.match(/item\/(\d+)/)?.[1] || ""}`;
    const price = moneyFromText(window);
    out.push({ title, url, price, imageUrl: null });
    if (out.length >= limit) break;
  }
  // Fallback: item ids in JSON
  if (out.length < 2) {
    for (const m of html.matchAll(/"productId"\s*:\s*"?(\d{8,14})"?/g)) {
      const id = m[1];
      const url = `https://www.aliexpress.us/item/${id}.html`;
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({
        title: `AliExpress ${id}`,
        url,
        price: null,
        imageUrl: null,
      });
      if (out.length >= limit) break;
    }
  }
  return out;
}

function landedFromFactory(price: number | null): number | null {
  if (price == null || price <= 0) return null;
  // Buffer for shipping, duty, cartons — conservative for US FBM.
  return Math.round(price * 1.35 * 100) / 100;
}

export async function searchAlibabaOffers(
  query: string,
): Promise<CheapSourceOffer[]> {
  const url = alibabaSearchUrl(query);
  const html = await fetchViaJina(url);
  const hits = html ? parseAlibabaSearchHits(html) : [];
  if (!hits.length) {
    return [
      {
        platform: "alibaba",
        title: `Search Alibaba: ${query}`,
        url,
        price: null,
        currency: "USD",
        moq: null,
        imageUrl: null,
        matchedBy: "link",
        landedEstimate: null,
        saveVsBuy: null,
      },
    ];
  }
  return hits.map((h) => ({
    platform: "alibaba" as const,
    title: h.title,
    url: h.url,
    price: h.price,
    currency: "USD",
    moq: null,
    imageUrl: h.imageUrl,
    matchedBy: "query" as const,
    landedEstimate: landedFromFactory(h.price),
    saveVsBuy: null,
  }));
}

export async function searchAliExpressOffers(
  query: string,
): Promise<CheapSourceOffer[]> {
  const url = aliexpressSearchUrl(query);
  const html = await fetchViaJina(url);
  const hits = html ? parseAliExpressSearchHits(html) : [];
  if (!hits.length) {
    return [
      {
        platform: "aliexpress",
        title: `Search AliExpress: ${query}`,
        url,
        price: null,
        currency: "USD",
        moq: null,
        imageUrl: null,
        matchedBy: "link",
        landedEstimate: null,
        saveVsBuy: null,
      },
    ];
  }
  return hits.map((h) => ({
    platform: "aliexpress" as const,
    title: h.title,
    url: h.url,
    price: h.price,
    currency: "USD",
    moq: 1,
    imageUrl: h.imageUrl,
    matchedBy: "query" as const,
    landedEstimate: landedFromFactory(h.price),
    saveVsBuy: null,
  }));
}
