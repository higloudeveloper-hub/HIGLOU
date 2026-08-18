import {
  amazonBrandGatingReason,
  amazonIncompleteListingReason,
  amazonListingBlockedReason,
} from "@/lib/amazon/sp-api";
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
    expect(
      amazonBrandGatingReason([
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

  it("does not treat a valid listing as incomplete", () => {
    expect(amazonIncompleteListingReason([], "VALID")).toBe("");
    expect(
      amazonIncompleteListingReason(
        [{ message: "Price is high", severity: "WARNING" }],
        "VALID",
      ),
    ).toBe("");
  });

  it("keeps incomplete Amazon listings from looking published", () => {
    expect(
      amazonIncompleteListingReason(
        [
          {
            message: "The attribute country_of_origin is required.",
            severity: "ERROR",
            attributeNames: ["country_of_origin"],
            categories: ["MISSING_ATTRIBUTE"],
          },
        ],
        "INVALID",
      ),
    ).toMatch(/not ready|country_of_origin/i);
  });
});
