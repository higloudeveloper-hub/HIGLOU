import { createHash } from "crypto";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  generateEbayCsvFromTemplate,
  parseEbayTemplate,
  splitCsvLine,
} from "../lib/csv/ebay-template";
import { buildItemPhotoUrlValue } from "../lib/ebay/listing-helpers";
import { buildHiglouDescriptionHtml } from "../lib/ebay/description-html";
import { sanitizeEbayHtml } from "../lib/ebay/sanitize-html";
import { EXPECTED_SEED_TEMPLATE_SHA256 } from "../types/ebay";

const EXACT_INFO =
  "#INFO,Version=0.0.2,Template= eBay-draft-listings-template_US,,,,,,,,";

describe("official eBay draft template", () => {
  const filePath = path.join(
    process.cwd(),
    "templates",
    "ebay-draft-listing-template.csv",
  );
  const rawBuffer = readFileSync(filePath);
  const raw = rawBuffer.toString("utf8");

  it("keeps the seed hash intact", () => {
    const hash = createHash("sha256").update(rawBuffer).digest("hex").toUpperCase();
    expect(hash).toBe(EXPECTED_SEED_TEMPLATE_SHA256);
  });

  it("preserves the exact #INFO line including Template= space", () => {
    const parsed = parseEbayTemplate(raw);
    expect(parsed.meta.rawInfoLine).toBe(EXACT_INFO);
    expect(parsed.meta.rawInfoLine).toContain("Template= eBay-draft-listings-template_US");
    expect(parsed.meta.templateType).toBe("draft_listing");
    expect(parsed.headerLine.startsWith("Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)")).toBe(
      true,
    );
  });

  it("generates UTF-8 BOM CSV with Higlou HTML, HTTPS pipe photos, preserved metadata", () => {
    const description = sanitizeEbayHtml(
      buildHiglouDescriptionHtml({
        productTitle: "Chic Home Clayton Queen 10 Piece Comforter Set Yellow",
        productIntroduction: "Queen comforter set from Higlou Store inventory.",
        features: ["10-piece set", "Queen size"],
        itemCondition: "New",
        packageContents: ["Comforter", "Shams"],
      }),
    );

    const photoValue = buildItemPhotoUrlValue([
      "https://ir.ebaystatic.com/cr/v/c1/rsc/ebay_logo_512.png",
      "https://i.ebayimg.com/images/g/demo/s-l1600.jpg",
    ]);

    const csv = generateEbayCsvFromTemplate({
      templateRaw: raw,
      valuesByHeader: {
        "Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)":
          "Draft",
        "Custom label (SKU)": "CH-CLAYTON-QN-YLW",
        "Category ID": "177019",
        Title: "Chic Home Clayton Queen 10 Piece Comforter Set Yellow",
        UPC: "",
        Price: "49.99",
        Quantity: "1",
        "Item photo URL": photoValue,
        "Condition ID": "NEW",
        Description: description,
        Format: "FixedPrice",
      },
      dynamicCColumns: {
        "C:Brand": "Chic Home",
        "C:Size": "Queen",
      },
    });

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.startsWith("\uFEFF")).toBe(true);

    const withoutBom = csv.slice(1);
    const lines = withoutBom.trimEnd().split(/\r?\n/);
    expect(lines[0]).toBe(EXACT_INFO);
    expect(lines[0]).toContain("Template= eBay-");

    const headerCells = splitCsvLine(lines[4]);
    const rowCells = splitCsvLine(lines[5]);
    expect(headerCells.length).toBe(rowCells.length);
    expect(headerCells).toContain("C:Brand");
    expect(headerCells).toContain("C:Size");
    expect(headerCells[0]).toMatch(/^Action\(/);

    const photoIdx = headerCells.indexOf("Item photo URL");
    const descIdx = headerCells.indexOf("Description");
    const priceIdx = headerCells.indexOf("Price");
    expect(rowCells[priceIdx]).toBe("49.99");
    expect(rowCells[photoIdx]).toBe(
      "https://ir.ebaystatic.com/cr/v/c1/rsc/ebay_logo_512.png|https://i.ebayimg.com/images/g/demo/s-l1600.jpg",
    );
    expect(rowCells[descIdx]).toContain("HIGLOU STORE");
    expect(rowCells[descIdx]).toContain("Thank You for Shopping With Higlou Store");

    const outDir = path.join(process.cwd(), "tmp");
    mkdirSync(outDir, { recursive: true });
    const outFile = path.join(
      outDir,
      "Higlou_ChicHome_Clayton_Queen_2026-07-13.csv",
    );
    writeFileSync(outFile, csv, "utf8");
    const written = readFileSync(outFile);
    expect(written[0]).toBe(0xef);
    expect(written[1]).toBe(0xbb);
    expect(written[2]).toBe(0xbf);
  });

  it("appends Attribute Name/Value pairs for Create Drafts", () => {
    const csv = generateEbayCsvFromTemplate({
      templateRaw: raw,
      valuesByHeader: {
        "Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)":
          "Draft",
        "Category ID": "63897",
        Title: "Glacier Bay Dorind Collection Bathroom Faucet",
        Price: "89.00",
        Quantity: "1",
        Format: "FixedPrice",
      },
      dynamicCColumns: {
        "C:Brand": "Glacier Bay",
        "C:Type": "Bathroom Faucet",
        "C:Finish": "Brushed Nickel",
      },
      attributePairs: [
        { name: "Brand", value: "Glacier Bay" },
        { name: "Type", value: "Bathroom Faucet" },
        { name: "Finish", value: "Brushed Nickel" },
      ],
    });

    const withoutBom = csv.slice(1);
    const lines = withoutBom.trimEnd().split(/\r?\n/);
    const headerCells = splitCsvLine(lines[4]);
    const rowCells = splitCsvLine(lines[5]);
    expect(headerCells).toContain("Attribute1Name");
    expect(headerCells).toContain("Attribute1Value");
    expect(headerCells).toContain("C:Brand");
    expect(rowCells[headerCells.indexOf("Attribute1Name")]).toBe("Brand");
    expect(rowCells[headerCells.indexOf("Attribute1Value")]).toBe(
      "Glacier Bay",
    );
    expect(rowCells[headerCells.indexOf("Attribute2Name")]).toBe("Type");
    expect(rowCells[headerCells.indexOf("C:Finish")]).toBe("Brushed Nickel");
  });

  it("refuses inventing non-C policy columns via dynamic append", () => {
    expect(() =>
      generateEbayCsvFromTemplate({
        templateRaw: raw,
        valuesByHeader: {},
        dynamicCColumns: {
          "Shipping profile name": "should-fail",
        } as Record<string, string>,
      }),
    ).toThrow(/Refusing non-C column/);
  });

  it("can fill publish-ready location weight and shipping on a minimal template", () => {
    const minimal = [
      "#INFO,Version=0.0.2,Template= eBay-draft-listings-template_US",
      "Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8),Category ID,Title,Price,Quantity,Format",
      "Draft,15709,Test,10,1,FixedPrice",
    ].join("\n");

    const csv = generateEbayCsvFromTemplate({
      templateRaw: minimal,
      valuesByHeader: {
        "Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)":
          "Draft",
        "Category ID": "185035",
        Title: "Aquafina Water",
        Price: "2.00",
        Quantity: "1",
        Format: "FixedPrice",
        Location: "Logansport, IN",
        PostalCode: "46947",
        Country: "US",
        WeightMajor: "1",
        WeightMinor: "4",
        PackageType: "PackageThickEnvelope",
        MeasurementSystem: "ENGLISH",
        PackageLength: "10",
        PackageWidth: "5",
        PackageDepth: "5",
        ShippingType: "Flat",
        "Shipping service 1 option": "USPSGroundAdvantage",
        "Shipping service 1 cost": "0.00",
      },
      appendPublishReadyColumns: true,
    });

    const withoutBom = csv.slice(1);
    const lines = withoutBom.trimEnd().split(/\r?\n/);
    const headerCells = splitCsvLine(lines[1]);
    const rowCells = splitCsvLine(lines[2]);
    expect(headerCells).toContain("Location");
    expect(headerCells).toContain("Shipping service 1 option");
    expect(rowCells[headerCells.indexOf("Location")]).toBe("Logansport, IN");
    expect(rowCells[headerCells.indexOf("PostalCode")]).toBe("46947");
    expect(rowCells[headerCells.indexOf("WeightMajor")]).toBe("1");
    expect(
      rowCells[headerCells.indexOf("Shipping service 1 option")],
    ).toBe("USPSGroundAdvantage");
  });
});

describe("Higlou Store description HTML", () => {
  it("includes Higlou Store branding and sanitizes scripts", () => {
    const html = buildHiglouDescriptionHtml({
      productTitle: "Sample Product",
      productIntroduction: "A clean product summary.",
      features: ["Feature A"],
      itemCondition: "New",
      packageContents: ["1 item"],
      specs: [
        { label: "Brand", value: "Nike" },
        { label: "Size", value: "9" },
      ],
    });
    expect(html).toMatch(/HIGLOU STORE|Higlou Store/);
    expect(html).toContain("Thank You for Shopping With Higlou Store");
    expect(html).toContain("Product Details");
    expect(html).toContain("Nike");
    expect(html).not.toMatch(/Returns/i);
    expect(html).not.toMatch(/return policy/i);
    const dirty = `${html}<script>alert(1)</script>`;
    const clean = sanitizeEbayHtml(dirty);
    expect(clean).not.toContain("<script");
  });
});
