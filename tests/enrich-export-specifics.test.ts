import { describe, expect, it } from "vitest";
import { enrichItemSpecificsForExport } from "@/lib/ebay/enrich-export-specifics";

describe("enrichItemSpecificsForExport", () => {
  it("adds required Brand from listing when missing in itemSpecifics", () => {
    const { columns } = enrichItemSpecificsForExport({
      categoryId: "177019",
      itemSpecifics: [
        { key: "C:Type", value: "Comforter Set" },
        { key: "C:Color", value: "Blue" },
      ],
      brand: "Higlou",
      size: "Queen",
    });

    expect(columns["C:Brand"]).toBe("Higlou");
    expect(columns["C:Size"]).toBe("Queen");
    expect(columns["C:Type"]).toBe("Comforter Set");
  });

  it("uses Unbranded when brand is required but unknown", () => {
    const { columns } = enrichItemSpecificsForExport({
      categoryId: "177019",
      itemSpecifics: [{ key: "C:Type", value: "Comforter Set" }],
    });

    expect(columns["C:Brand"]).toBe("Unbranded");
    expect(columns["C:MPN"]).toBe("Does Not Apply");
  });

  it("pairs Brand with MPN to avoid eBay 25002 BrandMPN", () => {
    const { columns } = enrichItemSpecificsForExport({
      categoryId: "177019",
      brand: "Higlou",
      itemSpecifics: [{ key: "C:Type", value: "Comforter Set" }],
    });

    expect(columns["C:Brand"]).toBe("Higlou");
    expect(columns["C:MPN"]).toBe("Does Not Apply");
  });

  it("keeps explicit MPN when provided", () => {
    const { columns } = enrichItemSpecificsForExport({
      categoryId: "177019",
      brand: "Moen",
      mpn: "12345-BN",
      itemSpecifics: [],
    });

    expect(columns["C:Brand"]).toBe("Moen");
    expect(columns["C:MPN"]).toBe("12345-BN");
  });

  it("compacts spaced Home Depot-style MPNs", () => {
    const { columns } = enrichItemSpecificsForExport({
      categoryId: "117503",
      brand: "Hampton Bay",
      mpn: "1008 481 828",
      itemSpecifics: [],
    });
    expect(columns["C:MPN"]).toBe("1008481828");
  });

  it("fills faucet essentials + Attribute pairs from title cues", () => {
    const { columns, attributePairs } = enrichItemSpecificsForExport({
      categoryId: "99999",
      categoryName: "Kitchen Faucets",
      title:
        "Glacier Bay Dorind Collection Two Handle Pull-Down Bathroom Faucet",
      productType: "Bathroom Faucet",
      colors: ["Brushed Nickel"],
      materials: ["Metal"],
      features: ["Pull-Down", "Two Handle"],
      itemSpecifics: [],
    });

    expect(columns["C:Brand"]).toBe("Glacier Bay");
    expect(columns["C:Type"]).toBe("Bathroom Faucet");
    expect(columns["C:Finish"]).toBe("Brushed Nickel");
    expect(columns["C:Material"]).toBe("Metal");
    expect(columns["C:Number of Faucet Holes"]).toBeTruthy();
    expect(columns["C:Faucet Mounting Type"] || columns["C:Mounting Type"]).toBeTruthy();

    const brandPair = attributePairs.find((p) => p.name === "Brand");
    expect(brandPair?.value).toBe("Glacier Bay");
    expect(attributePairs.length).toBeGreaterThanOrEqual(4);
  });

  it("normalizes non-C keys into C: columns", () => {
    const { columns } = enrichItemSpecificsForExport({
      categoryId: "63897",
      itemSpecifics: [{ key: "Brand", value: "Moen" }],
      title: "Moen Kitchen Faucet",
    });
    expect(columns["C:Brand"]).toBe("Moen");
  });
});
