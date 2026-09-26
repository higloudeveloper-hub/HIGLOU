import { describe, expect, it } from "vitest";
import {
  facebookFriendlyPictureUrl,
  isWeakFacebookPictureUrl,
  shortenFacebookCardTitle,
} from "@/lib/facebook/promo-media";
import { buildFacebookPromoCopy } from "@/lib/facebook/promo-copy";

describe("facebook promo media", () => {
  it("marks ads-system and P/ASIN stubs as weak", () => {
    expect(
      isWeakFacebookPictureUrl(
        "https://ws-na.amazon-adsystem.com/widgets/q?ASIN=B0CHS1BVBC",
      ),
    ).toBe(true);
    expect(
      isWeakFacebookPictureUrl(
        "https://m.media-amazon.com/images/P/B0CHS1BVBC.01._SCLZZZZZZZ_SX500_.jpg",
      ),
    ).toBe(true);
    expect(
      isWeakFacebookPictureUrl(
        "https://m.media-amazon.com/images/I/71abcXYZ._AC_SL1500_.jpg",
      ),
    ).toBe(false);
  });

  it("prefers real I/ CDN images over ads widgets and P/ stubs", () => {
    const widget =
      "https://ws-na.amazon-adsystem.com/widgets/q?ASIN=B0CHS1BVBC&Format=_SL500_";
    const real =
      "https://m.media-amazon.com/images/I/71YosaTooTablet._AC_SL1500_.jpg";
    const stub =
      "https://m.media-amazon.com/images/P/B0CHS1BVBC.01._SCLZZZZZZZ_.jpg";
    expect(
      facebookFriendlyPictureUrl(widget, "B0CHS1BVBC", [stub, real]),
    ).toBe(real);
  });

  it("prefers our rehosted CDN over Amazon so FB never blanks the card", () => {
    const amazon =
      "https://m.media-amazon.com/images/I/71YosaTooTablet._AC_SL1500_.jpg";
    const cdn =
      "https://xyz.supabase.co/storage/v1/object/public/product-images/u/a.jpg";
    expect(facebookFriendlyPictureUrl(cdn, "B0CHS1BVBC", [amazon])).toBe(cdn);
  });

  it("shortens long titles at a word boundary", () => {
    const long =
      "YosaToo Kids Tablet 10 inch Android Tablet for Kids with Parental Control Blue Case Charger";
    const short = shortenFacebookCardTitle(long, 36);
    expect(short.length).toBeLessThanOrEqual(37);
    expect(short).toMatch(/…$/);
    expect(short).not.toMatch(/ASIN/i);
  });

  it("cardName uses short titles for Facebook cards", () => {
    const copy = buildFacebookPromoCopy({ format: "vitrina", seed: 0 });
    const name = copy.cardName(
      "Anker Power Bank 20000mAh Portable Charger Fast Charging USB C Black",
    );
    expect(name.length).toBeLessThanOrEqual(37);
  });
});
