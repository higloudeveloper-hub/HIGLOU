import { describe, expect, it } from "vitest";
import {
  amazonHttpsProductUrl,
  amazonProductLandingHtml,
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

  it("builds iOS scheme + Android intent with Associate tag", () => {
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

  it("landing shows product and does not auto-open the app", () => {
    const links = buildAmazonAppDeepLinks(
      "https://www.amazon.com/dp/B0CHS1BVBC?tag=higlou-20",
    )!;
    const html = amazonProductLandingHtml({
      links,
      title: "Anker Power Bank",
      imageUrl: "https://cdn.example.com/p.jpg",
      priceLabel: "$24.99",
    });
    expect(html).toContain("Anker Power Bank");
    expect(html).toContain("$24.99");
    expect(html).toContain("Comprar ahora");
    expect(html).toContain("Agregar al carrito");
    expect(html).toContain("cdn.example.com/p.jpg");
    // No auto navigate on load — only on button click
    expect(html).not.toMatch(/tryApp\(\);\s*setTimeout/);
    expect(html).toContain('addEventListener("click"');
  });

  it("returns null for non-Amazon destinations", () => {
    expect(buildAmazonAppDeepLinks("https://ebay.com/itm/123")).toBeNull();
    expect(amazonHttpsProductUrl("https://walmart.com/ip/1")).toBeNull();
  });
});
