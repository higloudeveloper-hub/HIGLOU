import { tryLoadSharp } from "@/lib/images/load-sharp";
import {
  isJpegBuffer,
  isPngBuffer,
  resolveImageMime,
} from "@/config/supported-image-formats";

/** ISO BMFF with AVIF brand (ftyp…avif|avis|mif1). */
export function isAvifBuffer(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  if (buffer.toString("ascii", 4, 8) !== "ftyp") return false;
  const brands = buffer
    .toString("ascii", 8, Math.min(buffer.length, 64))
    .toLowerCase();
  return /avif|avis/.test(brands);
}

/**
 * Walmart (and some CDNs) return AVIF when Accept prefers it. Higlou analysis
 * and eBay want JPEG/PNG — decode anything Sharp understands into JPEG.
 */
export async function coerceCatalogImageToJpeg(
  input: Buffer,
): Promise<Buffer | null> {
  if (!input?.byteLength) return null;
  if (isJpegBuffer(input) || isPngBuffer(input)) return input;

  const resolved = resolveImageMime(input);
  if (resolved.mime === "image/jpeg" || resolved.mime === "image/png") {
    return input;
  }

  const sharp = await tryLoadSharp();
  if (!sharp) {
    if (resolved.mime === "image/webp") return input;
    return null;
  }

  try {
    const pipeline = sharp(input, { failOn: "none", animated: false }).rotate();
    const meta = await pipeline.metadata();
    if (!(meta.width && meta.height)) return null;
    return pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  } catch {
    return null;
  }
}
