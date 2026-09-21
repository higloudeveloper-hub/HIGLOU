import { describe, expect, it } from "vitest";
import { buildAmazonAssociatesUrl } from "@/lib/monetization/channels/affiliate";

/**
 * Paid Facebook ads trust contract:
 * shared Amazon destinations must always include Associate tag=
 * so purchases can attribute commission.
 */
describe("facebook affiliate commission contract", () => {
  it("Associates product URL always includes tag=", () => {
    const url = buildAmazonAssociatesUrl({
      asin: "B012345678",
      associateTag: "higlou-20",
    });
    expect(url).toBeTruthy();
    const parsed = new URL(url!);
    expect(parsed.hostname).toContain("amazon.");
    expect(parsed.searchParams.get("tag")).toBe("higlou-20");
    expect(parsed.pathname).toMatch(/\/dp\/B012345678$/);
  });

  it("never builds a commission URL without a tag", () => {
    expect(
      buildAmazonAssociatesUrl({ asin: "B012345678", associateTag: "" }),
    ).toBeNull();
    expect(
      buildAmazonAssociatesUrl({ asin: "B012345678", associateTag: "   " }),
    ).toBeNull();
  });
});
