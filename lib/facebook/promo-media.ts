import { amazonAsinImageCandidates } from "@/lib/amazon/asin-image";

/**
 * Facebook Graph `picture` often fails on amazon-adsystem widget URLs
 * (blank cards / dropped child_attachments). Prefer direct CDN images.
 */
export function facebookFriendlyPictureUrl(
  imageUrl: string | null | undefined,
  asin?: string | null,
): string {
  const raw = String(imageUrl || "").trim();
  const id = String(asin || "")
    .trim()
    .toUpperCase();
  const asinOk = /^[A-Z0-9]{10}$/.test(id);

  const fromAsin = asinOk
    ? [
        `https://m.media-amazon.com/images/P/${id}.01._SCLZZZZZZZ_SX500_.jpg`,
        `https://m.media-amazon.com/images/P/${id}.01._SCLZZZZZZZ_.jpg`,
        `https://images-na.ssl-images-amazon.com/images/P/${id}.01._SCLZZZZZZZ_.jpg`,
        `https://images-na.ssl-images-amazon.com/images/P/${id}.01.MAIN._AC_SX500_.jpg`,
        ...amazonAsinImageCandidates(id),
      ]
    : [];

  const isAdsWidget = /amazon-adsystem\.com/i.test(raw);
  const isDirectCdn =
    /^https?:\/\//i.test(raw) &&
    /(m\.media-amazon\.com|images-na\.ssl-images-amazon\.com|media-amazon\.com)/i.test(
      raw,
    );

  if (isDirectCdn) return raw;
  if (isAdsWidget && fromAsin[0]) return fromAsin[0]!;
  if (/^https?:\/\//i.test(raw) && !isAdsWidget) return raw;
  if (fromAsin[0]) return fromAsin[0]!;
  return /^https?:\/\//i.test(raw) ? raw : "";
}

/**
 * Short product name for FB carousel cards — retail-readable, not a full ASIN dump.
 * ~40 chars at a word boundary.
 */
export function shortenFacebookCardTitle(
  title: string,
  maxChars = 40,
): string {
  const clean = String(title || "")
    .replace(/^ASIN\s+[A-Z0-9]{10}\b/i, "")
    .replace(/\bB0[A-Z0-9]{8}\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!clean) return "Deal";
  if (clean.length <= maxChars) return clean;

  const cut = clean.slice(0, maxChars);
  const boundary = Math.max(
    cut.lastIndexOf(" "),
    cut.lastIndexOf("-"),
    cut.lastIndexOf(","),
  );
  const base =
    boundary >= Math.floor(maxChars * 0.45)
      ? cut.slice(0, boundary)
      : cut.trim();
  return `${base.replace(/[\s,\-–—]+$/g, "")}…`;
}
