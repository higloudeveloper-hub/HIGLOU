/** Build eBay Item photo URL cell value. Official docs: separate with pipe |. Max 12. */
export function buildItemPhotoUrlValue(urls: string[]): string {
  const cleaned = urls
    .map((url) => url.trim().replaceAll(" ", "%20"))
    .filter((url) => /^https:\/\//i.test(url))
    .slice(0, 12);
  return cleaned.join("|");
}

export function generateSku(parts: {
  brand?: string;
  model?: string;
  size?: string;
  color?: string;
}): string {
  // eBay Inventory SKUs: alphanumeric only, max 50 (error 25707 if hyphens).
  const normalize = (value?: string) =>
    (value || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "")
      .slice(0, 16);

  const brand = normalize(parts.brand).slice(0, 4) || "ITEM";
  const model = normalize(parts.model).slice(0, 16) || "MODEL";
  const size = normalize(parts.size).slice(0, 6) || "SZ";
  const color = normalize(parts.color).slice(0, 6) || "CLR";
  return `${brand}${model}${size}${color}`.slice(0, 50);
}

/** Stable 32-bit fingerprint so the same Higlou SKU always maps to the same eBay label. */
function skuFingerprint(raw: string): string {
  let hash = 2166136261;
  const text = String(raw)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(7, "0");
}

/**
 * Amazon (`AMZ-B0…`) and Home Depot (`HD-123`) import SKUs. Keep those inside
 * Higlou for source lookup — never as the eBay Custom label.
 */
export function isMarketplaceImportSku(raw: string): boolean {
  const compact = String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return /^AMZ[A-Z0-9]{10}$/.test(compact) || /^HD\d{5,}$/.test(compact);
}

/**
 * eBay Custom label / Inventory SKU (alphanumeric, max 50 — error 25707).
 * Keep AMZ-/HD- SKUs in Higlou; send a neutral HG label so the listing
 * does not advertise Amazon or Home Depot as the source.
 */
export function toEbayInventorySku(raw: string): string {
  const original = String(raw || "").trim();
  if (isMarketplaceImportSku(original)) {
    return `HG${skuFingerprint(original)}`.slice(0, 50);
  }
  const cleaned = original
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 50);
  return cleaned || "ITEM";
}

const AMAZON_HOST =
  "amazon(?:\\.(?:com|ca|co\\.uk|de|fr|es|it|co\\.jp|in|com\\.mx|com\\.au|nl|se|pl|com\\.br|ae|sa|sg|com\\.tr))?";

/** Adult sexual wellness — must not land in Toys / Dolls. */
export const ADULT_SEXUAL_WELLNESS_RE =
  /\b(sex\s*doll|masturbat(?:or|ion)?|fleshlight|onahole|pocket\s*pussy|male\s*sex\s*toy|adult\s*sex\s*toy|realistic\s*(?:vagina|penis)|stroker)\b/i;

export function isAdultSexualWellnessText(text: string): boolean {
  return ADULT_SEXUAL_WELLNESS_RE.test(String(text || ""));
}

/**
 * eBay 25019: vulgar slang in title/description is blocked even when the
 * product is a legal adult item. Keep clinical category language.
 */
export function sanitizeEbayPolicyCopy(raw: string): string {
  let text = String(raw || "");
  const swaps: Array<[RegExp, string]> = [
    [/\bpocket\s*puss(?:y|ies)\b/gi, "male masturbator"],
    [/\bpuss(?:y|ies)\b/gi, "masturbator"],
    [/\bcunts?\b/gi, ""],
    [/\bfucks?\b/gi, ""],
    [/\bsluts?\b/gi, ""],
    [/\bwhores?\b/gi, ""],
    [/\bdicks?\b/gi, ""],
    [/\bcocks?\b/gi, ""],
  ];
  for (const [pattern, next] of swaps) {
    text = text.replace(pattern, next);
  }
  return text.replace(/\s{2,}/g, " ").replace(/\s+,/g, ",").trim();
}

