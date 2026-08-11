import { randomUUID } from "crypto";
import sharp from "sharp";
import {
  ensureProductImagesBucket,
  PRODUCT_IMAGES_BUCKET,
} from "@/lib/images/storage";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * eBay Inventory imageUrls must be absolute https URLs.
 * Re-encode path segments and drop invalid entries.
 */
export function normalizeEbayImageUrl(raw: string): string | null {
  const trimmed = String(raw || "").trim();
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
    // Strip fragments; keep query only if needed for CDN (usually not for Supabase public).
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

function publicObjectUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required for public image URLs");
  }
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
 * Produce eBay-safe https image URLs (JPEG/PNG/GIF/BMP/TIFF).
 * Always re-hosts as JPEG so eBay gets a clean public URL with .jpg extension
 * (avoids WebP/HEIC and odd path encoding that Sandbox rejects).
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
