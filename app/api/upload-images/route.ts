import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { compressImageBuffer } from "@/lib/images/compress-server";
import {
  ensureProductImagesBucket,
  PRODUCT_IMAGES_BUCKET,
} from "@/lib/images/storage";
import { DEFAULT_VALUES } from "@/config/default-values";
import {
  isAcceptedUploadMime,
  resolveImageMime,
} from "@/config/supported-image-formats";

export { PRODUCT_IMAGES_BUCKET };

/** Allow large listing-quality originals (up to maxImageSizeMb each). */
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = DEFAULT_VALUES.maxImageSizeMb * 1024 * 1024;

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "image.jpg";
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

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    await ensureProductImagesBucket();

    const formData = await request.formData();
    const productId =
      String(formData.get("productId") ?? "").trim() || "temp";
    const files = formData
      .getAll("files")
      .concat(formData.getAll("file"))
      .filter((entry): entry is File => entry instanceof File);

    if (!files.length) {
      return NextResponse.json(
        { error: "No image files provided. Use multipart field 'files'." },
        { status: 400 },
      );
    }

    if (files.length > DEFAULT_VALUES.maxImages) {
      return NextResponse.json(
        { error: `Maximum ${DEFAULT_VALUES.maxImages} images per request.` },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const uploaded: Array<{
      publicUrl: string;
      storagePath: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    }> = [];

    for (const file of files) {
      if (file.size > MAX_BYTES) {
        return NextResponse.json(
          {
            error: `${file.name} exceeds ${DEFAULT_VALUES.maxImageSizeMb}MB limit`,
          },
          { status: 400 },
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      const raw = Buffer.from(arrayBuffer);
      const resolved = resolveImageMime(raw, file.type);

      // Magic bytes win. Claimed MIME alone is not enough if sniff says otherwise.
      if (!resolved.mime) {
        const claimedOk = isAcceptedUploadMime(file.type);
        return NextResponse.json(
          {
            error: claimedOk
              ? `Could not verify image bytes for ${file.name}. Re-export as JPEG, PNG, or WebP.`
              : `Unsupported mime type for ${file.name}: ${file.type || "unknown"}`,
            code: "UNSUPPORTED_INPUT_FORMAT",
          },
          { status: 400 },
        );
      }

      const compressed = await compressImageBuffer(raw);
      const safeName = safeFileName(file.name);
      const storagePath = `${auth.user.id}/${productId}/${randomUUID()}-${safeName}`;
      const contentType = resolved.mime;

      const { error } = await admin.storage
        .from(PRODUCT_IMAGES_BUCKET)
        .upload(storagePath, compressed, {
          contentType,
          upsert: false,
        });

      if (error) {
        return NextResponse.json(
          { error: `Upload failed for ${file.name}: ${error.message}` },
          { status: 500 },
        );
      }

      const publicUrl = publicObjectUrl(storagePath);
      if (!/^https:\/\//i.test(publicUrl)) {
        return NextResponse.json(
          { error: "Public URL must be HTTPS" },
          { status: 500 },
        );
      }

      uploaded.push({
        publicUrl,
        storagePath,
        fileName: safeName,
        mimeType: contentType,
        sizeBytes: compressed.byteLength,
      });
    }

    return NextResponse.json({
      ok: true,
      bucket: PRODUCT_IMAGES_BUCKET,
      images: uploaded,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Image upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
