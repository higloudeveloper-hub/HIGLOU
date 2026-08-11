import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  signOAuthState,
  verifyOAuthState,
} from "@/lib/ebay/crypto-tokens";
import { listingToEbayAspects } from "@/lib/ebay/listing-to-inventory";
import { createEmptyListing } from "@/lib/demo/sample-listing";

describe("ebay crypto tokens", () => {
  const secret = "higlou-test-encryption-key-32chars!!";

  it("round-trips encrypt/decrypt", () => {
    const plain = "ebay-refresh-token-value";
    const enc = encryptSecret(plain, secret);
    expect(enc.startsWith("v1:")).toBe(true);
    expect(decryptSecret(enc, secret)).toBe(plain);
  });

  it("signs and verifies OAuth state", () => {
    const state = signOAuthState("user-123", secret, 120);
    expect(verifyOAuthState(state, secret)?.userId).toBe("user-123");
    expect(verifyOAuthState("tampered.state", secret)).toBeNull();
  });
});

describe("listingToEbayAspects", () => {
  it("builds Brand/Type aspects from listing fields", () => {
    const listing = createEmptyListing();
    listing.title = "Leviton Dimmer Switch";
    listing.brand = "Leviton";
    listing.productType = "Dimmer Switch";
    listing.categoryId = "20711";
    listing.colors = ["White"];
    listing.materials = ["Plastic"];
    listing.itemSpecifics = [];

    const aspects = listingToEbayAspects(listing);
    expect(aspects.Brand?.[0]).toBe("Leviton");
    expect(aspects.MPN?.[0]).toBe("Does Not Apply");
    expect(aspects.Type?.[0]).toBe("Dimmer Switch");
    expect(aspects.Color?.[0]).toBe("White");
  });
});
