import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  coerceCatalogImageToJpeg,
  isAvifBuffer,
} from "@/lib/images/coerce-catalog-image";
import { normalizeImageForAnalysis } from "@/lib/images/normalize-image";
import { isJpegBuffer } from "@/config/supported-image-formats";

describe("coerceCatalogImageToJpeg", () => {
  it("leaves JPEG alone", async () => {
    const jpeg = await sharp({
      create: {
        width: 120,
        height: 120,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .jpeg()
      .toBuffer();
    const out = await coerceCatalogImageToJpeg(jpeg);
    expect(out).toBe(jpeg);
  });

  it("converts AVIF to JPEG when Sharp can encode it", async () => {
    let avif: Buffer;
    try {
      avif = await sharp({
        create: {
          width: 160,
          height: 160,
          channels: 3,
          background: { r: 200, g: 40, b: 40 },
        },
      })
        .avif({ quality: 50 })
        .toBuffer();
    } catch {
      // Some local Sharp builds ship without AVIF encode — skip.
      return;
    }

    expect(isAvifBuffer(avif)).toBe(true);
    const jpeg = await coerceCatalogImageToJpeg(avif);
    expect(jpeg).toBeTruthy();
    expect(isJpegBuffer(jpeg!)).toBe(true);

    const normalized = await normalizeImageForAnalysis(avif);
    expect(normalized.normalizedMimeType).toBe("image/jpeg");
    expect(isJpegBuffer(normalized.buffer)).toBe(true);
  });
});
