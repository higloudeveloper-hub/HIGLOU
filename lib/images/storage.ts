import { catalogImageFetchHeaders } from "@/lib/images/catalog-hosts";
import { coerceCatalogImageToJpeg } from "@/lib/images/coerce-catalog-image";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ACCEPTED_UPLOAD_MIME_TYPES,
  SUPPORTED_IMAGE_MIME_TYPES,
} from "@/config/supported-image-formats";

export const PRODUCT_IMAGES_BUCKET =
  process.env.SUPABASE_PRODUCT_IMAGES_BUCKET || "product-images";

const STORAGE_ALLOWED_MIME_TYPES = [
  ...SUPPORTED_IMAGE_MIME_TYPES,
  ...ACCEPTED_UPLOAD_MIME_TYPES.filter(
    (m) => !(SUPPORTED_IMAGE_MIME_TYPES as readonly string[]).includes(m),
  ),
];

/**
 * Ensure the product images bucket exists and is publicly readable
 * so eBay CSV photo URLs and AI analysis can fetch HTTPS images.
 */
export async function ensureProductImagesBucket() {
  const admin = createAdminClient();
  const { data: buckets, error: listError } = await admin.storage.listBuckets();
  if (listError) {
    throw new Error(`Could not list storage buckets: ${listError.message}`);
  }

  const existing = (buckets ?? []).find((b) => b.name === PRODUCT_IMAGES_BUCKET);
  if (!existing) {
    const { error } = await admin.storage.createBucket(PRODUCT_IMAGES_BUCKET, {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: [...STORAGE_ALLOWED_MIME_TYPES],
    });
    if (error) {
      throw new Error(`Could not create bucket: ${error.message}`);
    }
    return { created: true, public: true };
  }

  if (!existing.public) {
    const { error } = await admin.storage.updateBucket(PRODUCT_IMAGES_BUCKET, {
      public: true,
    });
    if (error) {
      throw new Error(`Could not make bucket public: ${error.message}`);
    }
    return { created: false, public: true };
  }

  return { created: false, public: true };
}

/**
 * Download an image for analysis.
 * Prefers public HTTPS URL; falls back to service-role download by storage path.
 */
export async function fetchProductImageBuffer(options: {
  url: string;
  storagePath?: string;
}): Promise<Buffer> {
  const response = await fetch(options.url, {
    cache: "no-store",
    headers: catalogImageFetchHeaders(options.url),
  });
  if (response.ok) {
    const raw = Buffer.from(await response.arrayBuffer());
    if (/walmartimages|walmart\.com/i.test(options.url)) {
      const jpeg = await coerceCatalogImageToJpeg(raw);
      if (jpeg) return jpeg;
    }
    return raw;
  }

  if (options.storagePath) {
    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .download(options.storagePath);
    if (!error && data) {
      return Buffer.from(await data.arrayBuffer());
    }
  }

  // Try extracting path from public URL
  const marker = `/object/public/${PRODUCT_IMAGES_BUCKET}/`;
  const idx = options.url.indexOf(marker);
  if (idx >= 0) {
    const storagePath = decodeURIComponent(
      options.url.slice(idx + marker.length).split("?")[0],
    );
    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .download(storagePath);
    if (!error && data) {
      return Buffer.from(await data.arrayBuffer());
    }
  }

  throw new Error(
    `Failed to fetch image (${response.status}): ${options.url}. ` +
      "Confirm the product-images bucket exists and is public in Supabase Storage.",
  );
}
