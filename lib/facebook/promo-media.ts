import { amazonAsinImageCandidates } from "@/lib/amazon/asin-image";

/** Known-bad for Facebook scrapers: ads widgets + ASIN placeholder GIFs (1×1). */
export function isWeakFacebookPictureUrl(url: string | null | undefined): boolean {
  const u = String(url || "").trim();
  if (!u || !/^https?:\/\//i.test(u)) return true;
  if (/amazon-adsystem\.com/i.test(u)) return true;
  // Classic ASIN placeholder often returns transparent 1×1 — blank FB cards
  if (/\/images\/P\/[A-Z0-9]{10}\./i.test(u)) return true;
  if (/\/P\/[A-Z0-9]{10}\.(?:01\.)?(?:LZZZZZZZ|MAIN)/i.test(u)) return true;
  return false;
}

function pictureScore(url: string): number {
  const u = String(url || "").trim();
  if (!/^https?:\/\//i.test(u)) return -1;
  if (isWeakFacebookPictureUrl(u)) return 5;
  // Our CDN first — Facebook scrapes these reliably (Amazon often blanks out)
  if (/supabase\.co\/storage|cloudinary\.com/i.test(u)) return 200;
  if (/higlou\.|vercel\.app\/_next\/image/i.test(u)) return 190;
  // Real Amazon product images (I/{id}) — only when CDN is unavailable
  if (/m\.media-amazon\.com\/images\/I\//i.test(u)) return 100;
  if (/media-amazon\.com\/images\/I\//i.test(u)) return 95;
  if (/images-na\.ssl-images-amazon\.com\/images\/I\//i.test(u)) return 90;
  if (/m\.media-amazon\.com\//i.test(u)) return 70;
  return 40;
}

/**
 * Pick the best picture URL for Facebook Graph `child_attachments.picture`.
 * Prefer Keepa / listing CDN `I/` images over ads-system widgets and P/ASIN stubs.
 */
export function facebookFriendlyPictureUrl(
  imageUrl: string | null | undefined,
  asin?: string | null,
  fallbacks: Array<string | null | undefined> = [],
): string {
  const id = String(asin || "")
    .trim()
    .toUpperCase();
  const asinOk = /^[A-Z0-9]{10}$/.test(id);

  const candidates = [
    imageUrl,
    ...fallbacks,
    ...(asinOk
      ? [
          // Last-resort ASIN stubs — weak, but better than empty if nothing else
          ...amazonAsinImageCandidates(id).filter(
            (u) => !/amazon-adsystem/i.test(u),
          ),
        ]
      : []),
  ]
    .map((u) => String(u || "").trim())
    .filter((u, i, arr) => Boolean(u) && arr.indexOf(u) === i);

  if (!candidates.length) return "";

  const ranked = [...candidates].sort(
    (a, b) => pictureScore(b) - pictureScore(a),
  );
  const best = ranked[0]!;
  // Prefer a non-weak URL when available
  const strong = ranked.find((u) => !isWeakFacebookPictureUrl(u));
  return strong || best;
}

/**
 * Short product name for FB carousel cards — retail-readable, not a full ASIN dump.
 * ~36 chars at a word boundary (FB truncates aggressively on mobile).
 */
export function shortenFacebookCardTitle(
  title: string,
  maxChars = 36,
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
