import { describe, expect, it } from "vitest";
import { analyzeCondition } from "@/lib/ai/condition-analyzer";
import { analyzePackageContents } from "@/lib/ai/package-contents";
import { buildItemSpecificsForCategory } from "@/lib/ai/item-specifics-builder";
import type { AnalysisResult } from "@/types/analysis";

function baseAnalysis(partial: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    title: "Test",
    brand: "Nike",
    collection: "",
    model: "Air Force 1",
    mpn: "",
    upc: "",
    categoryId: "15709",
    categoryName: "Men's Athletic Shoes",
    condition: "New",
    conditionId: "NEW",
    price: 35,
    quantity: 1,
    size: "9",
    type: "Sneakers",
    colors: ["White"],
    materials: ["Leather"],
    pattern: "",
    style: "",
    department: "Men",
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
      brand: 0.9,
      model: 0.8,
      upc: 0,
      category: 0.9,
      size: 0.85,
      condition: 0.7,
    },
    fieldMeta: {},
    itemSpecifics: [],
    ...partial,
  };
}

describe("Condition Analyzer", () => {
  it("overrides New when scratches are evidenced", () => {
    const result = analyzeCondition({
      condition: "New",
      features: ["minor scratches on toe box"],
    });
    expect(result.conditionLabel).not.toMatch(/^New$/i);
    expect(result.defects.some((d) => /scratch/i.test(d))).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("detects for parts", () => {
    const result = analyzeCondition({
      condition: "Used",
      detectedText: ["does not work", "for parts"],
    });
    expect(result.type).toBe("for_parts");
    expect(result.conditionId).toBe("7000");
  });

  it("respects user condition", () => {
    const result = analyzeCondition({
      condition: "Used",
      userCondition: "Open box",
    });
    expect(result.conditionLabel).toBe("Open box");
    expect(result.confidence).toBe(1);
  });
});

describe("Package contents", () => {
  it("parses includes and missing from text", () => {
    const result = analyzePackageContents({
      setIncludes: ["Shoes"],
      ocrText: "Includes: box, manual. Missing: charger",
    });
    expect(result.included.join(" ")).toMatch(/Shoes|Box|Manual/i);
    expect(result.missing.join(" ").toLowerCase()).toContain("charger");
  });

  it("flags no package evidence", () => {
    const result = analyzePackageContents({});
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("Item specifics builder", () => {
  it("fills apparel required fields from analysis", () => {
    const built = buildItemSpecificsForCategory({
      categoryId: "15709",
      analysis: baseAnalysis(),
    });
    expect(built.family.id).toBe("apparel");
    const brand = built.itemSpecifics.find((s) => s.key === "C:Brand");
    expect(brand?.value).toBe("Nike");
    expect(built.missingRequired).not.toContain("Brand");
  });

  it("does not invent required size when empty", () => {
    const built = buildItemSpecificsForCategory({
      categoryId: "15709",
      analysis: baseAnalysis({ size: "" }),
    });
    expect(built.missingRequired).toContain("Size");
  });

  it("uses generic family for unknown category instead of bedding", () => {
    const built = buildItemSpecificsForCategory({
      categoryId: "999999",
      analysis: baseAnalysis({ categoryId: "999999" }),
    });
    expect(built.family.id).toBe("generic");
  });
});
