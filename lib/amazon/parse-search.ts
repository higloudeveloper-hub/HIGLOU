import { isCaptchaPage } from "@/lib/amazon/parse-product";
import type { AmazonWinnerHit } from "@/lib/amazon/winner-rank";

function numberFromUnknown(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function decode(value: string): string {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function emptyHit(asin: string): AmazonWinnerHit {
  return {
    asin,
    title: "",
    brand: "",
    imageUrl: "",
    salesRank: null,
    salesRankLabel: "Amazon search",
    browseNodeId: "",
    browseNodeName: "",
    rating: null,
    reviewCount: null,
    amazonPrice: null,
    ebayPrice: null,
    ebayCount: null,
    opportunity: "thin",
  };
}

function parseCard(chunk: string, asin: string): AmazonWinnerHit {
  const hit = emptyHit(asin);
  const title =
    chunk.match(/<h2[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i)?.[1] ||
    chunk.match(/<h2[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] ||
    "";
  hit.title = decode(title.replace(/<[^>]+>/g, " "));
  const rating =
    numberFromUnknown(chunk.match(/([0-9.]+)\s+out of\s+5/i)?.[1]) ??
    numberFromUnknown(chunk.match(/aria-label="([0-9.]+) out of 5/i)?.[1]);
  hit.rating = rating != null && rating >= 0 && rating <= 5 ? rating : null;
  const reviews =
    numberFromUnknown(
      chunk.match(/([0-9,]+)\s+(?:ratings|reviews)\b/i)?.[1],
    ) ??
    numberFromUnknown(
      chunk.match(/aria-label="[^"]*?([0-9,]+)\s+ratings/i)?.[1],
    );
  hit.reviewCount = reviews != null && reviews >= 0 ? reviews : null;
  const dollars = chunk.match(/a-price-whole[^>]*>\s*([0-9,]+)/i)?.[1];
  const cents = chunk.match(/a-price-fraction[^>]*>\s*([0-9]{2})/i)?.[1];
  const offscreen = chunk.match(/a-offscreen[^>]*>\s*\$([0-9,]+\.\d{2})/i)?.[1];
  const plain = chunk.match(/\$([0-9]+(?:\.[0-9]{2})?)/)?.[1];
  if (dollars) {
    const n = Number(`${dollars.replace(/,/g, "")}.${cents || "00"}`);
    hit.amazonPrice = Number.isFinite(n) && n > 0 ? n : null;
  } else if (offscreen) {
    hit.amazonPrice = numberFromUnknown(offscreen);
  } else if (plain) {
    hit.amazonPrice = numberFromUnknown(plain);
  }
  const image =
    chunk.match(
      /src="(https:\/\/[^"]+(?:media-amazon|ssl-images-amazon)[^"]+)"/i,
    )?.[1] || "";
  hit.imageUrl = image.replace(/&amp;/g, "&");
  return hit;
}

/** Parse Amazon search results HTML into ranked product hits. */
export function parseAmazonSearchHtml(html: string): AmazonWinnerHit[] {
  if (!html || isCaptchaPage(html)) return [];
  const hits: AmazonWinnerHit[] = [];
  const seen = new Set<string>();
  const re = /data-asin="([A-Z0-9]{10})"/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const asin = match[1].toUpperCase();
    if (seen.has(asin)) continue;
    const tagStart = html.lastIndexOf("<div", match.index);
    const tag = html.slice(Math.max(0, tagStart), match.index + 80);
    if (!/s-search-result|s-result-item/i.test(tag)) continue;
    if (/AdHolder|s-widget-sponsored|aria-label="Sponsored"/i.test(tag)) {
      continue;
    }
    const chunk = html.slice(match.index, match.index + 5500);
    seen.add(asin);
    hits.push(parseCard(chunk, asin));
    if (hits.length >= 16) break;
  }
  return hits;
}

/** Parse a Jina-style Amazon search page when HTML is blocked. */
export function parseAmazonSearchMarkdown(text: string): AmazonWinnerHit[] {
  const body = String(text || "");
  if (!body || isCaptchaPage(body)) return [];
  const hits: AmazonWinnerHit[] = [];
  const seen = new Set<string>();
  const re = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body))) {
    const asin = match[1].toUpperCase();
    if (seen.has(asin)) continue;
    seen.add(asin);
    const start = Math.max(0, match.index - 400);
    const chunk = body.slice(start, match.index + 500);
    const hit = emptyHit(asin);
    const title =
      chunk.match(/\[([^\]]{8,180})\]\(/)?.[1] ||
      chunk.match(/^#{1,3}\s+(.{8,180})$/m)?.[1] ||
      "";
    hit.title = decode(title);
    hit.rating = numberFromUnknown(
      chunk.match(/([0-9.]+)\s+out of\s+5/i)?.[1],
    );
    hit.reviewCount = numberFromUnknown(
      chunk.match(/([0-9,]+)\s+(?:ratings|reviews)\b/i)?.[1],
    );
    hit.amazonPrice = numberFromUnknown(
      chunk.match(/\$([0-9]+(?:\.[0-9]{2})?)/)?.[1],
    );
    hits.push(hit);
    if (hits.length >= 16) break;
  }
  return hits;
}
