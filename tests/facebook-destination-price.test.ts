import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  detectPromoDestination,
  extractAsinFromUrl,
  extractEbayItemIdFromUrl,
  formatPromoPriceLabel,
  priceForPromoDestination,
  promoPriceLabelForLink,
} from "@/lib/facebook/destination-price";

describe("destination-price", () => {
  it("detects Amazon and eBay destinations", () => {
    expect(
      detectPromoDestination("https://www.amazon.com/dp/B0CHS1BVBC?tag=x-20"),
    ).toBe("amazon");
    expect(
      detectPromoDestination("https://www.ebay.com/itm/286123456789"),
    ).toBe("ebay");
    expect(detectPromoDestination("https://higlou.app/r/abc")).toBe("other");
  });

  it("extracts ASIN and eBay item ids", () => {
    expect(
      extractAsinFromUrl("https://www.amazon.com/dp/B0CHS1BVBC?psc=1"),
    ).toBe("B0CHS1BVBC");
    expect(
      extractAsinFromUrl(
        "https://www.amazon.com/gp/product/B09ABCDEF0/ref=xx",
      ),
    ).toBe("B09ABCDEF0");
    expect(
      extractEbayItemIdFromUrl("https://www.ebay.com/itm/foo/286123456789"),
    ).toBe("286123456789");
  });

  it("uses Amazon buy box for Amazon links — never arbitrage sell", () => {
    expect(
      priceForPromoDestination({
        linkUrl: "https://www.amazon.com/dp/B0CHS1BVBC",
        amazonPrice: 24.99,
        ebayPrice: 49.99,
        listingPrice: 49.99,
      }),
    ).toBe(24.99);

    // Missing amazon quote → null (do not fall back to eBay sell)
    expect(
      priceForPromoDestination({
        linkUrl: "https://www.amazon.com/dp/B0CHS1BVBC",
        amazonPrice: null,
        ebayPrice: 49.99,
        listingPrice: 49.99,
      }),
    ).toBeNull();
  });

  it("uses eBay / listing price for eBay links", () => {
    expect(
      priceForPromoDestination({
        linkUrl: "https://www.ebay.com/itm/286123456789",
        amazonPrice: 24.99,
        ebayPrice: 42,
        listingPrice: 44,
      }),
    ).toBe(42);

    expect(
      priceForPromoDestination({
        linkUrl: "https://www.ebay.com/itm/286123456789",
        amazonPrice: 24.99,
        ebayPrice: null,
        listingPrice: 44,
      }),
    ).toBe(44);
  });

  it("formats promo price labels", () => {
    expect(formatPromoPriceLabel(19.99)).toBe("$19.99");
    expect(formatPromoPriceLabel(0)).toBeNull();
    expect(formatPromoPriceLabel(null)).toBeNull();
    expect(
      promoPriceLabelForLink({
        linkUrl: "https://www.amazon.com/dp/B0CHS1BVBC",
        amazonPrice: 18.4,
      }),
    ).toBe("$18.40");
  });
});

describe("enrichPromoCardPrices", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("replaces Amazon labels with live Keepa buy box", async () => {
    vi.doMock("@/lib/keepa/config", () => ({
      isKeepaConfigured: () => true,
    }));
    vi.doMock("@/lib/keepa/finder", () => ({
      keepaProducts: async () => [
        { asin: "B0CHS1BVBC", buyBoxPrice: 21.5, newPrice: 22 },
      ],
    }));

    const { enrichPromoCardPrices } = await import(
      "@/lib/facebook/enrich-promo-prices"
    );
    const out = await enrichPromoCardPrices([
      {
        id: "1",
        title: "Widget",
        imageUrl: "https://cdn.example.com/a.jpg",
        linkUrl: "https://www.amazon.com/dp/B0CHS1BVBC",
        priceLabel: "$49", // stale arbitrage sell
      },
    ]);
    expect(out[0]?.priceLabel).toBe("$21.50");
  });

  it("replaces Amazon labels via ASIN even on smart redirect URLs", async () => {
    vi.doMock("@/lib/keepa/config", () => ({
      isKeepaConfigured: () => true,
    }));
    vi.doMock("@/lib/keepa/finder", () => ({
      keepaProducts: async () => [
        { asin: "B0CHS1BVBC", buyBoxPrice: 17.25, newPrice: 18 },
      ],
    }));

    const { enrichPromoCardPrices } = await import(
      "@/lib/facebook/enrich-promo-prices"
    );
    const out = await enrichPromoCardPrices([
      {
        id: "1",
        title: "Widget",
        imageUrl: "https://cdn.example.com/a.jpg",
        linkUrl: "https://higlou.app/r/abc123",
        asin: "B0CHS1BVBC",
        priceLabel: "$55",
      },
    ]);
    expect(out[0]?.priceLabel).toBe("$17.25");
  });

  it("clears Amazon price when Keepa cannot verify", async () => {
    vi.doMock("@/lib/keepa/config", () => ({
      isKeepaConfigured: () => false,
    }));
    vi.doMock("@/lib/keepa/finder", () => ({
      keepaProducts: async () => [],
    }));

    const { enrichPromoCardPrices } = await import(
      "@/lib/facebook/enrich-promo-prices"
    );
    const out = await enrichPromoCardPrices([
      {
        id: "1",
        title: "Widget",
        imageUrl: "https://cdn.example.com/a.jpg",
        linkUrl: "https://www.amazon.com/dp/B0CHS1BVBC",
        priceLabel: "$49",
      },
      {
        id: "2",
        title: "eBay listing",
        imageUrl: "https://cdn.example.com/b.jpg",
        linkUrl: "https://www.ebay.com/itm/286123456789",
        priceLabel: "$44.00",
      },
    ]);
    expect(out[0]?.priceLabel).toBeNull();
    expect(out[1]?.priceLabel).toBe("$44.00");
  });
});
