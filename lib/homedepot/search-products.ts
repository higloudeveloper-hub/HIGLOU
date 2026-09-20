import {
  HOME_DEPOT_SEARCH_GALLERY_QUERY,
  homeDepotSessionCookie,
  IPHONE_SAFARI_UA,
} from "@/lib/homedepot/mobile-gallery";
import {
  buildRetailSearchQueries,
  pickBestRetailHit,
  type RetailMatchHints,
} from "@/lib/opportunity/retail-match";

export type HomeDepotSearchHit = {
  itemId: string;
  title: string;
  brand: string;
  model: string;
  imageUrl: string;
  price: number | null;
  upc: string;
};

function iphoneHeaders(
  referer: string,
  cookie: string,
): Record<string, string> {
  return {
    "User-Agent": IPHONE_SAFARI_UA,
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Content-Type": "application/json",
    Origin: "https://www.homedepot.com",
    Referer: referer,
    "x-experience-name": "general-merchandise",
    "x-hd-dc": "origin",
    "sec-ch-ua-mobile": "?1",
    ...(cookie ? { Cookie: cookie } : {}),
  };
}

function numberPrice(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : Number(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function upcFromRecord(rec: Record<string, unknown>): string {
  const ids = rec.identifiers;
  if (ids && typeof ids === "object") {
    const bag = ids as Record<string, unknown>;
    for (const key of ["upc", "gtin13", "gtin", "ean"]) {
      const digits = String(bag[key] || "").replace(/\D/g, "");
      if (digits.length === 12 || digits.length === 13) return digits;
    }
  }
  for (const key of ["upc", "gtin", "ean"]) {
    const digits = String(rec[key] || "").replace(/\D/g, "");
    if (digits.length === 12 || digits.length === 13) return digits;
  }
  return "";
}

/** Parse Home Depot searchModel GraphQL JSON into product hits. */
export function parseHomeDepotSearchHits(body: string): HomeDepotSearchHit[] {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return [];
  }
  const products =
    (json as { data?: { searchModel?: { products?: unknown[] } } })?.data
      ?.searchModel?.products || [];
  const out: HomeDepotSearchHit[] = [];
  for (const row of products) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const itemId = String(rec.itemId || "").replace(/\D/g, "");
    if (!/^\d{8,12}$/.test(itemId)) continue;
    const ids =
      rec.identifiers && typeof rec.identifiers === "object"
        ? (rec.identifiers as Record<string, unknown>)
        : {};
    const title = String(
      ids.productLabel || rec.productLabel || rec.title || "",
    ).trim();
    const brand = String(ids.brandName || rec.brand || "").trim();
    const model = String(ids.modelNumber || rec.modelNumber || "").trim();
    let imageUrl = "";
    const media = rec.media as { images?: Array<{ url?: string }> } | undefined;
    if (media?.images?.length) {
      imageUrl = String(media.images[0]?.url || "");
    }
    const info = rec.info as { pricing?: { value?: number } } | undefined;
    const price =
      numberPrice(info?.pricing?.value) ||
      numberPrice(rec.price) ||
      numberPrice((rec as { pricing?: { value?: unknown } }).pricing?.value);
    out.push({
      itemId,
      title,
      brand,
      model,
      imageUrl,
      price,
      upc: upcFromRecord(rec),
    });
  }
  return out;
}

/**
 * Keyword search against Home Depot federation GraphQL (same as mobile app).
 */
export async function searchHomeDepotProducts(
  keyword: string,
  opts?: { limit?: number },
): Promise<HomeDepotSearchHit[]> {
  const q = String(keyword || "").trim();
  if (q.length < 2) return [];
  const limit = Math.min(Math.max(opts?.limit ?? 8, 1), 12);
  const cookie = await homeDepotSessionCookie();
  const payload = {
    operationName: "searchModel",
    variables: { keyword: q, channel: "MOBILE", storefilter: "ALL" },
    query: HOME_DEPOT_SEARCH_GALLERY_QUERY.replace(
      "pageSize: 6",
      `pageSize: ${limit}`,
    ),
  };
  const endpoints = [
    "https://apionline.homedepot.com/federation-gateway/graphql?opname=searchModel",
    "https://www.homedepot.com/federation-gateway/graphql?opname=searchModel",
  ];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: iphoneHeaders("https://www.homedepot.com/s/" + encodeURIComponent(q), cookie),
        body: JSON.stringify(payload),
        cache: "no-store",
        signal: AbortSignal.timeout(16_000),
      });
      const text = await res.text();
      const hits = parseHomeDepotSearchHits(text);
      if (hits.length) return hits.slice(0, limit);
    } catch {
      /* try next */
    }
  }
  return [];
}

/** Multi-query Home Depot match — UPC first, then brand/model/title. */
export async function searchHomeDepotBestMatch(
  hints: RetailMatchHints,
  opts?: { limit?: number },
): Promise<{
  hit: HomeDepotSearchHit;
  matchedBy: "upc" | "title";
  score: number;
  query: string;
} | null> {
  const queries = buildRetailSearchQueries(hints);
  if (!queries.length) return null;
  const limit = Math.min(Math.max(opts?.limit ?? 8, 1), 12);
  const pooled: HomeDepotSearchHit[] = [];
  const seen = new Set<string>();
  let usedQuery = "";

  for (const q of queries) {
    const batch = await searchHomeDepotProducts(q, { limit });
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
