import { DEFAULT_VALUES } from "@/config/default-values";
import { randomUUID } from "crypto";
import { tryLoadSharp } from "@/lib/images/load-sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { compressImageBuffer } from "@/lib/images/compress-server";
import {
  ensureProductImagesBucket,
  PRODUCT_IMAGES_BUCKET,
} from "@/lib/images/storage";
import { getPublicSupabaseUrl } from "@/lib/images/url-sanitize";
import { resolveImageMime } from "@/config/supported-image-formats";
import { coerceCatalogImageToJpeg } from "@/lib/images/coerce-catalog-image";
import { walmartImageCandidates } from "@/lib/walmart/parse-product";
import { EBAY_MIN_LONG_SIDE } from "@/lib/ebay/ensure-ebay-images";

function publicObjectUrl(path: string): string {
  const encoded = path
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${getPublicSupabaseUrl()}/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/${encoded}`;
}

export type MirroredWalmartImage = {
  publicUrl: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

function looksLikeImage(raw: Buffer): boolean {
  if (raw.byteLength < 400) return false;
  const head = raw.subarray(0, 80).toString("utf8");
  return !/^\s*<(!doctype|html|head|body)/i.test(head);
}

async function fetchBuffer(url: string): Promise<Buffer | null> {
  for (const ua of [DESKTOP_UA, IPHONE_UA]) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": ua,
          Accept: "image/jpeg,image/png,image/webp;q=0.8,*/*;q=0.5",
          Referer: "https://www.walmart.com/",
          Origin: "https://www.walmart.com",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) continue;
      const raw = Buffer.from(await res.arrayBuffer());
      if (looksLikeImage(raw)) return raw;
    } catch {
      /* try next UA */
    }
  }
  return null;
}

async function downloadLargestWalmartImage(url: string): Promise<Buffer | null> {
  const sharp = await tryLoadSharp();
  let best: Buffer | null = null;
  let bestLong = 0;

  for (const candidate of walmartImageCandidates(url)) {
    const raw = await fetchBuffer(candidate);
    if (!raw) continue;
    if (!sharp) {
      if (!best || raw.byteLength > best.byteLength) {
        best = raw;
        bestLong = raw.byteLength;
      }
      continue;
    }
    try {
      const meta = await sharp(raw, { failOn: "none" }).metadata();
      const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
      if (longest < 80) continue;
      if (longest > bestLong) {
        best = raw;
        bestLong = longest;
      }
      if (longest >= 1200) break;
    } catch {
      /* try next variant */
    }
  }

  if (!best) return null;
  if (!sharp) return best;
  if (bestLong >= EBAY_MIN_LONG_SIDE) return best;

  const meta = await sharp(best, { failOn: "none" }).metadata();
  const width = meta.width ?? bestLong;
  const height = meta.height ?? bestLong;
  const scale = 800 / Math.max(1, bestLong);
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

export async function mirrorWalmartImages(options: {
  imageUrls: string[];
  userId: string;
  itemId: string;
}): Promise<MirroredWalmartImage[]> {
  await ensureProductImagesBucket();
  const admin = createAdminClient();
  const urls = options.imageUrls.slice(0, DEFAULT_VALUES.maxImages);

  const rows = await mapPool(urls, 4, async (imageUrl, index) => {
    try {
      const raw = await downloadLargestWalmartImage(imageUrl);
      if (!raw) return null;
      const jpeg =
        (await coerceCatalogImageToJpeg(raw)) ||
        (resolveImageMime(raw, "image/jpeg").mime ? raw : null);
      if (!jpeg) return null;
      const resolved = resolveImageMime(jpeg, "image/jpeg");
      if (!resolved.mime) return null;
      const compressed = await compressImageBuffer(jpeg);
      const fileName = `${options.itemId}-${index + 1}.jpg`;
      const storagePath = `${options.userId}/walmart/${options.itemId}/${randomUUID()}-${fileName}`;
      const { error } = await admin.storage
        .from(PRODUCT_IMAGES_BUCKET)
        .upload(storagePath, compressed, {
          contentType: "image/jpeg",
          upsert: false,
        });
      if (error) return null;
      const row: MirroredWalmartImage = {
        publicUrl: publicObjectUrl(storagePath),
        storagePath,
        fileName,
        mimeType: "image/jpeg",
        sizeBytes: compressed.byteLength,
      };
      return row;
    } catch {
      return null;
    }
  });

  return rows.filter((row): row is MirroredWalmartImage => Boolean(row));
}
