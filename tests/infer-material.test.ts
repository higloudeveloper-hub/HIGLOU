import { describe, expect, it } from "vitest";
import {
  extractMaterialsFromOcrText,
  inferMaterialsFromContext,
  resolveMaterialEvidence,
} from "@/lib/ai/infer-material";
import { fuseProductAnalysis } from "@/lib/ai/fusion-engine";
import type { AnalysisResult } from "@/types/analysis";

const baseOpenAi = {
  title: "Sample",
  brand: "",
  collection: "",
  model: "",
  mpn: "",
  upc: "",
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
    brand: 0,
    model: 0,
    upc: 0,
    category: 0,
    size: 0,
    condition: 0.7,
  },
  fieldMeta: {},
  itemSpecifics: [],
} satisfies AnalysisResult;

describe("infer-material", () => {
  it("reads printed material from OCR text", () => {
    const result = extractMaterialsFromOcrText(
      "Commercial Electric Flood Light\nMaterial: Die-cast Aluminum",
    );
    expect(result?.materials).toContain("Die-cast Aluminum");
    expect(result?.confidence).toBeGreaterThan(0.8);
  });

  it("infers Metal for outdoor flood lights from product context", () => {
    const result = inferMaterialsFromContext({
      title: "Commercial Electric Flood Light",
      productType: "Flood Light",
      categoryName: "Outdoor Lighting",
      colors: ["Dark Bronze"],
    });
    expect(result?.materials).toEqual(["Metal"]);
    expect(result?.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("prefers OCR over visual inference", () => {
    const result = resolveMaterialEvidence({
      openaiMaterials: ["Metal"],
      ocrText: "Made of 100% Cotton",
      colors: ["Dark Bronze"],
      productType: "Flood Light",
      title: "Flood Light",
    });
    expect(result.materials).toEqual(["Cotton"]);
    expect(result.needsReview).toBe(false);
  });

  it("falls back to contextual inference when AI and OCR are empty", () => {
    const result = resolveMaterialEvidence({
      openaiMaterials: [],
      colors: ["Dark Bronze"],
      productType: "Flood Light",
      categoryName: "Outdoor Lighting",
      title: "Commercial Electric Flood Light",
    });
    expect(result.materials).toEqual(["Metal"]);
    expect(result.needsReview).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
  });
});

describe("fuseProductAnalysis materials", () => {
  it("adds estimated material for lighting products without printed material", () => {
    const fused = fuseProductAnalysis({
      openai: {
        ...baseOpenAi,
        brand: "Commercial Electric",
        type: "Flood Light",
        categoryName: "Outdoor Lighting",
        title: "Commercial Electric Flood Light",
        colors: ["Dark Bronze"],
        confidence: {
          ...baseOpenAi.confidence,
          brand: 0.8,
          category: 0.7,
        },
      },
      barcodes: [],
      ocrResults: [
        {
          imageId: "img-1",
          normalizedText:
            "Toolless Head Adjustment\nUses (2) PAR38 Bulbs\nNon-motion Security Light",
          fullText:
            "Toolless Head Adjustment\nUses (2) PAR38 Bulbs\nNon-motion Security Light",
          provider: "google_vision",
          confidence: 0.8,
          feature: "TEXT_DETECTION",
        },
      ],
    });

    expect(fused.analysis.materials).toEqual(["Metal"]);
    expect(fused.analysis.fieldMeta.material?.needs_review).toBe(true);
    expect(fused.analysis.warnings.some((w) => w.includes("Material estimated"))).toBe(
      true,
    );
  });
});
