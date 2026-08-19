import { createHash } from "crypto";
import { loadSharp } from "@/lib/images/load-sharp";
import {
  resolveImageMime,
  type NormalizedImageMimeType,
  type SupportedImageMimeType,
} from "@/config/supported-image-formats";
import {
  messageForAnalysisFailure,
  type AnalysisFailureCode,
} from "@/types/analysis-failures";

export type NormalizedImage = {
  originalMimeType: string;
  normalizedMimeType: NormalizedImageMimeType;
  width: number;
  height: number;
  sourceHash: string;
  normalizedHash: string;
  buffer: Buffer;
  hadAlpha: boolean;
};

export class ImageNormalizeError extends Error {
  code: AnalysisFailureCode;
  constructor(code: AnalysisFailureCode, message?: string) {
    super(message ?? messageForAnalysisFailure(code));
    this.name = "ImageNormalizeError";
    this.code = code;
  }
}

function hashBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Decode any supported upload format into a stable internal JPEG/PNG for
 * quality gate + OpenAI/OCR. Creative pipelines should keep originals.
 *
 * - EXIF autorotate via sharp.rotate()
 * - Preserves PNG/WebP with alpha as PNG (no white flatten)
 * - Opaque images → JPEG mozjpeg q92
 */
export async function normalizeImageForAnalysis(
  inputBuffer: Buffer,
  options?: {
    claimedMime?: string | null;
    /** Longest edge cap (default 4096). */
    maxEdge?: number;
  },
): Promise<NormalizedImage> {
  const resolved = resolveImageMime(inputBuffer, options?.claimedMime);
  if (!resolved.mime) {
    throw new ImageNormalizeError(
      "UNSUPPORTED_INPUT_FORMAT",
      `${messageForAnalysisFailure("UNSUPPORTED_INPUT_FORMAT")} Detected: ${resolved.sniffed}${
        resolved.claimed ? ` (claimed ${resolved.claimed})` : ""
      }.`,
    );
  }

  const sourceHash = hashBuffer(inputBuffer);
  const maxEdge = options?.maxEdge ?? 4096;

  try {
    const sharp = await loadSharp();
    const pipeline = sharp(inputBuffer, {
      failOn: "none",
      animated: false,
    }).rotate();

    const meta = await pipeline.metadata();
    const hadAlpha = Boolean(meta.hasAlpha);
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;

    if (!width || !height) {
      throw new ImageNormalizeError("IMAGE_DECODE_FAILED");
    }

    let next = pipeline;
    if (Math.max(width, height) > maxEdge) {
      next = next.resize({
        width: width >= height ? maxEdge : undefined,
        height: height > width ? maxEdge : undefined,
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    // Keep alpha for cutouts / transparent product shots. Never flatten those
    // — Creative needs the alpha. Opaque photos become JPEG.
    if (hadAlpha) {
      const { data, info } = await next
        .png({ compressionLevel: 8 })
        .toBuffer({ resolveWithObject: true });
      return {
        originalMimeType: resolved.mime,
        normalizedMimeType: "image/png",
        width: info.width,
        height: info.height,
        sourceHash,
        normalizedHash: hashBuffer(data),
        buffer: data,
        hadAlpha: true,
      };
    }

    const { data, info } = await next
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });

    return {
      originalMimeType: resolved.mime as SupportedImageMimeType,
      normalizedMimeType: "image/jpeg",
      width: info.width,
      height: info.height,
      sourceHash,
      normalizedHash: hashBuffer(data),
      buffer: data,
      hadAlpha: false,
    };
  } catch (error) {
    if (error instanceof ImageNormalizeError) throw error;
    throw new ImageNormalizeError(
      "IMAGE_DECODE_FAILED",
      error instanceof Error
        ? `${messageForAnalysisFailure("IMAGE_DECODE_FAILED")} (${error.message})`
        : messageForAnalysisFailure("IMAGE_DECODE_FAILED"),
    );
  }
}

export async function normalizeImagesForAnalysis(
  items: Array<{ buffer: Buffer; claimedMime?: string | null; url?: string }>,
): Promise<NormalizedImage[]> {
  return Promise.all(
    items.map((item) =>
      normalizeImageForAnalysis(item.buffer, { claimedMime: item.claimedMime }),
    ),
  );
}
