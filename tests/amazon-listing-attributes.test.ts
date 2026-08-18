import { describe, expect, it } from "vitest";
import {
  amazonListingHasPrice,
  buildAmazonListingAttributes,
  copyAmazonCatalogAttributes,
  countryOfOriginCode,
  fillAmazonAttributesFromIssues,
  fillAmazonRequiredAttributes,
  stripAmazonHtml,
} from "@/lib/amazon/listing-attributes";
import { AMAZON_US_MARKETPLACE_ID } from "@/lib/amazon/sp-config";

const thermostatSchema = {
  productType: "HVAC_CONTROL_THERMOSTAT",
  required: [
    "brand",
    "bullet_point",
    "color",
    "country_of_origin",
    "generic_keyword",
    "item_name",
    "manufacturer",
    "model_name",
    "model_number",
    "product_description",
    "required_product_compliance_certificate",
    "supplier_declared_dg_hz_regulation",
  ],
  properties: {
    brand: {},
    bullet_point: {},
    color: {},
    country_of_origin: {
      items: {
        required: ["value"],
        properties: {
          value: { enum: ["US", "CN", "MX"] },
          marketplace_id: {},
        },
      },
    },
    generic_keyword: {},
    item_name: {},
    manufacturer: {},
    model_name: {},
    model_number: {},
    product_description: {},
    required_product_compliance_certificate: {
      items: {
        required: ["value"],
        properties: {
          value: { enum: ["California Air Review Board (CARB)", "Not Applicable"] },
          marketplace_id: {},
        },
      },
    },
    supplier_declared_dg_hz_regulation: {
      items: {
        required: ["value"],
        properties: {
          value: { enum: ["not_applicable", "other"] },
        },
      },
    },
    merchant_suggested_asin: {},
    condition_type: {},
    fulfillment_availability: {},
    purchasable_offer: {},
    list_price: {},
    main_product_image_locator: {},
    skip_offer: {},
  },
};

