import { describe, expect, it } from "vitest";
import {
  STORE_BRANDING_DEFAULTS,
  cloneStoreBranding,
} from "../config/store-branding";
import { STORE_PRESETS, DESCRIPTION_TEMPLATES } from "../config/description-templates";
import {
  buildHiglouDescriptionHtml,
  buildListingDescriptionHtml,
} from "../lib/ebay/description-html";
import { sanitizeEbayHtml } from "../lib/ebay/sanitize-html";

const sample = {
  productTitle: "Brass Desk Lamp",
  productIntroduction: "A solid brass lamp with warm light for reading.",
  features: ["LED compatible", "Weighted base"],
  itemCondition: "New",
  packageContents: ["Lamp", "Shade"],
  specs: [
    { label: "Brand", value: "Acme" },
    { label: "Color", value: "Brass" },
  ],
};

describe("multi-store description templates", () => {
  it("exposes five professional templates", () => {
    expect(DESCRIPTION_TEMPLATES.map((t) => t.id)).toEqual([
      "classic",
      "modern",
      "editorial",
      "luxury",
      "fresh",
    ]);
  });

  it("renders each template with the configured store name", () => {
    for (const template of DESCRIPTION_TEMPLATES) {
      const branding = cloneStoreBranding({
        ...STORE_BRANDING_DEFAULTS,
        storeName: "North Star Goods",
        storeNameDisplay: "NORTH STAR GOODS",
        templateId: template.id,
        colors: template.suggestedColors,
      });
      const html = sanitizeEbayHtml(
        buildHiglouDescriptionHtml(sample, branding),
      );
      expect(html).toMatch(/North Star Goods|NORTH STAR GOODS/i);
      expect(html).toMatch(/Brass Desk Lamp/);
      expect(html).toMatch(/LED compatible/);
    }
  });

  it("applies store presets into listing HTML", () => {
    for (const preset of STORE_PRESETS) {
      const html = sanitizeEbayHtml(
        buildListingDescriptionHtml(
          {
            title: "Test Item",
            features: ["Feature A"],
            setIncludes: ["Item"],
            descriptionSummary: "A complete product summary for the listing.",
            condition: "New",
          },
          {
            ...STORE_BRANDING_DEFAULTS,
            ...preset.branding,
            colors: preset.branding.colors,
            returnPolicyText: "",
            warrantyInformation: "",
            logoUrl: "",
          },
        ),
      );
      expect(html).toMatch(new RegExp(preset.branding.storeName, "i"));
    }
  });
});
