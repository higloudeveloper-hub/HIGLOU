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
    expect((attributes.item_name as Array<{ value: string }>)[0].value).toMatch(/X2S/);
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

  it("keeps Amazon catalog photos and brand when attaching to an existing ASIN", () => {
    const attributes = buildAmazonListingAttributes({
      marketplaceId: AMAZON_US_MARKETPLACE_ID,
      asin: "B08NESTHAT",
      schema: thermostatSchema,
      catalog: {
        asin: "B08NESTHAT",
        title: "Google Nest Thermostat - Smart Wi-Fi Thermostat",
        productType: "HVAC_CONTROL_THERMOSTAT",
        images: ["https://images.example.com/nest-catalog.jpg"],
        brand: "Google",
        attributes: {
          brand: [{ value: "Google", language_tag: "en_US" }],
        },
      },
      listing: {
        title: "Google Nest Thermostat - Smart Wi-Fi Thermostat",
        brand: "Google Nest",
        model: "GA02081-US",
        price: 80,
        quantity: 1,
        description: "Smart Wi-Fi thermostat imported from Amazon with app control.",
        features: ["Wi-Fi app control", "Energy saving schedule"],
        images: ["https://images.example.com/nest.jpg"],
        countryOfManufacture: "United States",
        categoryName: "Programmable Thermostats - Google",
      },
    });
    expect((attributes.brand as Array<{ value: string }>)[0].value).toBe("Google");
    expect(
      (attributes.main_product_image_locator as Array<{ media_location: string }>)[0]
        .media_location,
    ).toMatch(/^https:/);
    expect(
      (attributes.merchant_suggested_asin as Array<{ value: string }>)[0].value,
    ).toBe("B08NESTHAT");
    expect(amazonListingHasPrice(attributes)).toBe(true);
  });

  it("drops brand after Amazon 5995 but keeps photos and price", () => {
    const { attributes, filled } = fillAmazonAttributesFromIssues({
      marketplaceId: AMAZON_US_MARKETPLACE_ID,
      schema: thermostatSchema,
      catalog: {
        asin: "B08NESTHAT",
        title: "Google Nest Thermostat",
        productType: "HVAC_CONTROL_THERMOSTAT",
        images: [],
        attributes: {
          brand: [{ value: "Google", language_tag: "en_US" }],
        },
      },
      listing: {
        title: "Google Nest Thermostat - Smart Wi-Fi Thermostat",
        brand: "Google Nest",
        price: 80,
        quantity: 1,
        countryOfManufacture: "United States",
      },
      attributes: {
        brand: [{ value: "Google Nest" }],
        merchant_suggested_asin: [
          { value: "B08NESTHAT", marketplace_id: AMAZON_US_MARKETPLACE_ID },
        ],
        purchasable_offer: [
          {
            audience: "ALL",
            currency: "USD",
            marketplace_id: AMAZON_US_MARKETPLACE_ID,
            our_price: [{ schedule: [{ value_with_tax: 80 }] }],
          },
        ],
        main_product_image_locator: [
          {
            media_location: "https://images.example.com/nest.jpg",
            marketplace_id: AMAZON_US_MARKETPLACE_ID,
          },
        ],
      },
      issues: [
        {
          message:
            "You may not change the brand name on this ASIN. Please use the brand name currently shown on the ASIN detail page. If you believe you are using the correct brand name, contact Seller support and mention the error code 5995",
        },
      ],
    });
    expect(filled).toEqual(expect.arrayContaining(["brand"]));
    expect(attributes.brand).toBeUndefined();
    expect(attributes.manufacturer).toBeUndefined();
    expect(
      (attributes.merchant_suggested_asin as Array<{ value: string }>)[0].value,
    ).toBe("B08NESTHAT");
    expect(
      (attributes.main_product_image_locator as Array<{ media_location: string }>)[0]
        .media_location,
    ).toMatch(/nest\.jpg/);
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

  it("trims duplicate color and sends a tool-only battery pack for a Ryobi drill", () => {
    const drillSchema = {
      productType: "DRILL",
      required: [
        "brand",
        "bullet_point",
        "country_of_origin",
        "included_components",
        "item_length_width_height",
        "item_name",
        "manufacturer",
        "model_name",
        "model_number",
        "power_source_type",
        "product_description",
        "supplier_declared_dg_hz_regulation",
        "unit_count",
        "voltage",
      ],
      properties: {
        brand: {},
        bullet_point: {},
        color: { maxUniqueItems: 1 },
        country_of_origin: {},
        contains_battery_or_cell: {
          items: { properties: { value: { type: "boolean" } } },
        },
        batteries_included: {
          items: { properties: { value: { type: "boolean" } } },
        },
        batteries_required: {
          items: { properties: { value: { type: "boolean" } } },
        },
        battery: {},
        lithium_battery: {},
        included_components: {},
        item_length_width_height: {
          items: {
            properties: {
              length: { properties: { unit: { enum: ["inches"] } } },
              width: {},
              height: {},
            },
          },
        },
        item_name: {},
        manufacturer: {},
        model_name: {},
        model_number: {},
        power_source_type: {
          items: {
            properties: { value: { enum: ["battery", "corded_electric"] } },
          },
        },
        product_description: {},
        supplier_declared_dg_hz_regulation: {
          items: {
            properties: { value: { enum: ["not_applicable", "other"] } },
          },
        },
        unit_count: {
          items: { properties: { type: { enum: ["count"] } } },
        },
        voltage: {
          items: { properties: { unit: { enum: ["volts"] } } },
        },
        merchant_suggested_asin: {},
        condition_type: {},
        fulfillment_availability: {},
        purchasable_offer: {},
        list_price: {},
        main_product_image_locator: {},
      },
    };

    const attributes = buildAmazonListingAttributes({
      marketplaceId: AMAZON_US_MARKETPLACE_ID,
      asin: "B008E76BZ4",
      schema: drillSchema,
      catalog: {
        asin: "B008E76BZ4",
        title: "ONEAND 18V Cordless Right Angle Drill",
        productType: "DRILL",
        images: [],
        attributes: {
          brand: [{ value: "Ryobi", language_tag: "en_US" }],
          color: [
            { value: "Green", language_tag: "en_US" },
            { value: "Yellow", language_tag: "en_US" },
          ],
          battery: [{ weight: [{ value: 0 }] }],
          lithium_battery: [{ energy_content: [{ value: 0 }] }],
          model_number: [{ value: "#P241", language_tag: "en_US" }],
        },
      },
      listing: {
        title: "Ryobi ONE+ 18V Cordless Right Angle Drill - Tool Only",
        brand: "Ryobi",
        model: "P241",
        price: 55,
        quantity: 1,
        description: "Ryobi ONE+ right angle drill, tool only, no battery included.",
        features: ["18V ONE+ platform", "Right angle head"],
        images: ["https://images.example.com/p241.jpg"],
        packageLengthIn: 12,
        packageWidthIn: 4,
        packageDepthIn: 3,
      },
    });

    expect((attributes.color as unknown[]).length).toBe(1);
    expect((attributes.color as Array<{ value: string }>)[0].value).toBe("Green");
    expect(attributes.battery).toBeUndefined();
    expect(attributes.lithium_battery).toBeUndefined();
    expect(
      (attributes.contains_battery_or_cell as Array<{ value: boolean }>)[0].value,
    ).toBe(false);
    expect(
      (attributes.batteries_included as Array<{ value: boolean }>)[0].value,
    ).toBe(false);
    expect(
      (attributes.batteries_required as Array<{ value: boolean }>)[0].value,
    ).toBe(true);
    expect((attributes.voltage as Array<{ value: number; unit: string }>)[0]).toEqual(
      expect.objectContaining({ value: 18, unit: "volts" }),
    );
    expect(
      (attributes.power_source_type as Array<{ value: string }>)[0].value,
    ).toBe("battery");
    expect(
      (attributes.included_components as Array<{ value: string }>)[0].value,
    ).toMatch(/tool only/i);
    expect((attributes.unit_count as Array<{ value: number }>)[0].value).toBe(1);
    const dims = attributes.item_length_width_height as Array<{
      length: { value: number; unit: string };
    }>;
    expect(dims[0].length.value).toBe(12);
    expect(dims[0].length.unit).toBe("inches");
  });

  it("creates a new Amazon listing from Higlou facts and UPC when there is no ASIN", () => {
    const attributes = buildAmazonListingAttributes({
      marketplaceId: AMAZON_US_MARKETPLACE_ID,
      schema: thermostatSchema,
      listing: {
        title: "Defiant Max Detect 240 Black Motion Sensing Flood Light",
        brand: "Defiant",
        model: "17000148",
        upc: "047113170014",
        price: 50,
        quantity: 1,
        description: "Wired outdoor three-head LED motion security flood light.",
        features: ["Motion sensing", "Three LED heads"],
        images: ["https://images.example.com/defiant.jpg"],
      },
    });
    expect(attributes.merchant_suggested_asin).toBeUndefined();
    expect(
      (attributes.externally_assigned_product_identifier as Array<{ value: string; type: string }>)[0],
    ).toEqual(
      expect.objectContaining({
        type: "upc",
        value: "047113170014",
      }),
    );
    expect((attributes.item_name as Array<{ value: string }>)[0].value).toMatch(/Defiant/);
    expect((attributes.model_number as Array<{ value: string }>)[0].value).toBe("17000148");
  });

  it("maps Amazon display-name battery issues to snake_case and does not copy incomplete lithium", () => {
    const drillSchema = {
      productType: "DRILL",
      required: ["item_name"],
      properties: {
        item_name: {},
        contains_battery_or_cell: {
          items: { properties: { value: { type: "boolean" } } },
        },
        batteries_included: {
          items: { properties: { value: { type: "boolean" } } },
        },
        batteries_required: {
          items: { properties: { value: { type: "boolean" } } },
        },
        battery: {},
        lithium_battery: {},
        color: { maxUniqueItems: 1 },
        merchant_suggested_asin: {},
        condition_type: {},
        fulfillment_availability: {},
        purchasable_offer: {},
        list_price: {},
      },
    };
    const { attributes } = fillAmazonAttributesFromIssues({
      marketplaceId: AMAZON_US_MARKETPLACE_ID,
      schema: drillSchema,
      listing: {
        title: "Ryobi ONE+ 18V Cordless Right Angle Drill - Tool Only",
        brand: "Ryobi",
        model: "P241",
        price: 55,
        quantity: 1,
      },
      catalog: {
        asin: "B008E76BZ4",
        title: "ONEAND P241",
        productType: "DRILL",
        images: [],
        attributes: {
          battery: [{ weight: [{ value: 1 }] }],
          lithium_battery: [{ energy_content: [{ value: 2 }] }],
          color: [{ value: "Green" }, { value: "Yellow" }],
        },
      },
      attributes: {
        color: [{ value: "Green" }, { value: "Yellow" }],
        battery: [{ weight: [{ value: 1 }] }],
      },
      issues: [
        {
          message: "'Contains Battery or Cell' is required but missing.",
        },
        {
          message:
            "A maximum of 1 occurrence(s) is/are allowed for the attribute Color but it currently occurs 2 times.",
        },
        {
          message: "'Battery Weight Unit' is required but missing.",
          attributeNames: ["battery"],
        },
        {
          message: "'Lithium Battery Energy Content Unit' is required but missing.",
        },
      ],
    });
    expect((attributes.color as unknown[]).length).toBe(1);
    expect(attributes.battery).toBeUndefined();
    expect(attributes.lithium_battery).toBeUndefined();
    expect(
      (attributes.contains_battery_or_cell as Array<{ value: boolean }>)[0].value,
    ).toBe(false);
    expect(
      (attributes.batteries_required as Array<{ value: boolean }>)[0].value,
    ).toBe(true);
  });

  it("fills part number, nested base material, and battery enum for outdoor furniture", () => {
    const tableSchema = {
      productType: "TABLE",
      required: ["item_name", "part_number", "base", "contains_battery_or_cell"],
      properties: {
        item_name: {},
        part_number: {},
        brand: {},
        manufacturer: {},
        material: {},
        base: {
          items: {
            properties: {
              material: {
                items: {
                  properties: {
                    value: {
                      enum: ["high_density_polyethylene", "steel", "wood"],
                    },
                  },
                },
              },
            },
          },
        },
        contains_battery_or_cell: {
          items: {
            properties: { value: { enum: ["yes", "no"] } },
          },
        },
        merchant_suggested_asin: {},
        condition_type: {},
        fulfillment_availability: {},
        purchasable_offer: {},
        list_price: {},
        main_product_image_locator: {},
      },
    };
    const attributes = buildAmazonListingAttributes({
      marketplaceId: AMAZON_US_MARKETPLACE_ID,
      schema: tableSchema,
      listing: {
        title: "Blue Outdoor Side Table with Shelf - Weather Resistant HDPE",
        brand: "Generic",
        material: "HDPE",
        sku: "HD-301460651",
        price: 55,
        quantity: 1,
        description: "Weather resistant HDPE outdoor side table with a lower shelf.",
        images: ["https://images.example.com/table.jpg"],
      },
    });
    expect((attributes.part_number as Array<{ value: string }>)[0].value).toBe(
      "301460651",
    );
    expect(
      (attributes.base as Array<{ material: Array<{ value: string }> }>)[0]
        .material[0].value,
    ).toBe("high_density_polyethylene");
    expect(
      (attributes.contains_battery_or_cell as Array<{ value: string }>)[0].value,
    ).toBe("no");
  });

  it("maps Amazon furniture validation issues to part number and base material", () => {
    const tableSchema = {
      productType: "TABLE",
      required: ["item_name"],
      properties: {
        item_name: {},
        part_number: {},
        base: {
          items: {
            properties: {
              material: {
                items: {
                  properties: {
                    value: { enum: ["high_density_polyethylene", "steel"] },
                  },
                },
              },
            },
          },
        },
        contains_battery_or_cell: {
          items: { properties: { value: { enum: ["yes", "no"] } } },
        },
        merchant_suggested_asin: {},
        condition_type: {},
        fulfillment_availability: {},
        purchasable_offer: {},
        list_price: {},
      },
    };
    const { attributes } = fillAmazonAttributesFromIssues({
      marketplaceId: AMAZON_US_MARKETPLACE_ID,
      schema: tableSchema,
      listing: {
        title: "Blue Outdoor Side Table with Shelf - Weather Resistant HDPE",
        brand: "Generic",
        material: "HDPE",
        mpn: "ST-55",
        price: 55,
        quantity: 1,
      },
      attributes: {
        contains_battery_or_cell: [{ value: false }],
      },
      issues: [
        { message: "'Part Number' is required but missing." },
        {
          message:
            "The field 'material#1.value' for the attribute 'Base Material' does not have enough values. The required minimum is '1' value(s).",
        },
        {
          message:
            "We can't accept the false you entered for Contains Battery or Cell.",
        },
      ],
    });
    expect((attributes.part_number as Array<{ value: string }>)[0].value).toBe(
      "ST-55",
    );
    expect(
      (attributes.base as Array<{ material: Array<{ value: string }> }>)[0]
        .material[0].value,
    ).toBe("high_density_polyethylene");
    expect(
      (attributes.contains_battery_or_cell as Array<{ value: string }>)[0].value,
    ).toBe("no");
  });
});
