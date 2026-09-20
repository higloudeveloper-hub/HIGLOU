import { parseWalmartLink } from "@/lib/walmart/item-id";
import { isWalmartBlockedPage } from "@/lib/walmart/parse-product";
import {
  buildRetailSearchQueries,
  pickBestRetailHit,
  type RetailMatchHints,
} from "@/lib/opportunity/retail-match";

export type WalmartSearchHit = {
  itemId: string;
  title: string;
  imageUrl: string;
  price: number | null;
  upc?: string;
};

const FETCH_MS = 28_000;

async function fetchSearchHtml(query: string): Promise<string> {
  const url = `https://www.walmart.com/search?q=${encodeURIComponent(query)}`;
  const headers: Record<string, string> = {
    Accept: "text/html,text/plain;q=0.9,*/*;q=0.8",
    "X-Return-Format": "html",
    "X-Timeout": "25",
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
    const text = await res.text();
    if (isWalmartBlockedPage(text) && !/__NEXT_DATA__|walmartimages/i.test(text)) {
      return "";
    }
    return text;
  } catch {
    return "";
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

function collectItems(
  value: unknown,
  out: WalmartSearchHit[],
  seen: Set<string>,
  depth = 0,
) {
  if (!value || depth > 12 || out.length >= 24) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectItems(item, out, seen, depth + 1));
    return;
  }
  if (typeof value !== "object") return;
  const rec = value as Record<string, unknown>;
  const id = String(rec.usItemId || rec.itemId || "").replace(/\D/g, "");
  const name = String(rec.name || rec.title || "").trim();
  if (/^\d{5,15}$/.test(id) && name.length >= 3 && !seen.has(id)) {
    seen.add(id);
    let imageUrl = "";
    const info = rec.imageInfo as { thumbnailUrl?: string; allImages?: Array<{ url?: string }> } | undefined;
    imageUrl =
      String(info?.thumbnailUrl || info?.allImages?.[0]?.url || rec.imageUrl || "");
    const priceInfo = rec.priceInfo as {
      currentPrice?: { price?: number };
    } | undefined;
    const price =
      typeof priceInfo?.currentPrice?.price === "number"
        ? priceInfo.currentPrice.price
        : null;
    const upcDigits = String(rec.upc || rec.gtin || rec.ean || "").replace(
      /\D/g,
      "",
    );
    out.push({
      itemId: id,
      title: name,
      imageUrl,
      price,
      upc:
        upcDigits.length === 12 || upcDigits.length === 13
          ? upcDigits
          : undefined,
    });
  }
  for (const child of Object.values(rec)) {
    if (child && typeof child === "object") {
      collectItems(child, out, seen, depth + 1);
    }
  }
}

/** Parse Walmart search HTML (__NEXT_DATA__ or /ip/ links). */
export function parseWalmartSearchHits(html: string): WalmartSearchHit[] {
  const out: WalmartSearchHit[] = [];
  const seen = new Set<string>();
  const next = nextDataJson(html);
  if (next) collectItems(next, out, seen);

  if (out.length < 4) {
    const re = /https?:\/\/(?:www\.)?walmart\.com\/ip\/[^"'\\\s>]*/gi;
    for (const match of html.matchAll(re)) {
      const parsed = parseWalmartLink(match[0]);
      if (!parsed || seen.has(parsed.itemId)) continue;
      seen.add(parsed.itemId);
      out.push({
        itemId: parsed.itemId,
        title: "",
        imageUrl: "",
        price: null,
      });
    }
  }
  return out;
}

export async function searchWalmartProducts(
  keyword: string,
  opts?: { limit?: number },
): Promise<WalmartSearchHit[]> {
  const q = String(keyword || "").trim();
  if (q.length < 2) return [];
  const limit = Math.min(Math.max(opts?.limit ?? 8, 1), 12);
  const html = await fetchSearchHtml(q);
  if (!html) return [];
  return parseWalmartSearchHits(html).slice(0, limit);
}

/**
 * Try UPC → brand+model → short title until we get a confident Walmart hit.
 * Never stop at an empty UPC result when a title query would work.
 */
export async function searchWalmartBestMatch(
  hints: RetailMatchHints,
  opts?: { limit?: number },
): Promise<{
  hit: WalmartSearchHit;
  matchedBy: "upc" | "title";
  score: number;
  query: string;
} | null> {
  const queries = buildRetailSearchQueries(hints);
  if (!queries.length) return null;
  const limit = Math.min(Math.max(opts?.limit ?? 8, 1), 12);
  const pooled: WalmartSearchHit[] = [];
  const seen = new Set<string>();
  let usedQuery = "";

  for (const q of queries) {
    const batch = await searchWalmartProducts(q, { limit });
    for (const hit of batch) {
      if (seen.has(hit.itemId)) continue;
      seen.add(hit.itemId);
      pooled.push(hit);
    }
    if (!usedQuery && batch.length) usedQuery = q;
    const picked = pickBestRetailHit(pooled, hints, {
      minScore:
        String(hints.upc || "").replace(/\D/g, "").length >= 12 ? 0.45 : 0.5,
    });
    if (picked && (picked.matchedBy === "upc" || picked.score >= 0.5)) {
      return {
        hit: picked.hit,
        matchedBy: picked.matchedBy,
        score: picked.score,
        query: q,
      };
    }
    if (pooled.length >= 12) break;
  }

  const picked = pickBestRetailHit(pooled, hints, { minScore: 0.5 });
  if (!picked) return null;
  return {
    hit: picked.hit,
    matchedBy: picked.matchedBy,
    score: picked.score,
    query: usedQuery || queries[0],
  };
}
