import { randomUUID } from "crypto";
import sharp from "sharp";
import {
  ensureProductImagesBucket,
  PRODUCT_IMAGES_BUCKET,
} from "@/lib/images/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanHttpsUrl, getPublicSupabaseUrl } from "@/lib/images/url-sanitize";
import {
  createEbayEpsFromUrl,
  uploadJpegToEbayEps,
} from "@/lib/ebay/eps-images";

/**
 * eBay Inventory imageUrls must be absolute https URLs.
 * Strips embedded newlines (bad Vercel env paste) and re-encodes path.
 */
export function normalizeEbayImageUrl(raw: string): string | null {
  const trimmed = cleanHttpsUrl(raw);
  if (!trimmed || !/^https:\/\//i.test(trimmed)) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "https:") return null;
    if (/^(localhost|127\.0\.0\.1)$/i.test(u.hostname)) return null;
    u.pathname = u.pathname
      .split("/")
      .map((seg) => {
        if (!seg) return "";
        try {
          return encodeURIComponent(decodeURIComponent(seg));
        } catch {
          return encodeURIComponent(seg);
        }
      })
      .join("/");
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

function publicObjectUrl(path: string): string {
  const base = getPublicSupabaseUrl();
  const encoded = path
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${base}/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/${encoded}`;
}

async function fetchImageBuffer(sourceUrl: string): Promise<Buffer> {
  const res = await fetch(sourceUrl, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Could not fetch image (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function toJpegBuffer(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

async function mirrorJpegToSupabase(
  jpeg: Buffer,
  userId: string,
): Promise<string> {
  await ensureProductImagesBucket();
  const admin = createAdminClient();
  const storagePath = `${userId}/ebay-publish/${randomUUID()}.jpg`;
  const { error } = await admin.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(storagePath, jpeg, {
      contentType: "image/jpeg",
      upsert: false,
    });
  if (error) {
    throw new Error(`Failed to store eBay-compatible JPEG: ${error.message}`);
  }
  return publicObjectUrl(storagePath);
}

/**
 * Produce eBay Inventory imageUrls hosted on eBay Picture Services (EPS).
 * Self-hosted Supabase URLs often fail silently on Production drafts — EPS is reliable.
 */
export async function ensureEbayCompatibleImageUrls(options: {
  urls: string[];
  userId: string;
  accessToken: string;
}): Promise<string[]> {
  const out: string[] = [];
  const errors: string[] = [];

  for (const raw of options.urls) {
    const normalized = normalizeEbayImageUrl(raw);
    if (!normalized) continue;

    // Already on EPS — keep as-is.
    if (/^https:\/\/i\.ebayimg\.com\//i.test(normalized)) {
      out.push(normalized);
      continue;
    }

    try {
      const input = await fetchImageBuffer(normalized);
      const jpeg = await toJpegBuffer(input);

      // Prefer binary upload to EPS (eBay never needs to reach Supabase).
      try {
        out.push(
          await uploadJpegToEbayEps(
            options.accessToken,
            jpeg,
            `${options.userId.slice(0, 8)}.jpg`,
          ),
        );
        continue;
      } catch (epsFileError) {
        errors.push(
          epsFileError instanceof Error
            ? epsFileError.message
            : String(epsFileError),
        );
      }

      // Fallback: mirror to public Supabase then createImageFromUrl.
      const publicJpegUrl = await mirrorJpegToSupabase(jpeg, options.userId);
      try {
        out.push(
          await createEbayEpsFromUrl(options.accessToken, publicJpegUrl),
        );
        continue;
      } catch (epsUrlError) {
        errors.push(
          epsUrlError instanceof Error
            ? epsUrlError.message
            : String(epsUrlError),
        );
        // Last resort: self-hosted HTTPS JPEG (may not render on Production).
        out.push(publicJpegUrl);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const unique = [...new Set(out)].slice(0, 24);
  if (!unique.length) {
    throw new Error(
      `No eBay-compatible image URLs. ${errors[0] || "Re-upload photos as JPEG/PNG over HTTPS."}`,
    );
  }
  return unique;
}
