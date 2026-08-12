import { z } from "zod";

/** Models often return null for unknown strings — coerce to "". */
const softString = z
  .union([z.string(), z.number(), z.boolean(), z.null(), z.undefined()])
  .transform((value) => {
    if (typeof value === "string") return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "boolean") return value ? "true" : "false";
    return "";
  });

const softNumber = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  });

const softConfidence = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.min(1, Math.max(0, value));
    }
    if (typeof value === "string" && value.trim() !== "") {
      const n = Number(value);
      if (Number.isFinite(n)) return Math.min(1, Math.max(0, n));
    }
    return 0;
  });

/** Accept arrays, single strings ("Black"), or null — never fail the whole analysis. */
const softStringArray = z
  .union([
    z.array(z.union([z.string(), z.number(), z.null(), z.undefined()])),
    z.string(),
    z.null(),
    z.undefined(),
  ])
  .transform((value) => {
    if (typeof value === "string") {
      return value
        .split(/[,|/]/)
        .map((part) => part.trim())
        .filter(Boolean);
    }
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (typeof item === "number" && Number.isFinite(item)) return String(item);
        return null;
      })
      .filter((item): item is string => typeof item === "string" && item.length > 0);
  });

export const fieldMetaSchema = z.object({
  confidence: softConfidence,
  source: z
    .union([z.enum(["image", "user", "inferred"]), z.string(), z.null()])
    .transform((value) =>
      value === "image" || value === "user" || value === "inferred"
        ? value
        : "inferred",
    ),
  needs_review: z
    .union([z.boolean(), z.string(), z.null(), z.undefined()])
    .transform((value) => {
      if (typeof value === "boolean") return value;
      if (typeof value === "string") return value.toLowerCase() === "true";
      return false;
    }),
});

const itemSpecificSchema = z
  .object({
    key: softString,
    label: softString,
    value: softString,
    confidence: softConfidence.optional(),
  })
  .passthrough();

export const analysisResultSchema = z
  .object({
    title: softString,
    brand: softString,
    collection: softString,
    model: softString,
    mpn: softString,
    upc: softString,
    categoryId: softString,
    categoryName: softString,
    condition: softString,
    conditionId: softString,
    price: softNumber,
    quantity: z
      .union([z.number(), z.string(), z.null(), z.undefined()])
      .transform((value) => {
        const n =
          typeof value === "number"
            ? value
            : typeof value === "string"
              ? Number(value)
              : 1;
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
      }),
    size: softString,
    type: softString,
    colors: softStringArray,
    materials: softStringArray,
    pattern: softString,
    style: softString,
    department: softString,
    room: softString,
    features: softStringArray,
    setIncludes: softStringArray.default([]),
    missingItems: softStringArray.default([]),
    defects: softStringArray.default([]),
    conditionNotes: softString.default(""),
    numberOfItems: softNumber,
    careInstructions: softStringArray,
    countryOfManufacture: softString,
    descriptionSummary: softString,
    detectedText: softStringArray,
    warnings: softStringArray,
    confidence: z
      .union([
        z.object({
          brand: softConfidence,
          model: softConfidence,
          upc: softConfidence,
          category: softConfidence,
          size: softConfidence,
          condition: softConfidence,
        }),
        z.null(),
        z.undefined(),
      ])
      .transform(
        (value) =>
          value ?? {
            brand: 0,
            model: 0,
            upc: 0,
            category: 0,
            size: 0,
            condition: 0,
          },
      ),
    fieldMeta: z
      .record(z.string(), fieldMetaSchema.passthrough())
      .optional()
      .catch({})
      .default({}),
    itemSpecifics: z
      .array(itemSpecificSchema)
      .optional()
      .catch([])
      .default([]),
    /** Ready-to-ship package for eBay Calculated shipping (from label or visual estimate). */
    packageWeightLbs: softNumber,
    packageWeightOz: softNumber,
    packageLengthIn: softNumber,
    packageWidthIn: softNumber,
    packageDepthIn: softNumber,
  })
  .passthrough()
  .transform((data) => {
    const condition = data.condition || "New";
    let conditionId = data.conditionId;
    if (!conditionId) {
      const normalized = condition.toLowerCase();
      if (normalized.includes("new")) conditionId = "NEW";
      else if (normalized.includes("used")) conditionId = "USED";
      else conditionId = "NEW";
    }
    // Strip non-digit categoryId pollution (e.g. "spotlights")
    const digits = String(data.categoryId || "").replace(/\D/g, "");
    const categoryId =
      digits.length >= 3 && digits.length <= 8 ? digits : data.categoryId || "";

    return {
      ...data,
      condition,
      conditionId,
      categoryId,
    };
  });

export type AnalysisResult = z.infer<typeof analysisResultSchema>;
export type FieldMeta = z.infer<typeof fieldMetaSchema>;

/**
 * Coerce messy OpenAI JSON into AnalysisResult.
 * Prefer partial success + warnings over hard failure for unlabeled products.
 */
