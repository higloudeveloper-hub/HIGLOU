import { describe, expect, it } from "vitest";
import {
  amazonHttpsProductUrl,
  buildAmazonAppDeepLinks,
  isAmazonAppCrawler,
  isMobileClient,
} from "@/lib/amazon/app-deep-link";

describe("amazon app deep links", () => {
  it("detects mobile vs crawler", () => {
    expect(
      isMobileClient(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
      ),
    ).toBe(true);
    expect(isAmazonAppCrawler("facebookexternalhit/1.1")).toBe(true);
    expect(isMobileClient("facebookexternalhit/1.1")).toBe(false);
  });

  it("builds HTTPS product URL with Associate tag for Facebook hops", () => {
    const https = amazonHttpsProductUrl(
      "https://www.amazon.com/dp/B0CHS1BVBC?tag=higlou-20",
    );
    expect(https).toBe("https://www.amazon.com/dp/B0CHS1BVBC?tag=higlou-20");
  });

  it("builds optional app schemes for explicit CTA taps only", () => {
    const links = buildAmazonAppDeepLinks(
      "https://www.amazon.com/dp/B0CHS1BVBC?tag=higlou-20",
    );
    expect(links).not.toBeNull();
    expect(links!.asin).toBe("B0CHS1BVBC");
    expect(links!.https).toContain("tag=higlou-20");
    expect(links!.iosScheme).toContain("tag=higlou-20");
    expect(links!.androidIntent).toContain(
      "package=com.amazon.mShop.android.shopping",
    );
  });

  it("returns null for non-Amazon destinations", () => {
    expect(buildAmazonAppDeepLinks("https://ebay.com/itm/123")).toBeNull();
    expect(amazonHttpsProductUrl("https://walmart.com/ip/1")).toBeNull();
  });
});
