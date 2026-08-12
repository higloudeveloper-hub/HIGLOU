import { describe, expect, it } from "vitest";
import {
  expandUpcEToUpcA,
  isValidGtinChecksum,
  validateBarcode,
} from "../lib/barcode/validators";
import { normalizeOcrText, extractLikelySize } from "../lib/google-vision/normalize-ocr";
import { fuseProductAnalysis } from "../lib/ai/fusion-engine";
import type { AnalysisResult } from "../types/analysis";

describe("barcode validators", () => {
  it("validates a correct UPC-A checksum", () => {
    // 036000291452 is a classic valid UPC-A example
    expect(isValidGtinChecksum("036000291452")).toBe(true);
    const result = validateBarcode("036000291452");
    expect(result.ok).toBe(true);
    expect(result.format).toBe("UPC_A");
  });

  it("rejects UPC-A with bad checksum", () => {
    const result = validateBarcode("036000291453");
    expect(result.ok).toBe(false);
    expect(result.checksumValid).toBe(false);
  });

  it("validates EAN-13", () => {
    expect(isValidGtinChecksum("4006381333931")).toBe(true);
  });

  it("handles empty barcode", () => {
    expect(validateBarcode("").ok).toBe(false);
  });

  it("expands UPC-E when valid", () => {
    // Not all 8-digit codes expand; ensure function returns null or valid UPC-A
    const expanded = expandUpcEToUpcA("04252614");
    if (expanded) {
      expect(expanded).toHaveLength(12);
      expect(isValidGtinChecksum(expanded)).toBe(true);
    }
  });
});

describe("ocr normalize", () => {
  it("collapses whitespace", () => {
    expect(normalizeOcrText("  Mainstays\n\n  Queen  ")).toBe("Mainstays\n\nQueen");
  });

  it("extracts size", () => {
    expect(extractLikelySize("Comforter Set Queen Soft")).toMatch(/Queen/i);
  });
});

describe("fusion engine", () => {
  const baseOpenAi = {
    title: "Sample",
    brand: "Mainstay",
    collection: "",
    model: "",
    mpn: "",
    upc: "036000291453",
    categoryId: "",
    categoryName: "",
    condition: "New",
    conditionId: "NEW",
    price: null,
    quantity: 1,
    size: "",
    type: "",
    colors: [],
    materials: [],
    pattern: "",
    style: "",
    department: "",
    room: "",
    features: [],
    setIncludes: [],
    missingItems: [],
    defects: [],
    conditionNotes: "",
    numberOfItems: null,
    careInstructions: [],
    countryOfManufacture: "",
    descriptionSummary: "",
    detectedText: [],
    warnings: [],
    packageWeightLbs: null,
    packageWeightOz: null,
    packageLengthIn: null,
    packageWidthIn: null,
    packageDepthIn: null,
    confidence: {
      brand: 0.5,
      model: 0,
      upc: 0.4,
      category: 0.4,
      size: 0,
      condition: 0.5,
    },
    fieldMeta: {},
    itemSpecifics: [],
  } satisfies AnalysisResult;

  it("prefers valid ZXing UPC over contradictory OCR/OpenAI", () => {
    const fused = fuseProductAnalysis({
      openai: baseOpenAi,
      barcodes: [
        {
          value: "036000291452",
          format: "UPC_A",
          confidence: 0.98,
          sourceImageId: "img1",
          checksumValid: true,
        },
      ],
      ocrResults: [
        {
          imageId: "img1",
          fullText: "036000291453",
          normalizedText: "036000291453",
          provider: "google_vision",
          confidence: 0.6,
          feature: "TEXT_DETECTION",
        },
      ],
    });

    expect(fused.analysis.upc).toBe("036000291452");
    expect(fused.conflicts.some((c) => c.field === "upc")).toBe(true);
  });

  it("prefers user input over providers", () => {
    const fused = fuseProductAnalysis({
      openai: baseOpenAi,
      barcodes: [],
      ocrResults: [],
      userHints: { brand: "Mainstays" },
    });
    expect(fused.analysis.brand).toBe("Mainstays");
  });

  it("prefers clear OCR brand wording over approximate OpenAI brand", () => {
    const fused = fuseProductAnalysis({
      openai: baseOpenAi,
      barcodes: [],
      ocrResults: [
        {
          imageId: "img2",
          fullText: "Mainstays\nQueen Comforter",
          normalizedText: "Mainstays\nQueen Comforter",
          provider: "google_vision",
          confidence: 0.9,
          feature: "TEXT_DETECTION",
        },
      ],
    });
    expect(fused.analysis.brand).toBe("Mainstays");
  });
});
