import { describe, expect, it } from "vitest";
import { isFacebookStableHost } from "@/lib/facebook/rehost-promo-images";
import { isWeakFacebookPictureUrl } from "@/lib/facebook/promo-media";

describe("facebook rehost hosts", () => {
  it("treats supabase / cloudinary as stable for Graph scrapers", () => {
    expect(
      isFacebookStableHost(
        "https://xyz.supabase.co/storage/v1/object/public/product-images/u/a.jpg",
      ),
    ).toBe(true);
    expect(
      isFacebookStableHost(
        "https://res.cloudinary.com/demo/image/upload/sample.jpg",
      ),
    ).toBe(true);
  });

  it("rejects Amazon ads-system and P/ASIN stubs even if https", () => {
    const widget =
      "https://ws-na.amazon-adsystem.com/widgets/q?ASIN=B0CHS1BVBC";
    const stub =
      "https://m.media-amazon.com/images/P/B0CHS1BVBC.01._SCLZZZZZZZ_.jpg";
    expect(isWeakFacebookPictureUrl(widget)).toBe(true);
    expect(isWeakFacebookPictureUrl(stub)).toBe(true);
    expect(isFacebookStableHost(widget)).toBe(false);
    expect(isFacebookStableHost(stub)).toBe(false);
  });

  it("does not treat raw Amazon I/ CDN as already-stable (needs rehost)", () => {
    const cdn =
      "https://m.media-amazon.com/images/I/71abcXYZ._AC_SL1500_.jpg";
    expect(isWeakFacebookPictureUrl(cdn)).toBe(false);
    expect(isFacebookStableHost(cdn)).toBe(false);
  });
});
