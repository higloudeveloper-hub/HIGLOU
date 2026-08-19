import { describe, expect, it } from "vitest";
import { analysisResultSchema, parseAnalysisResult } from "@/types/analysis";

describe("analysisResultSchema soft coercion", () => {
  it("accepts null conditionId and fills NEW from condition", () => {
    const parsed = analysisResultSchema.parse({
      title: "Mainstays Queen Set",
      brand: "Mainstays",
      collection: null,
      model: null,
      mpn: null,
      upc: null,
      categoryId: null,
      categoryName: "Comforter Sets",
      condition: "New",
      conditionId: null,
      price: 49.99,
      quantity: 1,
      size: "Queen",
      type: "Comforter Set",
      colors: ["Yellow", null, "Gray"],
      materials: null,
      pattern: null,
      style: null,
      department: null,
      room: null,
      features: ["Soft"],
      setIncludes: null,
      numberOfItems: 10,
      careInstructions: null,
      countryOfManufacture: null,
      descriptionSummary: "A queen comforter set",
      detectedText: null,
      warnings: null,
      confidence: {
        brand: 0.9,
        model: 0.2,
        upc: null,
        category: 0.8,
        size: 0.9,
        condition: 0.85,
      },
    });

    expect(parsed.conditionId).toBe("NEW");
    expect(parsed.collection).toBe("");
    expect(parsed.colors).toEqual(["Yellow", "Gray"]);
    expect(parsed.confidence.upc).toBe(0);
    expect(parsed.packageWeightLbs).toBeNull();
    expect(parsed.packageLengthIn).toBeNull();
  });

  it("builds a listing when OpenAI omits package and some confidence keys", () => {
    const result = parseAnalysisResult({
      title: "Bamboo Kitchen Drawer Organizer",
      type: "Drawer Organizer",
      colors: "Bamboo",
      features: ["Expandable"],
      descriptionSummary: "Expandable bamboo organizer for kitchen drawers.",
      confidence: { brand: 0.4, category: 0.7 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.title).toMatch(/Bamboo/i);
    expect(result.data.colors).toEqual(["Bamboo"]);
    expect(result.data.packageWeightLbs).toBeNull();
    expect(result.data.confidence.upc).toBe(0);
    expect(result.data.confidence.category).toBe(0.7);
  });
});
