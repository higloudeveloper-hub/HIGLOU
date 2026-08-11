import { randomUUID } from "crypto";
import sharp from "sharp";
import {
  ensureProductImagesBucket,
  PRODUCT_IMAGES_BUCKET,
} from "@/lib/images/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanHttpsUrl, getPublicSupabaseUrl } from "@/lib/images/url-sanitize";

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

async function convertAndReuploadAsJpeg(
  sourceUrl: string,
  userId: string,
): Promise<string> {
  const res = await fetch(sourceUrl, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Could not fetch image for eBay conversion (${res.status})`);
  }
  const input = Buffer.from(await res.arrayBuffer());
  const jpeg = await sharp(input).jpeg({ quality: 90, mozjpeg: true }).toBuffer();

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
 * Produce eBay-safe https JPEG image URLs.
 * Re-hosts as JPEG so Sandbox gets clean public .jpg URLs.
 */
export async function ensureEbayCompatibleImageUrls(options: {
  urls: string[];
  userId: string;
}): Promise<string[]> {
  const out: string[] = [];
  for (const raw of options.urls) {
    const normalized = normalizeEbayImageUrl(raw);
    if (!normalized) continue;
    try {
      out.push(await convertAndReuploadAsJpeg(normalized, options.userId));
    } catch {
      // Skip images we cannot fetch/convert.
    }
  }

  const unique = [...new Set(out)].slice(0, 24);
  if (!unique.length) {
    throw new Error(
      "No eBay-compatible image URLs. Re-upload photos as JPEG or PNG (HTTPS public URLs).",
    );
  }
  return unique;
}
