import { isCaptchaPage } from "@/lib/amazon/parse-product";
import {
  parseAmazonSearchHtml,
  parseAmazonSearchMarkdown,
} from "@/lib/amazon/parse-search";
import type { AmazonWinnerHit } from "@/lib/amazon/winner-rank";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const FETCH_MS = 18_000;

function headersFor(userAgent: string): Record<string, string> {
  return {
    "User-Agent": userAgent,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
  };
}

export function amazonSearchUrl(
  keywords: string,
  sort: "review-rank" | "featured" = "review-rank",
): string {
  const k = String(keywords || "").trim();
  const params = new URLSearchParams({ k });
  if (sort === "review-rank") params.set("s", "review-rank");
  return `https://www.amazon.com/s?${params.toString()}`;
}

async function readUrl(url: string, userAgent: string): Promise<string> {
  const res = await fetch(url, {
    headers: headersFor(userAgent),
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_MS),
  });
  return res.text();
}

async function fetchViaReader(url: string): Promise<string> {
  const headers: Record<string, string> = { Accept: "text/plain" };
  const key = process.env.JINA_API_KEY?.trim();
  if (key) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_MS),
  });
  if (!res.ok) return "";
  return res.text();
}

async function fetchViaEdge(
  origin: string,
  keywords: string,
  sort: "review-rank" | "featured",
): Promise<string> {
  try {
    const pageUrl = new URL("/api/amazon/search-page", origin);
    pageUrl.searchParams.set("q", keywords);
    if (sort === "featured") pageUrl.searchParams.set("s", "featured");
    const res = await fetch(pageUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_MS),
    });
    if (!res.ok) return "";
    return res.text();
  } catch {
    return "";
  }
}

function parseAny(html: string): AmazonWinnerHit[] {
  if (!html || isCaptchaPage(html)) return [];
  const fromHtml = parseAmazonSearchHtml(html);
  if (fromHtml.length) return fromHtml;
  return parseAmazonSearchMarkdown(html);
}

function richer(current: AmazonWinnerHit[], nextHtml: string): AmazonWinnerHit[] {
  const next = parseAny(nextHtml);
  return next.length > current.length ? next : current;
}

/** Public Amazon search. No seller account. Featured = mixed results, not the same review-rank bestsellers. */
export async function searchAmazonWinnersPage(opts: {
  keywords: string;
  pageOrigin?: string;
  sort?: "review-rank" | "featured";
}): Promise<AmazonWinnerHit[]> {
  const keywords = String(opts.keywords || "").trim();
  if (!keywords) return [];
  const sort = opts.sort || "review-rank";
  const url = amazonSearchUrl(keywords, sort);
  let hits: AmazonWinnerHit[] = [];

  try {
    hits = richer(hits, await readUrl(url, IPHONE_UA));
  } catch {
    /* try other paths */
  }
  if (hits.length < 4 && opts.pageOrigin) {
    hits = richer(hits, await fetchViaEdge(opts.pageOrigin, keywords, sort));
  }
  if (hits.length < 4) {
    try {
      hits = richer(hits, await readUrl(url, DESKTOP_UA));
    } catch {
      /* keep what we have */
    }
  }
  if (hits.length < 4) {
    hits = richer(hits, await fetchViaReader(url));
  }
  return hits;
}
