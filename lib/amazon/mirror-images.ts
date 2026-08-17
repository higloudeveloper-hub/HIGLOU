import { DEFAULT_VALUES } from "@/config/default-values";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { compressImageBuffer } from "@/lib/images/compress-server";
import {
  ensureProductImagesBucket,
  PRODUCT_IMAGES_BUCKET,
} from "@/lib/images/storage";
import { getPublicSupabaseUrl } from "@/lib/images/url-sanitize";
import { resolveImageMime } from "@/config/supported-image-formats";

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
      const res = await fetch(imageUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          Referer: "https://www.amazon.com/",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) continue;
      const raw = Buffer.from(await res.arrayBuffer());
      const resolved = resolveImageMime(raw, res.headers.get("content-type"));
      if (!resolved.mime) continue;
      const compressed = await compressImageBuffer(raw);
      const ext = resolved.mime === "image/png" ? "png" : resolved.mime === "image/webp" ? "webp" : "jpg";
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
