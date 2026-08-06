import { describe, expect, it } from "vitest";
import {
  EBAY_CATEGORY_OPTIONS,
  resolveEbayCategory,
  scoreEbayCategories,
} from "@/config/ebay-categories";
import { draftDefaultsToPolicyValues } from "@/lib/ebay/draft-defaults";

describe("resolveEbayCategory", () => {
  it("has unique category ids", () => {
    const ids = EBAY_CATEGORY_OPTIONS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("maps sneakers to men's athletic shoes", () => {
    const result = resolveEbayCategory({
      productType: "Sneakers",
      title: "Nike Air Force 1 '07",
      brand: "Nike",
    });
    expect(result.categoryId).toBe("15709");
    expect(result.categoryName).toMatch(/Athletic Shoes/i);
    expect(result.inferred).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("maps bedding sets to comforter sets", () => {
    const result = resolveEbayCategory({
      productType: "Bedding",
      title: "Queen Comforter Set Gray",
    });
    expect(result.categoryId).toBe("177019");
  });

  it("maps headphones correctly", () => {
    const result = resolveEbayCategory({
      productType: "Headphones",
      title: "Sony WH-1000XM5 Wireless Headphones",
    });
    expect(result.categoryId).toBe("112529");
  });

  it("maps phone cases", () => {
    const result = resolveEbayCategory({
      title: "iPhone 15 Pro Silicone Phone Case",
      productType: "Phone Case",
    });
    expect(result.categoryId).toBe("123422");
  });

  it("keeps an existing category id even if not in catalog", () => {
    const result = resolveEbayCategory({
      categoryId: "43962",
      categoryName: "ATVs",
      productType: "ATV",
    });
    expect(result.categoryId).toBe("43962");
    expect(result.inferred).toBe(false);
    expect(result.categoryName).toMatch(/ATV/i);
  });

  it("keeps an existing catalog category id", () => {
    const result = resolveEbayCategory({
      categoryId: "177019",
      productType: "Sneakers",
    });
    expect(result.categoryId).toBe("177019");
    expect(result.inferred).toBe(false);
  });

  it("rejects product-type words like sneakers as categoryId", () => {
    const result = resolveEbayCategory({
      categoryId: "sneakers",
      title: "Nike Air Force 1 '07",
      brand: "Nike",
    });
    expect(result.categoryId).toBe("15709");
    expect(result.inferred).toBe(true);
  });

  it("does not force jeans onto an ATV title", () => {
    const ranked = scoreEbayCategories({
      title: "Don Baraton Super Mach Super Mega 125 ATV",
      productType: "ATV",
      brand: "Don Baraton",
    });
    expect(ranked.every((r) => r.option.id !== "11554")).toBe(true);
    const resolved = resolveEbayCategory({
      title: "Don Baraton Super Mach Super Mega 125 ATV",
      productType: "ATV",
      brand: "Don Baraton",
    });
    // Without a numeric model ID and without ATV in curated keywords, leave empty
    // for free-form AI — do not invent apparel.
    expect(resolved.categoryId).not.toBe("11554");
  });

  it("rejects fishing leaf for Aquafina bottled water", () => {
    const result = resolveEbayCategory({
      categoryId: "179985",
      categoryName: "Water",
      productType: "Purified Water",
      title: "Aquafina Purified Water Bottle 16.9 fl oz",
      brand: "Aquafina",
    });
    expect(result.categoryId).toBe("185035");
    expect(result.categoryName).toMatch(/Soft Drinks|Coffee/i);
    expect(result.inferred).toBe(true);
  });

  it("maps bottled water keywords to soft drinks", () => {
    const result = resolveEbayCategory({
      productType: "Purified Water",
      title: "Aquafina Purified Water Bottle 16.9 fl oz",
      brand: "Aquafina",
    });
    expect(result.categoryId).toBe("185035");
  });

  it("maps wall lighting fixtures / outdoor wall lights to lighting leaf", () => {
    const byName = resolveEbayCategory({
      categoryName: "Wall Lighting Fixtures",
      title: "Hampton Bay Modern Matte Black Outdoor Wall Light",
      brand: "Hampton Bay",
    });
    expect(byName.categoryId).toBe("20620");
    expect(byName.categoryName).toMatch(/Lighting/i);

    const byTitle = resolveEbayCategory({
      title: "Hampton Bay Modern Matte Black Outdoor Wall Light Sconce",
      brand: "Hampton Bay",
    });
    expect(byTitle.categoryId).toBe("20620");
  });
});

describe("draftDefaultsToPolicyValues", () => {
  it("emits no-returns and location/handling aliases", () => {
    const values = draftDefaultsToPolicyValues({
      shippingPolicyId: "Ship-A",
      returnPolicyId: "NoReturns-Policy",
      paymentPolicyId: "Pay-A",
      itemLocation: "Miami, FL",
      postalCode: "33101",
      country: "US",
      handlingTime: 2,
      returnsAccepted: "No",
    });
    expect(values["Shipping profile name"]).toBe("Ship-A");
    expect(values["Return profile name"]).toBe("NoReturns-Policy");
    // PostalCode preferred over Location (official FE rule).
    expect(values.PostalCode).toBe("33101");
    expect(values.Location).toBeUndefined();
    expect(values.DispatchTimeMax).toBe("2");
    expect(values.ReturnsAcceptedOption).toBe("ReturnsNotAccepted");
  });
});