describe("Amazon complete listing attributes", () => {
  it("maps country names to ISO codes", () => {
    expect(countryOfOriginCode("United States")).toBe("US");
    expect(countryOfOriginCode("China")).toBe("CN");
    expect(countryOfOriginCode("us")).toBe("US");
  });

  it("strips HTML from descriptions", () => {
    expect(stripAmazonHtml("<p>Smart <b>thermostat</b></p>")).toBe("Smart thermostat");
  });

  it("copies catalog facts and drops skip_offer", () => {
    const copied = copyAmazonCatalogAttributes(
      {
        brand: [{ value: "Honeywell Home", language_tag: "en_US" }],
        skip_offer: [{ value: true }],
        list_price: [{ value: 79.98, currency: "USD" }],
        color: [{ value: "Grey Buttons", language_tag: "en_US" }],
      },
      thermostatSchema,
    );
    expect(copied.brand).toBeTruthy();
    expect(copied.color).toBeTruthy();
    expect(copied.skip_offer).toBeUndefined();
    expect(copied.list_price).toBeUndefined();
  });

  it("builds a full thermostat listing with Higlou price and Amazon-required fields", () => {
    const attributes = buildAmazonListingAttributes({
      marketplaceId: AMAZON_US_MARKETPLACE_ID,
      asin: "B0DSGCDMPT",
      schema: thermostatSchema,
      catalog: {
        asin: "B0DSGCDMPT",
        title: "Honeywell Home X2S Smart Wi-Fi Thermostat, Gray",
        productType: "HVAC_CONTROL_THERMOSTAT",
        images: [],
        attributes: {
          brand: [{ value: "Honeywell Home", language_tag: "en_US" }],
          color: [{ value: "Grey Buttons", language_tag: "en_US" }],
          bullet_point: [{ value: "Control from the app", language_tag: "en_US" }],
          manufacturer: [{ value: "Resideo", language_tag: "en_US" }],
          model_number: [{ value: "RTH2CWF", language_tag: "en_US" }],
          model_name: [{ value: "X2S", language_tag: "en_US" }],
          list_price: [{ value: 79.98, currency: "USD" }],
          skip_offer: [{ value: true }],
        },
      },
      listing: {
        title: "Honeywell Home RTH2CWF-N Smart Thermostat",
        brand: "Honeywell",
        model: "RTH2CWF-N",
        price: 70,
        quantity: 1,
        description: "Wi-Fi thermostat imported from Home Depot with scheduling and app control.",
        features: ["Wi-Fi app control", "Energy Star scheduling"],
        images: ["https://images.example.com/thermostat.jpg"],
        countryOfManufacture: "United States",
        categoryName: "Programmable Thermostats",
      },
    });

    expect(attributes.skip_offer).toBeUndefined();
    expect(amazonListingHasPrice(attributes)).toBe(true);
    expect(
      (attributes.purchasable_offer as Array<{ our_price: Array<{ schedule: Array<{ value_with_tax: number }> }> }>)[0]
        .our_price[0].schedule[0].value_with_tax,
    ).toBe(70);
    expect((attributes.list_price as Array<{ value: number }>)[0].value).toBe(70);
    expect((attributes.item_name as Array<{ value: string }>)[0].value).toContain("RTH2CWF-N");
    expect((attributes.brand as Array<{ value: string }>)[0].value).toBe("Honeywell Home");
    expect((attributes.color as Array<{ value: string }>)[0].value).toBe("Grey Buttons");
    expect((attributes.bullet_point as Array<{ value: string }>).length).toBeGreaterThanOrEqual(2);
    expect((attributes.product_description as Array<{ value: string }>)[0].value).toMatch(/Wi-Fi thermostat/i);
    expect((attributes.country_of_origin as Array<{ value: string }>)[0].value).toBe("US");
    expect(
      (attributes.required_product_compliance_certificate as Array<{ value: string }>)[0].value,
    ).toBe("Not Applicable");
    expect(
      (attributes.main_product_image_locator as Array<{ media_location: string }>)[0].media_location,
    ).toMatch(/^https:/);
    expect(attributes.generic_keyword).toBeTruthy();
  });

  it("fills Amazon missing-attribute issues so the listing can go up complete", () => {
    const { attributes, filled } = fillAmazonAttributesFromIssues({
      marketplaceId: AMAZON_US_MARKETPLACE_ID,
      schema: thermostatSchema,
      listing: {
        title: "Honeywell Home RTH2CWF-N Smart Thermostat",
        brand: "Honeywell",
        model: "RTH2CWF-N",
        price: 70,
        quantity: 1,
        countryOfManufacture: "United States",
      },
      attributes: { brand: [{ value: "Honeywell Home" }] },
      issues: [
        {
          message: "The attribute 'country_of_origin' is required.",
          attributeNames: ["country_of_origin"],
        },
        {
          message: "A value for product_description is required.",
          attributeNames: ["product_description"],
        },
      ],
    });
    expect(filled).toEqual(expect.arrayContaining(["country_of_origin"]));
    expect((attributes.country_of_origin as Array<{ value: string }>)[0].value).toBe("US");
    expect((attributes.product_description as Array<{ value: string }>)[0].value).toMatch(
      /RTH2CWF-N/,
    );
  });

  it("fills required gaps when Amazon catalog omits them", () => {
    const filled = fillAmazonRequiredAttributes({
      marketplaceId: AMAZON_US_MARKETPLACE_ID,
      schema: thermostatSchema,
      attributes: {},
      listing: {
        title: "Delta 18 in Towel Bar Chrome",
        brand: "Delta",
        model: "LDL18-PC",
        price: 24,
        quantity: 2,
        color: "Chrome",
        countryOfManufacture: "China",
      },
    });
    expect((filled.brand as Array<{ value: string }>)[0].value).toBe("Delta");
    expect((filled.model_number as Array<{ value: string }>)[0].value).toBe("LDL18-PC");
    expect((filled.color as Array<{ value: string }>)[0].value).toBe("Chrome");
    expect((filled.country_of_origin as Array<{ value: string }>)[0].value).toBe("CN");
  });
});
