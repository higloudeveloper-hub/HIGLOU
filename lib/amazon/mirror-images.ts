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

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

async function fetchBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": IPHONE_UA,
        Accept: "image/jpeg,image/png,image/webp;q=0.8,*/*;q=0.5",
        Referer: "https://www.amazon.com/",
        "Accept-Language": "en-US,en;q=0.9",
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

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index], index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return out;
}

export async function mirrorAmazonImages(options: {
  imageUrls: string[];
  userId: string;
  asin: string;
}): Promise<MirroredAmazonImage[]> {
  await ensureProductImagesBucket();
  const admin = createAdminClient();
  const urls = options.imageUrls.slice(0, DEFAULT_VALUES.maxImages);

  const rows = await mapPool(urls, 4, async (imageUrl, index) => {
    try {
      const raw = await downloadLargestAmazonImage(imageUrl);
      if (!raw) return null;
      const resolved = resolveImageMime(raw, "image/jpeg");
      if (!resolved.mime) return null;
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
      if (error) return null;
      const row: MirroredAmazonImage = {
        publicUrl: publicObjectUrl(storagePath),
        storagePath,
        fileName,
        mimeType: resolved.mime,
        sizeBytes: compressed.byteLength,
      };
      return row;
    } catch {
      return null;
    }
  });

  return rows.filter((row): row is MirroredAmazonImage => Boolean(row));
}
