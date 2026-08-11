import sharp from "sharp";
import { PRODUCT_IMAGES_BUCKET } from "@/lib/images/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanHttpsUrl } from "@/lib/images/url-sanitize";
import {
  createEbayEpsFromUrl,
  isEbayEpsUrl,
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

async function fetchImageBuffer(sourceUrl: string): Promise<Buffer> {
  // Prefer service-role download for Supabase public URLs (more reliable on Vercel).
  const marker = `/object/public/${PRODUCT_IMAGES_BUCKET}/`;
  const idx = sourceUrl.indexOf(marker);
  if (idx >= 0) {
    const path = decodeURIComponent(sourceUrl.slice(idx + marker.length).split("?")[0] || "");
    if (path) {
      const admin = createAdminClient();
      const { data, error } = await admin.storage
        .from(PRODUCT_IMAGES_BUCKET)
        .download(path);
      if (!error && data) {
        return Buffer.from(await data.arrayBuffer());
      }
    }
  }

  const res = await fetch(sourceUrl, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Could not fetch image (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function toJpegBuffer(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

/**
 * Produce Inventory imageUrls hosted on eBay Picture Services only.
 * Never returns Supabase/self-hosted URLs — those publish drafts without visible photos.
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

    if (isEbayEpsUrl(normalized)) {
      out.push(normalized);
      continue;
    }

    try {
      const input = await fetchImageBuffer(normalized);
      const jpeg = await toJpegBuffer(input);

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

      // Last Media attempt: ask eBay to pull our public HTTPS URL.
      try {
        out.push(
          await createEbayEpsFromUrl(options.accessToken, normalized),
        );
      } catch (epsUrlError) {
        errors.push(
          epsUrlError instanceof Error
            ? epsUrlError.message
            : String(epsUrlError),
        );
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const unique = [...new Set(out.filter(isEbayEpsUrl))].slice(0, 24);
  if (!unique.length) {
    throw new Error(
      `Could not host photos on eBay EPS. ${errors[0] || "Reconnect eBay in Settings and try again."}`,
    );
  }
  return unique;
}
