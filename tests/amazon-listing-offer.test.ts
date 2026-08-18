import { describe, expect, it } from "vitest";
import {
  amazonConditionType,
  amazonOfferAttributes,
  amazonSkuFromListing,
  asinFromHiglouSku,
  catalogIdentifierType,
} from "@/lib/amazon/listing-offer";
import { AMAZON_US_MARKETPLACE_ID } from "@/lib/amazon/sp-config";

describe("Amazon listing offer helpers", () => {
  it("keeps AMZ-ASIN skus and reads the ASIN", () => {
    expect(amazonSkuFromListing("AMZ-B0CHS1BVBC")).toBe("AMZ-B0CHS1BVBC");
    expect(asinFromHiglouSku("AMZ-B0CHS1BVBC")).toBe("B0CHS1BVBC");
  });

  it("sanitizes Home Depot skus for Amazon", () => {
    expect(amazonSkuFromListing("HD-301460651")).toBe("HD-301460651");
    expect(amazonSkuFromListing("sku with spaces!")).toBe("sku-with-spaces");
  });

  it("maps Higlou New to Amazon new_new", () => {
    expect(amazonConditionType("New", "1000")).toBe("new_new");
    expect(amazonConditionType("Used - Good", "5000")).toBe("used_good");
  });

  it("builds an offer-only payload with price and quantity", () => {
    const attrs = amazonOfferAttributes({
      marketplaceId: AMAZON_US_MARKETPLACE_ID,
      asin: "B0CHS1BVBC",
      conditionType: "new_new",
      price: 19.9,
      quantity: 2,
      handlingDays: 2,
    });
    expect(attrs.merchant_suggested_asin[0].value).toBe("B0CHS1BVBC");
    expect(attrs.purchasable_offer[0].our_price[0].schedule[0].value_with_tax).toBe(
      19.9,
    );
    expect(attrs.fulfillment_availability[0].quantity).toBe(2);
  });

  it("classifies 12-digit UPC vs 13-digit EAN", () => {
    expect(catalogIdentifierType("012345678905")).toBe("UPC");
  });
});
