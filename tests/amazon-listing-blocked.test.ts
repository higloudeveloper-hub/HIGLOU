import { amazonListingBlockedReason } from "@/lib/amazon/sp-api";
import { describe, expect, it } from "vitest";

describe("Amazon listing suppression", () => {
  it("turns brand gating into a clear Seller Central message", () => {
    expect(
      amazonListingBlockedReason([
        {
          code: "18304",
          message: "You need approval to list in this brand.",
          severity: "ERROR",
          categories: ["QUALIFICATION_REQUIRED"],
          enforcements: { actions: [{ action: "LISTING_SUPPRESSED" }] },
        },
      ]),
    ).toMatch(/blocked this brand/i);
  });
});