export function parseAnalysisResult(
  raw: unknown,
): { ok: true; data: AnalysisResult } | { ok: false; error: string } {
  const normalized = coerceAnalysisShape(raw);
  const parsed = analysisResultSchema.safeParse(normalized);
  if (parsed.success) return { ok: true, data: parsed.data };

  // Last-chance minimal scaffold if title/type somehow present
  const loose = coerceAnalysisShape({
    ...(typeof normalized === "object" && normalized ? normalized : {}),
    colors: [],
    materials: [],
    features: [],
    setIncludes: [],
    missingItems: [],
    defects: [],
    itemSpecifics: [],
    fieldMeta: {},
    confidence: {
      brand: 0,
      model: 0,
      upc: 0,
      category: 0.4,
      size: 0,
      condition: 0.5,
    },
  });
  const retry = analysisResultSchema.safeParse(loose);
  if (retry.success) {
    const withWarning = {
      ...retry.data,
      warnings: Array.from(
        new Set([
          ...retry.data.warnings,
          "AI returned partially malformed fields — listing built with visual evidence only. Review carefully.",
        ]),
      ),
    };
    return { ok: true, data: withWarning };
  }

  return {
    ok: false,
    error: parsed.error.issues
      .slice(0, 4)
      .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
      .join("; "),
  };
}

function coerceAnalysisShape(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const obj = { ...(raw as Record<string, unknown>) };

  // Some models nest under { analysis: {...} } or { product: {...} }
  for (const nestKey of ["analysis", "product", "result", "data"]) {
    const nested = obj[nestKey];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      Object.assign(obj, nested as object);
    }
  }

  // itemSpecifics sometimes arrives as Record
  if (obj.itemSpecifics && !Array.isArray(obj.itemSpecifics) && typeof obj.itemSpecifics === "object") {
    obj.itemSpecifics = Object.entries(
      obj.itemSpecifics as Record<string, unknown>,
    ).map(([key, value]) => ({
      key: key.startsWith("C:") ? key : `C:${key}`,
      label: key.replace(/^C:/, ""),
      value:
        typeof value === "string"
          ? value
          : value && typeof value === "object" && "value" in (value as object)
            ? String((value as { value: unknown }).value ?? "")
            : String(value ?? ""),
    }));
  }

  return obj;
}

export const ANALYSIS_PROGRESS_STEPS = [
  "Checking image quality",
  "Checking product cache",
  "Scanning barcodes",
  "Reading labels selectively",
  "Identifying the product",
  "Applying confidence policy",
  "Resolving eBay category",
  "Building Higlou description",
  "Validating listing",
  "Your listing is ready",
] as const;

export const ANALYSIS_SYSTEM_PROMPT = `You are the product vision analyst for Higlou Store / Higlou eBay Listing Generator.
Analyze the provided product images and return ONLY valid JSON matching the requested schema.

Hard rules:
- NEVER invent UPC, MPN, brand, or model. If not clearly visible or provided by the user, use an empty string.
- Prefer empty string / null over guessing identity fields.
- Products WITHOUT labels/packaging are still valid: identify by visual appearance (type, color, material, style, use) and leave brand/UPC/MPN empty.
- Materials: use printed packaging when visible; otherwise infer common materials from clear visual evidence (metal, plastic, glass, fabric, wood) and set fieldMeta.material.needs_review=true with moderate confidence (0.55–0.72). Do not guess exotic composites.
- For conditionId use short codes like NEW, USED, or empty string — never null.
- Flag low-confidence fields with needs_review=true in fieldMeta.
- confidence values must be 0..1.
- source must be "image", "user", or "inferred".
- Brand for the store is Higlou Store (seller). Product brand is the manufacturer on the packaging, only when visible.
- Never misspell Higlou as Highlou.
- itemSpecifics keys should use eBay C: prefix when known (e.g. C:Brand, C:Size).
- Always fill categoryId and categoryName for identifiable products with a real US eBay leaf ID (digits only). Tip examples are optional — you must generalize to ANY product.
- categoryId MUST be digits only (e.g. 15709). NEVER put product type words like "sneakers", "hoodie", "ATV", or "jeans" in categoryId.
- Identify the most specific leaf that matches the ACTUAL product (ATV → Motors/ATV leaf, never clothing; athletic shoe ≠ jean).
- Populate itemSpecifics appropriate to that category so the draft is as complete as possible.
- colors, materials, features, setIncludes, missingItems, defects MUST be JSON arrays of strings (e.g. ["Black"]), never a bare string.
- Include warnings for uncertain or missing identity data.
- Shipping package (REQUIRED for eBay Calculated): fill packageWeightLbs, packageWeightOz (0–15), packageLengthIn, packageWidthIn, packageDepthIn in inches for the READY-TO-SHIP retail box (product + typical light packing). Prefer printed shipping/net weight and box size on the packaging/label. If not printed, estimate from the boxed product visible in photos (do not use tiny envelope sizes for pumps, appliances, cookware, etc.).`;
