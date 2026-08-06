import { describe, expect, it } from "vitest";
import {
  descriptionIncludesStoreBranding,
  hasCriticalErrors,
  validateListing,
} from "@/lib/validation/listing";
import { createEmptyListing } from "@/lib/demo/sample-listing";

describe("validateListing branding / export blockers", () => {
  it("matches store name or header display in description HTML", () => {
    expect(
      descriptionIncludesStoreBranding(
        "<div>OLIVIA STORE — Quality</div>",
        "olivia store",
        "OLIVIA STORE",
      ),
    ).toBe(true);
    expect(
      descriptionIncludesStoreBranding(
        "<div>HIGLOU STORE</div>",
        "olivia store",
        "OLIVIA STORE",
      ),
    ).toBe(false);
  });

  it("does not block export when active store is not Higlou Store", () => {
    const listing = createEmptyListing();
    listing.title = "Leviton Dimmer Switch White";
    listing.sku = "LEVI-MODEL-SZ-WHITE";
    listing.price = 12;
    listing.quantity = 1;
    listing.condition = "New";
    listing.conditionId = "1000";
    listing.descriptionHtml =
      "<div>OLIVIA STORE</div><p>Dimmer switch for indoor use.</p>";
    listing.images = [
      {
        id: "1",
        url: "https://example.com/a.jpg",
        storagePath: "",
        fileName: "a.jpg",
        sortOrder: 0,
        isPrimary: true,
        mimeType: "image/jpeg",
        sizeBytes: 1,
        uploadProgress: 100,
      },
    ];

    const items = validateListing(listing, "olivia store", "OLIVIA STORE");
    expect(hasCriticalErrors(items)).toBe(false);
    const branding = items.find((i) => i.id === "branding");
    expect(branding?.ok).toBe(true);
    expect(branding?.severity).toBe("warning");
  });

  it("allows export when HTTPS photos exist alongside blob previews", () => {
    const listing = createEmptyListing();
    listing.title = "Test Product Title Here";
    listing.sku = "SKU-1";
    listing.price = 10;
    listing.quantity = 1;
    listing.condition = "New";
    listing.conditionId = "1000";
    listing.descriptionHtml = "<p>Product description long enough.</p>";
    listing.images = [
      {
        id: "1",
        url: "blob:https://local/preview",
        storagePath: "",
        fileName: "a.jpg",
        sortOrder: 0,
        isPrimary: true,
        mimeType: "image/jpeg",
        sizeBytes: 1,
        uploadProgress: 50,
      },
      {
        id: "2",
        url: "https://cdn.example.com/b.jpg",
        storagePath: "b",
        fileName: "b.jpg",
        sortOrder: 1,
        isPrimary: false,
        mimeType: "image/jpeg",
        sizeBytes: 1,
        uploadProgress: 100,
      },
    ];

    const items = validateListing(listing, "Higlou Store");
    expect(hasCriticalErrors(items)).toBe(false);
  });
});
