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
    expect(resolve).toMatch(/pickTitleAmazonCatalog/);
  });

  it("uses the imported Amazon ASIN instead of searching by brand", () => {
    const resolve = readRepo("lib/amazon/catalog-resolve.ts");
    const workspace = readRepo("components/listing/new-listing-workspace.tsx");
    const exportScreen = readRepo("components/listing/wizard/export-screen.tsx");
    expect(resolve).toMatch(/importedAsin/);
    expect(resolve).toMatch(/amazonAsinFromListing/);
    expect(workspace).toMatch(/amazonAsinFromListing\(\{/);
    expect(workspace).toMatch(/amazonUrl/);
    expect(workspace).toMatch(/sourceListing/);
    expect(exportScreen).toMatch(/AmazonSourceLink/);
  });

  it("creates a new Amazon product when the exact model is not in the catalog", () => {
    const publish = readRepo("lib/amazon/publish-listing.ts");
    const resolve = readRepo("lib/amazon/catalog-resolve.ts");
    expect(resolve).toMatch(/mode: "create"/);
    expect(resolve).not.toMatch(/Higlou will not publish a different product/);
    expect(publish).toMatch(/creating = resolved.mode === "create"/);
    expect(publish).toMatch(/create it as a new Amazon product/);
    expect(publish).toMatch(/externally_assigned_product_identifier|upc/);
  });

  it("publishes a complete Amazon listing, never a price-only offer", () => {
    const publish = readRepo("lib/amazon/publish-listing.ts");
    expect(publish).toMatch(/requirements: "LISTING"/);
    expect(publish).not.toMatch(/LISTING_OFFER_ONLY/);
    expect(publish).toMatch(/dropAmazonBrandAttributes/);
  });

  it("does not ask Amazon for identifiers when submitting a live offer", () => {
    const api = readRepo("lib/amazon/sp-api.ts");
    expect(api).toMatch(/includedData: "issues"/);
    expect(api).toMatch(/VALIDATION_PREVIEW/);
    expect(api).not.toMatch(/includedData: "issues,identifiers"/);
  });
});
