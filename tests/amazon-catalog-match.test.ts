import { describe, expect, it } from "vitest";
import {
  amazonSearchKeywords,
  extractModelCode,
  pickAmazonCatalogMatch,
  scoreAmazonCatalogHit,
} from "@/lib/amazon/catalog-match";

const hits = [
  {
    asin: "B0BPY8L57P",
    title: "DEWALT 20V Max Drywall Screwgun, Tool Only (DCF630B)",
  },
  {
    asin: "B0BPYBS82C",
    title:
      "DEWALT 20V Max Drywall Screwgun with (2) 2Ah Batteries and Charger (DCF630D2)",
  },
  {
    asin: "B0C917MJBP",
    title: "DEWALT 20V Max Drywall Screwgun, Tool Only (DCF630B) (Renewed)",
  },
];

describe("Amazon catalog auto-match", () => {
  it("reads DCF630 from a Higlou title", () => {
    expect(
      extractModelCode("DeWalt 20V MAX XR Brushless Drywall Screwgun DCF630"),
    ).toBe("DCF630");
  });

  it("searches Amazon by brand + model", () => {
    expect(
      amazonSearchKeywords({
        brand: "DeWalt",
        title: "DeWalt 20V MAX XR Brushless Drywall Screwgun DCF630",
      }),
    ).toBe("DeWalt DCF630");
  });

  it("picks the bare tool, not the battery kit or renewed listing", () => {
    const match = pickAmazonCatalogMatch(hits, {
      brand: "DeWalt",
      title: "DeWalt 20V MAX XR Brushless Drywall Screwgun DCF630",
    });
    expect(match?.asin).toBe("B0BPY8L57P");
    expect(
      scoreAmazonCatalogHit(hits[0], {
        title: "DeWalt 20V MAX XR Brushless Drywall Screwgun DCF630",
        brand: "DeWalt",
      }),
    ).toBeGreaterThan(
      scoreAmazonCatalogHit(hits[1], {
        title: "DeWalt 20V MAX XR Brushless Drywall Screwgun DCF630",
        brand: "DeWalt",
      }),
    );
  });

  it("still matches DCF630 when Higlou model is a long AI phrase", () => {
    const match = pickAmazonCatalogMatch(hits, {
      brand: "DeWalt",
      model: "20V MAX XR Brushless",
      title: "DeWalt 20V MAX XR Brushless Drywall Screwgun DCF630",
    });
    expect(match?.asin).toBe("B0BPY8L57P");
    expect(
      amazonSearchKeywords({
        brand: "DeWalt",
        model: "20V MAX XR Brushless",
        title: "DeWalt 20V MAX XR Brushless Drywall Screwgun DCF630",
      }),
    ).toBe("DeWalt DCF630");
  });

  it("matches Honeywell RTH2CWF-N to the X2S catalog title", () => {
    const match = pickAmazonCatalogMatch(
      [
        {
          asin: "B0DSGCDMPT",
          title: "Honeywell Home X2S Smart Wi-Fi Thermostat, Gray",
        },
        {
          asin: "B09X69FSMB",
          title: "Honeywell Home T5 Smart Wi-Fi Thermostat",
        },
        {
          asin: "B09TBGGLQB",
          title: "Honeywell Home RTH9600WF Smart Color Thermostat",
        },
      ],
      {
        brand: "Honeywell",
        model: "RTH2CWF-N",
        title: "Honeywell Home RTH2CWF-N Smart Thermostat",
      },
    );
    expect(match?.asin).toBe("B0DSGCDMPT");
  });

  it("matches Delta LDL18-PC and not the SN finish", () => {
    const match = pickAmazonCatalogMatch(
      [
        {
          asin: "B00NOARV9Q",
          title: "Delta Lyndall 18 in Wall Mount Towel Bar Bath Hardware Accessory",
        },
        {
          asin: "B00NOT2WAU",
          title: "Delta Ldl18-SN Towel Bar Quick Click Mounting",
        },
      ],
      {
        brand: "Delta",
        model: "LDL18-PC",
        title: 'Delta LDL18-PC Chrome Towel Bar 22.56"',
      },
    );
    expect(match?.asin).toBe("B00NOARV9Q");
  });

  it("picks the kit when the Higlou listing is a kit", () => {
    const match = pickAmazonCatalogMatch(hits, {
      brand: "DeWalt",
      model: "DCF630D2",
      title: "DeWalt DCF630 kit with 2 batteries and charger",
    });
    expect(match?.asin).toBe("B0BPYBS82C");
  });
});
