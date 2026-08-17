import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { prepareEbayListingJpeg } from "@/lib/ebay/ensure-ebay-images";

async function solidJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 40, g: 40, b: 40 },
    },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

describe("prepareEbayListingJpeg", () => {
  it("upsizes Amazon-sized 432px crops past eBay's 500px floor", async () => {
    const jpeg = await prepareEbayListingJpeg(await solidJpeg(432, 433));
    expect(jpeg).toBeTruthy();
    const meta = await sharp(jpeg!).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeGreaterThanOrEqual(
      500,
    );
  });

  it("skips tiny icons", async () => {
    const jpeg = await prepareEbayListingJpeg(await solidJpeg(40, 40));
    expect(jpeg).toBeNull();
  });

  it("does not enlarge a photo that already meets policy", async () => {
    const jpeg = await prepareEbayListingJpeg(await solidJpeg(900, 700));
    expect(jpeg).toBeTruthy();
    const meta = await sharp(jpeg!).metadata();
    expect(meta.width).toBe(900);
    expect(meta.height).toBe(700);
  });
});
