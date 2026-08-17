import { DEFAULT_VALUES } from "@/config/default-values";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { compressImageBuffer } from "@/lib/images/compress-server";
import {
  ensureProductImagesBucket,
  PRODUCT_IMAGES_BUCKET,
} from "@/lib/images/storage";
import { getPublicSupabaseUrl } from "@/lib/images/url-sanitize";
import { resolveImageMime } from "@/config/supported-image-formats";
import { amazonImageCandidates } from "@/lib/amazon/parse-product";
import { EBAY_MIN_LONG_SIDE } from "@/lib/ebay/ensure-ebay-images";

function publicObjectUrl(path: string): string {
  const encoded = path
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${getPublicSupabaseUrl()}/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/${encoded}`;
}

export type MirroredAmazonImage = {
  publicUrl: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

async function fetchBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: "https://www.amazon.com/",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function downloadLargestAmazonImage(url: string): Promise<Buffer | null> {
  let best: Buffer | null = null;
  let bestLong = 0;

  for (const candidate of amazonImageCandidates(url)) {
    const raw = await fetchBuffer(candidate);
    if (!raw) continue;
    try {
      const meta = await sharp(raw, { failOn: "none" }).metadata();
      const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
      if (longest > bestLong) {
        best = raw;
        bestLong = longest;
      }
      if (longest >= 1200) break;
    } catch {
      /* try next variant */
    }
  }

  if (!best || bestLong < 80) return null;
  if (bestLong >= EBAY_MIN_LONG_SIDE) return best;

  const meta = await sharp(best, { failOn: "none" }).metadata();
  const width = meta.width ?? bestLong;
  const height = meta.height ?? bestLong;
  const scale = 800 / bestLong;
  return sharp(best, { failOn: "none" })
    .resize({
      width: Math.max(800, Math.round(width * scale)),
      height: Math.max(800, Math.round(height * scale)),
      fit: "inside",
    })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

export async function mirrorAmazonImages(options: {
  imageUrls: string[];
  userId: string;
  asin: string;
}): Promise<MirroredAmazonImage[]> {
  await ensureProductImagesBucket();
  const admin = createAdminClient();
  const mirrored: MirroredAmazonImage[] = [];

  for (const [index, imageUrl] of options.imageUrls.entries()) {
    try {
      const raw = await downloadLargestAmazonImage(imageUrl);
      if (!raw) continue;
      const resolved = resolveImageMime(raw, "image/jpeg");
      if (!resolved.mime) continue;
      const compressed = await compressImageBuffer(raw);
      const ext =
        resolved.mime === "image/png"
          ? "png"
          : resolved.mime === "image/webp"
            ? "webp"
            : "jpg";
      const fileName = `${options.asin}-${index + 1}.${ext}`;
      const storagePath = `${options.userId}/amazon/${options.asin}/${randomUUID()}-${fileName}`;
      const { error } = await admin.storage
        .from(PRODUCT_IMAGES_BUCKET)
        .upload(storagePath, compressed, {
          contentType: resolved.mime,
          upsert: false,
        });
      if (error) continue;
      mirrored.push({
        publicUrl: publicObjectUrl(storagePath),
        storagePath,
        fileName,
        mimeType: resolved.mime,
        sizeBytes: compressed.byteLength,
      });
    } catch {
      /* skip one bad image */
    }
    if (mirrored.length >= DEFAULT_VALUES.maxImages) break;
  }

  return mirrored;
}
