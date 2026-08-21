import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readRepo(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), "utf8");
}

describe("Amazon seller publish stays on Higlou", () => {
  it("connects Amazon from Settings without a popup helper", () => {
    const settings = readRepo("components/settings/settings-studio.tsx");
    const form = readRepo("components/settings/amazon-connect-form.tsx");
    expect(settings).toMatch(/AmazonConnectForm/);
    expect(form).toMatch(/\/api\/amazon\/self-authorize/);
    expect(form).toMatch(/Merchant token/);
    expect(form).not.toMatch(/window\.open/);
  });

  it("exposes Publish to Amazon on Export", () => {
    const exportScreen = readRepo("components/listing/wizard/export-screen.tsx");
    expect(exportScreen).toMatch(/Publish to Amazon/);
    expect(exportScreen).toMatch(/onPublishToAmazon/);
  });

  it("sends package dimensions with Publish to Amazon", () => {
    const workspace = readRepo("components/listing/new-listing-workspace.tsx");
    expect(workspace).toMatch(/\/api\/amazon\/publish/);
    expect(workspace).toMatch(/packageLengthIn: fresh\.packageLengthIn/);
  });

  it("falls back from a Home Depot UPC miss to brand and model search", () => {
    const publish = readRepo("lib/amazon/publish-listing.ts");
    const resolve = readRepo("lib/amazon/catalog-resolve.ts");
    expect(publish).toMatch(/resolveAmazonCatalogMatch/);
    expect(resolve).toMatch(/searchAmazonCatalogForListing/);
    expect(resolve).toMatch(/hydrateHits/);
    expect(resolve).toMatch(/pickExactAmazonCatalog/);
    expect(resolve).not.toMatch(/pickTitleAmazonCatalog/);
  });

  it("uses the imported Amazon ASIN instead of searching by brand", () => {
    const resolve = readRepo("lib/amazon/catalog-resolve.ts");
    const workspace = readRepo("components/listing/new-listing-workspace.tsx");
    const exportScreen = readRepo("components/listing/wizard/export-screen.tsx");
    expect(resolve).toMatch(/importedAsin/);
    expect(resolve).toMatch(/amazonAsinFromListing/);
    expect(workspace).toMatch(/amazonAsinFromListing\(/);
    expect(workspace).toMatch(/amazonUrl/);
    expect(workspace).toMatch(/sourceListing/);
    expect(exportScreen).toMatch(/AmazonSourceLink/);
  });

  it("keeps a one-click Amazon source button on listings and in the wizard", () => {
    const link = readRepo("components/listing/amazon-source-link.tsx");
    const workspace = readRepo("components/listing/new-listing-workspace.tsx");
    const listings = readRepo("app/listings/page.tsx");
    const card = readRepo("components/studio/listing-card.tsx");
    expect(link).toMatch(/Open on Amazon/);
    expect(workspace).toMatch(/headerActions/);
    expect(workspace).toMatch(/AmazonSourceLink listing=\{listing\}/);
    expect(listings).toMatch(/amazonListingUrl/);
    expect(listings).toMatch(/amazonHref/);
    expect(card).toMatch(/amazonHref/);
    expect(card).toMatch(/Open on Amazon/);
  });

  it("stops instead of creating a new Amazon product without an exact ASIN", () => {
    const publish = readRepo("lib/amazon/publish-listing.ts");
    const resolve = readRepo("lib/amazon/catalog-resolve.ts");
    expect(resolve).toMatch(/mode: "none"/);
    expect(resolve).not.toMatch(/mode: "create"/);
    expect(publish).toMatch(/does not have a confirmed exact match/);
    expect(publish).toMatch(/getAmazonListingsRestrictions/);
    expect(publish).toMatch(/getAmazonCatalogItem/);
  });

  it("publishes existing ASINs as LISTING_OFFER_ONLY without catalog brand", () => {
    const publish = readRepo("lib/amazon/publish-listing.ts");
    const attributes = readRepo("lib/amazon/listing-attributes.ts");
    const exportScreen = readRepo("components/listing/wizard/export-screen.tsx");
    expect(publish).toMatch(/requirements: "LISTING_OFFER_ONLY"/);
    expect(publish).toMatch(/productType: "PRODUCT"/);
    expect(publish).toMatch(/buildAmazonOfferOnlyAttributes/);
    expect(publish).toMatch(/patchAmazonListingAttributes/);
    expect(publish).toMatch(/amazonImageLocatorPatches/);
    expect(publish).not.toMatch(/lockAmazonBrandAttributes/);
    expect(attributes).toMatch(/merchant_shipping_group/);
    expect(attributes).toMatch(/buildAmazonOfferOnlyAttributes/);
    expect(attributes).toMatch(/amazonImageLocatorAttributes/);
    expect(exportScreen).toMatch(/confirmed Amazon ASIN/);
    expect(exportScreen).toMatch(/Request approval on Amazon/);
    expect(exportScreen).toMatch(/Amazon restriction response/);
    expect(exportScreen).toMatch(/Approval required/);
  });

  it("does not ask Amazon for identifiers when submitting a live offer", () => {
    const api = readRepo("lib/amazon/sp-api.ts");
    expect(api).toMatch(/includedData: "issues"/);
    expect(api).toMatch(/VALIDATION_PREVIEW/);
    expect(api).not.toMatch(/includedData: "issues,identifiers"/);
  });
});
