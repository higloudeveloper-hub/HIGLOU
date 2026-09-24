import { describe, expect, it } from "vitest";
import {
  facebookFriendlyPictureUrl,
  shortenFacebookCardTitle,
} from "@/lib/facebook/promo-media";
import { buildFacebookPromoCopy } from "@/lib/facebook/promo-copy";

describe("facebook promo media", () => {
  it("swaps amazon-adsystem widgets for media-amazon CDN when ASIN known", () => {
    const widget =
      "https://ws-na.amazon-adsystem.com/widgets/q?ASIN=B0CHS1BVBC&Format=_SL500_";
    const out = facebookFriendlyPictureUrl(widget, "B0CHS1BVBC");
    expect(out).toMatch(/m\.media-amazon\.com\/images\/P\/B0CHS1BVBC/);
    expect(out).not.toMatch(/amazon-adsystem/);
  });

  it("keeps direct CDN URLs", () => {
    const cdn =
      "https://m.media-amazon.com/images/I/71abcXYZ._AC_SL1500_.jpg";
    expect(facebookFriendlyPictureUrl(cdn, "B0CHS1BVBC")).toBe(cdn);
  });

  it("shortens long titles at a word boundary", () => {
    const long =
      "YosaToo Kids Tablet 10 inch Android Tablet for Kids with Parental Control Blue Case Charger";
    const short = shortenFacebookCardTitle(long, 40);
    expect(short.length).toBeLessThanOrEqual(41);
    expect(short).toMatch(/…$/);
    expect(short).not.toMatch(/ASIN/i);
  });

  it("cardName uses short titles for Facebook cards", () => {
    const copy = buildFacebookPromoCopy({ format: "vitrina", seed: 0 });
    const name = copy.cardName(
      "Anker Power Bank 20000mAh Portable Charger Fast Charging USB C Black",
    );
    expect(name.length).toBeLessThanOrEqual(41);
  });
});
