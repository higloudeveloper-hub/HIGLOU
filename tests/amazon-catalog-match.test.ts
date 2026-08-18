import { describe, expect, it } from "vitest";
import {
  amazonSearchKeywords,
  extractModelCode,
  listingLooksBareTool,
  pickAmazonCatalogMatch,
  pickExactAmazonCatalog,
  resolveAmazonModelCode,
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
          identifiers: ["RTH2CWF", "Honeywell Home"],
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
          identifiers: ["LDL18-PC", "DELTA"],
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

  it("matches Ryobi P241 even when Amazon titles it ONEAND and the Home Depot UPC is absent", () => {
    const match = pickAmazonCatalogMatch(
      [
        {
          asin: "B08XF7BWQ4",
          title:
            "RYOBI ONE+ HP 18V Brushless Cordless Compact 3/8 in. Right Angle Drill (Tool Only)",
          identifiers: ["PSBRA02B"],
        },
        {
          asin: "B008E76BZ4",
          title: "ONEAND 18V Cordless 3/8 in. Right Angle Drill Tool-ONLY",
          identifiers: ["#P241", "RYOBI"],
        },
        {
          asin: "B084GW6W4H",
          title: "RYOBI Right Angle Drill Attachment 1/2 TO 3/8",
        },
      ],
      {
        brand: "Ryobi",
        model: "P241",
        title: "Ryobi ONE+ 18V Cordless Right Angle Drill - Tool Only",
      },
    );
    expect(match?.asin).toBe("B008E76BZ4");
  });

  it("picks the kit when the Higlou listing is a kit", () => {
    const match = pickAmazonCatalogMatch(hits, {
      brand: "DeWalt",
      model: "DCF630D2",
      title: "DeWalt DCF630 kit with 2 batteries and charger",
    });
    expect(match?.asin).toBe("B0BPYBS82C");
  });

  it("treats Tool Only as a bare tool, not a kit", () => {
    expect(
      listingLooksBareTool("Ryobi ONE+ 18V Cordless Right Angle Drill - Tool Only"),
    ).toBe(true);
  });

  it("does not treat the brand name as the Amazon model", () => {
    expect(
      resolveAmazonModelCode({
        brand: "KSIPZE",
        model: "KSIPZE",
        title: "KSIPZE 100FT RGB LED Strip Light with Remote and App Control",
      }),
    ).not.toBe("KSIPZE");
  });

  it("matches numeric Home Depot models like Defiant 17000148", () => {
    expect(
      extractModelCode("Defiant Max Detect 240 17000148"),
    ).toBe("17000148");
    const hit = {
      asin: "B0EXAMPLE01",
      title: "Defiant 240-Degree Black Motion LED Security Light",
      identifiers: ["17000148"],
    };
    expect(
      scoreAmazonCatalogHit(hit, {
        brand: "Defiant",
        model: "17000148",
        title: "Defiant Max Detect 240 Black Motion Sensing Wired Outdoor",
      }),
    ).toBeGreaterThanOrEqual(45);
    expect(
      pickExactAmazonCatalog(
        [
          hit,
          {
            asin: "B0SIMILAR99",
            title: "Defiant 180-Degree Motion Security Light",
            identifiers: ["12345678"],
          },
        ],
        {
          brand: "Defiant",
          model: "17000148",
          title: "Defiant Max Detect 240 Black Motion Sensing",
        },
      )?.asin,
    ).toBe("B0EXAMPLE01");
  });
});
