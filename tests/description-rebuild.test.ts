import { describe, expect, it } from "vitest";
import {
  buildListingDescriptionHtml,
  isWeakDescriptionHtml,
  synthesizeDescriptionSummary,
} from "../lib/ebay/description-html";
import { sanitizeEbayHtml } from "../lib/ebay/sanitize-html";

describe("description rebuild for drafts", () => {
  it("synthesizes intro when summary is empty", () => {
    const summary = synthesizeDescriptionSummary({
      title: "Chic Home Clayton Queen Comforter Set Yellow",
      brand: "Chic Home",
      size: "Queen",
      features: ["10-piece set", "Machine washable"],
      descriptionSummary: "",
    });
    expect(summary.length).toBeGreaterThanOrEqual(40);
    expect(summary).toMatch(/Clayton|Chic Home|10-piece/i);
  });

  it("keeps a solid AI summary", () => {
    const solid =
      "This queen comforter set includes coordinated shams and a stylish yellow finish for a complete bedroom refresh.";
    expect(
      synthesizeDescriptionSummary({
        title: "Anything",
        descriptionSummary: solid,
      }),
    ).toBe(solid);
  });

  it("builds full Higlou HTML from listing fields", () => {
    const html = sanitizeEbayHtml(
      buildListingDescriptionHtml({
        title: "Test Lamp Brass",
        brand: "Acme",
        features: ["LED bulb included"],
        setIncludes: ["Lamp", "Shade"],
        descriptionSummary: "",
        condition: "New",
      }),
    );
    expect(html).toMatch(/Higlou Store/i);
    expect(html).toMatch(/Test Lamp Brass/);
    expect(html).toMatch(/LED bulb included/);
    expect(html).toMatch(/Lamp/);
    expect(isWeakDescriptionHtml(html)).toBe(false);
  });

  it("flags empty and placeholder-only HTML as weak", () => {
    expect(isWeakDescriptionHtml("")).toBe(true);
    expect(isWeakDescriptionHtml("<p></p>")).toBe(true);
  });
});
