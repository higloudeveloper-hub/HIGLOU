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
    u.hash = "";
    // Amazon CDN paths break if we re-encode image ids.
    if (/amazon|media-amazon|ssl-images-amazon/i.test(u.hostname)) {
      return u.toString();
    }
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
    return u.toString();
  } catch {
    return null;
  }
}

function isAmazonCdnUrl(url: string): boolean {
  return /amazon|media-amazon|ssl-images-amazon/i.test(url);
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

  const res = await fetch(sourceUrl, {
    cache: "no-store",
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) {
    throw new Error(`Could not fetch image (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** eBay Picture Policy: longest side must be at least 500px. */
export const EBAY_MIN_LONG_SIDE = 500;
const EBAY_TARGET_LONG_SIDE = 1600;
const EBAY_UPSCALE_LONG_SIDE = 800;
const EBAY_SKIP_BELOW = 80;

/**
 * JPEG for EPS upload. Upscales 80–499px photos so Amazon og:image crops
 * (often ~432px) still pass eBay 25002. Skips tiny icons.
 */
export async function prepareEbayListingJpeg(
  input: Buffer,
): Promise<Buffer | null> {
  const meta = await sharp(input, { failOn: "none" }).rotate().metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const longest = Math.max(width, height);
  if (longest < EBAY_SKIP_BELOW) return null;

  const needsUpscale = longest < EBAY_MIN_LONG_SIDE;
  const target = needsUpscale ? EBAY_UPSCALE_LONG_SIDE : EBAY_TARGET_LONG_SIDE;

  return sharp(input, { failOn: "none" })
    .rotate()
    .resize({
      width: target,
      height: target,
      fit: "inside",
      withoutEnlargement: !needsUpscale,
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

    if (isAmazonCdnUrl(normalized) && !isEbayEpsUrl(normalized)) {
      try {
        out.push(await createEbayEpsFromUrl(options.accessToken, normalized));
        continue;
      } catch (amazonEpsError) {
        errors.push(
          amazonEpsError instanceof Error
            ? amazonEpsError.message
            : String(amazonEpsError),
        );
      }
    }

    try {
      const input = await fetchImageBuffer(normalized);
      const sourceMeta = await sharp(input, { failOn: "none" }).rotate().metadata();
      const sourceLong = Math.max(sourceMeta.width ?? 0, sourceMeta.height ?? 0);

      if (isEbayEpsUrl(normalized) && sourceLong >= EBAY_MIN_LONG_SIDE) {
        out.push(normalized);
        continue;
      }

      const jpeg = await prepareEbayListingJpeg(input);
      if (!jpeg) continue;

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

      if (sourceLong >= EBAY_MIN_LONG_SIDE) {
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
