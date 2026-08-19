import { describe, expect, it } from "vitest";
import { normalizeEbayImageUrl } from "@/lib/ebay/ensure-ebay-images";

describe("normalizeEbayImageUrl", () => {
  it("keeps Amazon CDN image ids unencoded", () => {
    const url =
      "https://m.media-amazon.com/images/I/71AbCdEfGhI._AC_SL1500_.jpg";
    expect(normalizeEbayImageUrl(url)).toBe(url);
  });
});
