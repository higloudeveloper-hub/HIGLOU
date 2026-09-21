/**
 * Trust helpers: every Amazon hop shared on Facebook must carry Associate tag=.
 * No tag → no commission. Prefer failing closed over publishing a bare /dp/ URL.
 */

import { buildAmazonAssociatesUrl } from "@/lib/monetization/channels/affiliate";
import { getAmazonAssociateHost } from "@/lib/monetization/affiliate/amazon-associates";

const ASIN_RE = /^[A-Z0-9]{10}$/;

export function isValidAsin(value: string | null | undefined): boolean {
  return ASIN_RE.test(String(value || "").trim().toUpperCase());
}

export function extractAsinFromAmazonUrl(url: string): string | null {
  const raw = String(url || "").trim();
  if (!raw) return null;
  const dp = raw.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  if (dp?.[1]) return dp[1].toUpperCase();
  return null;
}

/** True when URL is an amazon.* product link (or amzn short). */
export function isAmazonProductUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("amazon.") || host === "amzn.to" || host.endsWith(".amzn.to")) {
      return true;
    }
  } catch {
    return false;
  }
  return /\/(?:dp|gp\/product)\//i.test(url);
}

/** Reads tag= from an Amazon product URL (null if missing/empty). */
export function readAssociateTagFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const tag = (u.searchParams.get("tag") || "").trim();
    return tag || null;
  } catch {
    return null;
  }
}

export function amazonUrlHasAssociateTag(
  url: string,
  expectedTag?: string | null,
): boolean {
  const tag = readAssociateTagFromUrl(url);
  if (!tag) return false;
  if (!isAmazonProductUrl(url)) return false;
  const expected = String(expectedTag || "").trim();
  if (expected && tag.toLowerCase() !== expected.toLowerCase()) return false;
  return true;
}

/**
 * Ensure destination is amazon.com/dp/ASIN?tag=YOURTAG.
 * Rebuilds from ASIN + tag when the incoming URL is bare or has the wrong tag.
 */
export function ensureTaggedAmazonDestination(opts: {
  asin?: string | null;
  destinationUrl?: string | null;
  associateTag: string;
}): string | null {
  const tag = String(opts.associateTag || "").trim();
  if (!tag) return null;

  const fromUrl = opts.destinationUrl
    ? extractAsinFromAmazonUrl(opts.destinationUrl)
    : null;
  const asin = String(opts.asin || fromUrl || "")
    .trim()
    .toUpperCase();
  if (!isValidAsin(asin)) return null;

  if (
    opts.destinationUrl &&
    amazonUrlHasAssociateTag(opts.destinationUrl, tag)
  ) {
    return opts.destinationUrl;
  }

  return buildAmazonAssociatesUrl({
    asin,
    associateTag: tag,
    marketplaceHost: getAmazonAssociateHost(),
  });
}

/** Path or absolute URL for a smart link (/go/slug). */
export function isSmartGoPath(url: string): boolean {
  const raw = String(url || "").trim();
  if (!raw) return false;
  try {
    const u = new URL(raw, "https://higlou.local");
    return /^\/go\/[a-z0-9]+$/i.test(u.pathname);
  } catch {
    return /^\/go\/[a-z0-9]+$/i.test(raw);
  }
}

export function smartGoSlug(url: string): string | null {
  const raw = String(url || "").trim();
  try {
    const u = new URL(raw, "https://higlou.local");
    const m = u.pathname.match(/^\/go\/([a-z0-9]+)$/i);
    return m?.[1]?.toLowerCase() || null;
  } catch {
    const m = raw.match(/^\/go\/([a-z0-9]+)$/i);
    return m?.[1]?.toLowerCase() || null;
  }
}
