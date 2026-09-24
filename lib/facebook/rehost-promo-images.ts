import { randomUUID } from "crypto";
import { resolveImageMime } from "@/config/supported-image-formats";
import { catalogImageFetchHeaders } from "@/lib/images/catalog-hosts";
import { tryLoadSharp } from "@/lib/images/load-sharp";
import {
  ensureProductImagesBucket,
  PRODUCT_IMAGES_BUCKET,
} from "@/lib/images/storage";
import { getPublicSupabaseUrl } from "@/lib/images/url-sanitize";
import { createAdminClient } from "@/lib/supabase/admin";
import { isWeakFacebookPictureUrl } from "@/lib/facebook/promo-media";

const MIN_BYTES = 2_500;
const MIN_EDGE = 80;

function publicObjectUrl(path: string): string {
  const encoded = path
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${getPublicSupabaseUrl()}/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/${encoded}`;
}

/** Already hosted where Facebook scrapers can fetch without Amazon blocks. */
export function isFacebookStableHost(url: string): boolean {
  const u = String(url || "").trim();
  if (!/^https?:\/\//i.test(u)) return false;
  if (isWeakFacebookPictureUrl(u)) return false;
  return /supabase\.co\/storage|cloudinary\.com|higlou\.|vercel\.app\/_next\/image/i.test(
    u,
  );
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const headers = {
      Accept: "image/jpeg,image/png,image/webp;q=0.9,*/*;q=0.5",
      ...(catalogImageFetchHeaders(url) || {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      }),
    };
    const res = await fetch(url, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(18_000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength < MIN_BYTES) return null;
    return buf;
  } catch {
    return null;
  }
}

async function isRealProductImage(buf: Buffer): Promise<boolean> {
  if (buf.byteLength < MIN_BYTES) return false;
  const sharp = await tryLoadSharp();
  if (!sharp) {
    // GIF89a 1×1 stubs are tiny; anything past MIN_BYTES is good enough
    return true;
  }
  try {
    const meta = await sharp(buf, { failOn: "none" }).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w < MIN_EDGE || h < MIN_EDGE) return false;
    // Reject near-transparent placeholder GIFs
    if (meta.format === "gif" && w * h < 10_000) return false;
    return true;
  } catch {
    return false;
  }
}

async function toUploadableJpeg(buf: Buffer): Promise<{
  data: Buffer;
  mime: string;
  ext: string;
} | null> {
  const resolved = resolveImageMime(buf, "image/jpeg");
  if (!resolved.mime) return null;

  const sharp = await tryLoadSharp();
  if (!sharp) {
    const ext =
      resolved.mime === "image/png"
        ? "png"
        : resolved.mime === "image/webp"
          ? "webp"
          : "jpg";
    return { data: buf, mime: resolved.mime, ext };
  }

  try {
    const data = await sharp(buf, { failOn: "none" })
      .rotate()
      .resize({
        width: 1200,
        height: 1200,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
    return { data, mime: "image/jpeg", ext: "jpg" };
  } catch {
    return { data: buf, mime: resolved.mime, ext: "jpg" };
  }
}

async function mirrorOneUrl(
  url: string,
  userId: string,
  cardId: string,
): Promise<string | null> {
  const raw = await fetchImageBuffer(url);
  if (!raw || !(await isRealProductImage(raw))) return null;

  const uploadable = await toUploadableJpeg(raw);
  if (!uploadable) return null;

  await ensureProductImagesBucket();
  const admin = createAdminClient();
  const storagePath = `${userId}/facebook/${cardId}-${randomUUID()}.${uploadable.ext}`;
  const { error } = await admin.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(storagePath, uploadable.data, {
      contentType: uploadable.mime,
      upsert: false,
      cacheControl: "public, max-age=31536000, immutable",
    });
  if (error) return null;
  return publicObjectUrl(storagePath);
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
      out[index] = await fn(items[index]!, index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return out;
}

export type RehostCard = {
  id: string;
  imageUrl: string;
  imageFallbacks?: string[] | null;
};

/**
 * Re-host every promo card image onto our public CDN so Facebook Graph
 * `child_attachments.picture` always scrapes a real photo (not Amazon
 * ads-system / 1×1 GIF stubs that publish as blank cards).
 *
 * Fail closed: if any card cannot be mirrored, return which ones failed.
 */
export async function rehostPromoImagesForFacebook<T extends RehostCard>(
  cards: T[],
  userId: string,
): Promise<
  | { ok: true; cards: T[] }
  | { ok: false; error: string; failedIds: string[] }
> {
  if (!cards.length) {
    return { ok: false, error: "Sin productos para publicar.", failedIds: [] };
  }

  const results = await mapPool(cards, 3, async (card) => {
    const primary = String(card.imageUrl || "").trim();
    if (isFacebookStableHost(primary)) {
      return { id: card.id, imageUrl: primary };
    }

    const candidates = [
      primary,
      ...(card.imageFallbacks || []).map((u) => String(u || "").trim()),
    ].filter(
      (u, i, arr) =>
        Boolean(u) && /^https?:\/\//i.test(u) && arr.indexOf(u) === i,
    );

    // Prefer non-weak hosts first
    const ordered = [
      ...candidates.filter((u) => !isWeakFacebookPictureUrl(u)),
      ...candidates.filter((u) => isWeakFacebookPictureUrl(u)),
    ];

    for (const url of ordered) {
      if (isFacebookStableHost(url)) {
        return { id: card.id, imageUrl: url };
      }
      const mirrored = await mirrorOneUrl(url, userId, card.id);
      if (mirrored) return { id: card.id, imageUrl: mirrored };
    }

    return { id: card.id, imageUrl: null as string | null };
  });

  const failedIds = results
    .filter((r) => !r.imageUrl)
    .map((r) => r.id);
  if (failedIds.length) {
    return {
      ok: false,
      error: `${failedIds.length} de ${cards.length} fotos no se pudieron preparar para Facebook (imagen rota o bloqueada). Cambiá esas fotos y reintentá — no publicamos vitrinas incompletas.`,
      failedIds,
    };
  }

  const byId = new Map(results.map((r) => [r.id, r.imageUrl!]));
  return {
    ok: true,
    cards: cards.map((c) => ({
      ...c,
      imageUrl: byId.get(c.id) || c.imageUrl,
    })),
  };
}
