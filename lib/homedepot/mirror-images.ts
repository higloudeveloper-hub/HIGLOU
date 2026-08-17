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
import { homeDepotImageCandidates, isLikelyHomeDepotPlaceholder } from "@/lib/homedepot/parse-product";
import { IPHONE_SAFARI_UA } from "@/lib/homedepot/mobile-gallery";
import { EBAY_MIN_LONG_SIDE } from "@/lib/ebay/ensure-ebay-images";

function publicObjectUrl(path: string): string {
  const encoded = path
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${getPublicSupabaseUrl()}/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/${encoded}`;
}

export type MirroredHomeDepotImage = {
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
        "User-Agent": IPHONE_SAFARI_UA,
        Accept: "image/jpeg,image/png,image/webp;q=0.8,*/*;q=0.5",
        Referer: "https://www.homedepot.com/",
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

async function downloadLargestHomeDepotImage(url: string): Promise<Buffer | null> {
  let best: Buffer | null = null;
  let bestLong = 0;

  for (const candidate of homeDepotImageCandidates(url)) {
    const raw = await fetchBuffer(candidate);
    if (!raw) continue;
    try {
      const meta = await sharp(raw, { failOn: "none" }).metadata();
      const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
      let stdev: number[] | undefined;
      try {
        const stats = await sharp(raw, { failOn: "none" }).stats();
        stdev = stats.channels.map((channel) => channel.stdev);
      } catch {
        stdev = undefined;
      }
      if (isLikelyHomeDepotPlaceholder(raw.byteLength, longest, stdev)) continue;
      if (longest > bestLong) {
        best = raw;
        bestLong = longest;
      }
      if (longest >= 1000) break;
    } catch {
      /* try next variant */
    }
  }

  if (!best || bestLong < 80) return null;
  if (bestLong < EBAY_MIN_LONG_SIDE) {
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

  const resolved = resolveImageMime(best, "image/jpeg");
  if (resolved.mime) return best;
  try {
    return await sharp(best, { failOn: "none" })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
  } catch {
    return null;
  }
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

export async function mirrorHomeDepotImages(options: {
  imageUrls: string[];
  userId: string;
  itemId: string;
}): Promise<MirroredHomeDepotImage[]> {
  await ensureProductImagesBucket();
  const admin = createAdminClient();
  const urls = options.imageUrls.slice(0, DEFAULT_VALUES.maxImages);

  const rows = await mapPool(urls, 4, async (imageUrl, index) => {
    try {
      const raw = await downloadLargestHomeDepotImage(imageUrl);
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
      const fileName = `${options.itemId}-${index + 1}.${ext}`;
      const storagePath = `${options.userId}/homedepot/${options.itemId}/${randomUUID()}-${fileName}`;
      const { error } = await admin.storage
        .from(PRODUCT_IMAGES_BUCKET)
        .upload(storagePath, compressed, {
          contentType: resolved.mime,
          upsert: false,
        });
      if (error) return null;
      const row: MirroredHomeDepotImage = {
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

  return rows.filter((row): row is MirroredHomeDepotImage => Boolean(row));
}