/** eBay titles cannot carry Amazon page chrome like "Amazon.com -". */
export function toEbayListingTitle(raw: string): string {
  let title = sanitizeEbayPolicyCopy(
    String(raw || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );

  for (let i = 0; i < 5 && title; i++) {
    const next = title
      .replace(/^\s*\[?\s*sponsored\s*\]?\s*[-–—:]?\s*/i, "")
      .replace(new RegExp(`^${AMAZON_HOST}\\s*[-–—:|]+\\s*`, "i"), "")
      .replace(new RegExp(`\\s*[-–—:|]+\\s*${AMAZON_HOST}\\s*$`, "i"), "")
      .replace(new RegExp(`\\s*:\\s*${AMAZON_HOST}\\s*:.*$`, "i"), "")
      .replace(/^amazon\.com\s+/i, "")
      .replace(/^amazon\s+brand\s*[-–—:]\s*/i, "")
      .trim();
    if (next === title) break;
    title = next;
  }

  if (/^amazon(\.com)?$/i.test(title)) title = "";
  if (title.length > 80) {
    const clipped = title.slice(0, 80).replace(/\s+\S*$/, "").trim();
    title = clipped || title.slice(0, 80).trim();
  }
  return title;
}

export function buildEbayTitle(parts: {
  brand?: string;
  model?: string;
  type?: string;
  size?: string;
  pieces?: string | number | null;
  color?: string;
}): string {
  const tokens = [
    parts.brand,
    parts.model,
    parts.size,
    parts.pieces ? `${parts.pieces} Piece` : "",
    parts.type,
    parts.color,
  ]
    .map((t) => (t || "").trim())
    .filter(Boolean);

  let title = tokens.join(" ").replace(/\s+/g, " ").trim();
  if (title.length > 80) title = title.slice(0, 80).trim();
  return title;
}

export function buildExportFileName(parts: {
  brand?: string;
  model?: string;
  size?: string;
  title?: string;
  sku?: string;
  date?: Date;
}): string {
  const clean = (value?: string) =>
    (value || "")
      .replace(/[^a-zA-Z0-9]+/g, "")
      .slice(0, 24);

  const brand = clean(parts.brand);
  const model = clean(parts.model);
  const size = clean(parts.size);
  const title = clean(parts.title);
  const sku = clean(parts.sku);

  const label =
    [brand, model, size].filter(Boolean).join("_") ||
    title ||
    sku ||
    "Listing";

  const d = parts.date ?? new Date();
  const iso = d.toISOString().slice(0, 10);
  // Official Create Drafts upload type (first #INFO line must stay eBay's).
  return `Higlou_Draft_${label}_${iso}.csv`;
}

/**
 * Fetch/undici Headers require ByteString (code points ≤ 255).
 * Em/en dashes (—/–), arrows (→), and other Unicode break Response construction
 * with "Cannot convert argument to a ByteString...".
 */
export function toAsciiHttpHeaderValue(value: string): string {
  return value
    .replace(/[\u2010-\u2015\u2212]/g, "-") // hyphen variants + minus
    .replace(/\u2026/g, "...")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\u2192/g, "->")
    .replace(/\u2190/g, "<-")
    .replace(/[^\x20-\x7E]/g, (ch) => (ch === "\t" || ch === "\n" || ch === "\r" ? " " : ""))
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip to a safe quoted `filename=` token (ASCII only). */
export function toAsciiFileName(fileName: string, fallback = "Higlou_Export.csv"): string {
  const ascii = toAsciiHttpHeaderValue(fileName)
    .replace(/["\\]/g, "")
    .replace(/[/\\?%*:|<>]/g, "_")
    .replace(/\s+/g, "_");
  return ascii || fallback;
}

/**
 * RFC 5987 Content-Disposition: ASCII filename= plus UTF-8 filename*= for clients
 * that support unicode download names.
 */
export function buildAttachmentContentDisposition(fileName: string): string {
  const asciiName = toAsciiFileName(fileName);
  const utf8Name = encodeURIComponent(fileName.trim() || asciiName);
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`;
}
