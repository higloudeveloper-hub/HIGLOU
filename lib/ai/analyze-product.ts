import { createOpenAIClient, getOpenAIModel, shouldEscalateToAdvanced } from "@/lib/ai/openai-client";
import { createBarcodeDecoder } from "@/lib/barcode/decoder";
import {
  extractTextFromImages,
  hashImageBuffer,
} from "@/lib/google-vision/extract-text";
import {
  isGoogleVisionConfigured,
  isGoogleVisionEnabled,
} from "@/lib/google-vision/client";
import { selectOcrImages } from "@/lib/google-vision/select-ocr-images";
import { fuseProductAnalysis } from "@/lib/ai/fusion-engine";
import type { OCRImageResult } from "@/types/vision";
import type { GoogleVisionMode } from "@/types/vision";
import type { BarcodeDetection } from "@/types/barcode";
import { AI_PROVIDER_DEFAULTS } from "@/config/ai-providers";
import { IMAGE_ANALYSIS_DEFAULTS } from "@/config/image-analysis";
import { recordAiUsageEvent } from "@/lib/ai/usage";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STORE_BRANDING_DEFAULTS } from "@/config/store-branding";
import type { AnalysisTier } from "@/config/costs";
import { calculateOpenAICost } from "@/lib/costs/calculate-openai-cost";
import { getOpenAIPricingForTier } from "@/lib/costs/pricing";
import { ensureEbayCategory } from "@/lib/ebay/ensure-category";
import { getEbayCategoryExamplesForPrompt } from "@/config/ebay-categories";
import {
  ANALYSIS_SYSTEM_PROMPT,
  parseAnalysisResult,
} from "@/types/analysis";
import { fetchProductImageBuffer } from "@/lib/images/storage";
import { sniffImageMime } from "@/config/supported-image-formats";
import {
  describeQualityBlock,
  gateImagesForAnalysis,
} from "@/lib/images/quality-engine";
import {
  ImageNormalizeError,
  normalizeImageForAnalysis,
} from "@/lib/images/normalize-image";
import {
  createProductFingerprint,
  mapTierToAnalysisMode,
  PIPELINE_VERSION,
  PROMPT_VERSION,
} from "@/lib/cache/product-fingerprint";
import {
  loadProductAnalysisCache,
  saveProductAnalysisCache,
} from "@/lib/cache/analysis-cache";
import { buildAnalysisPlan } from "@/lib/ai/cost-optimizer";
import { buildAnalysisPipelineStages } from "@/lib/ai/analysis-stages";
import {
  applyConfidencePolicyToAnalysis,
  buildNormalizedProduct,
} from "@/lib/ai/build-normalized-product";
import { analyzeCondition } from "@/lib/ai/condition-analyzer";
import { analyzePackageContents } from "@/lib/ai/package-contents";
import { buildItemSpecificsForCategory } from "@/lib/ai/item-specifics-builder";
import type { NormalizedProduct } from "@/types/normalized-product";
import type { AnalysisPipelineStages } from "@/types/analysis-stages";
import {
  messageForAnalysisFailure,
  type AnalysisFailureCode,
} from "@/types/analysis-failures";

export const HYBRID_SYSTEM_PROMPT = `${ANALYSIS_SYSTEM_PROMPT}

You are analyzing product images to create a complete eBay listing for Higlou Store.

Use the images as the primary visual evidence.
Google Vision OCR and barcode detections are supplemental evidence.
Do not assume every OCR fragment is correct.
Prefer values supported by multiple independent sources.

Never invent:
- brand, model, UPC, MPN, size, condition, functionality, warranty,
  package contents, compatibility.

Materials (special rules):
- Use printed packaging/label text when visible (highest confidence).
- When not printed, you MAY infer common materials from clear visual evidence
  (metal housing, glass lens, fabric weave, plastic shell, wood grain).
- For visual-only material inference set fieldMeta.material.needs_review=true
  and confidence between 0.55 and 0.72.
- Do NOT guess rare, composite, or premium materials without evidence.

When evidence is insufficient, return an empty string (or null for numeric fields)
and mark needs_review=true in fieldMeta.

Do not claim an item is functional unless the user explicitly confirmed it.
Do not claim an item is new when images show opened packaging, damage,
missing seals, wear, or contradictory evidence.

Seller brand/store identity is always Higlou Store in descriptions.
Never misspell Higlou as Highlou.`;

async function fetchImageBuffer(url: string): Promise<Buffer> {
  return fetchProductImageBuffer({ url });
}

function toDataUrl(buffer: Buffer, mime?: string) {
  const resolved =
    mime && mime !== "application/octet-stream"
      ? mime
      : sniffImageMime(buffer);
  const safeMime =
    resolved === "application/octet-stream" ? "image/jpeg" : resolved;
  return `data:${safeMime};base64,${buffer.toString("base64")}`;
}

export class AnalysisPipelineError extends Error {
  code: AnalysisFailureCode;
  constructor(code: AnalysisFailureCode, message?: string) {
    super(message ?? messageForAnalysisFailure(code));
    this.name = "AnalysisPipelineError";
    this.code = code;
  }
}

/** @deprecated Prefer AnalysisPipelineError with a specific AnalysisFailureCode */
export class QualityBlockedError extends AnalysisPipelineError {
  constructor(messageOrCode?: string | AnalysisFailureCode, code?: AnalysisFailureCode) {
    if (
      typeof messageOrCode === "string" &&
      (messageOrCode === "UNSUPPORTED_INPUT_FORMAT" ||
        messageOrCode === "IMAGE_DECODE_FAILED" ||
        messageOrCode === "IMAGE_TOO_SMALL" ||
        messageOrCode === "NO_PRODUCT_VISIBLE" ||
        messageOrCode === "RECOGNITION_FAILED" ||
        messageOrCode === "BARCODE_NOT_FOUND" ||
        messageOrCode === "OCR_FAILED" ||
        messageOrCode === "CATEGORY_RESOLUTION_FAILED" ||
        messageOrCode === "LISTING_BUILD_FAILED")
    ) {
      super(messageOrCode);
    } else if (typeof messageOrCode === "string" && code) {
      super(code, messageOrCode);
    } else if (typeof messageOrCode === "string") {
      super("IMAGE_TOO_SMALL", messageOrCode);
    } else {
      super("IMAGE_TOO_SMALL");
    }
    this.name = "QualityBlockedError";
  }
}

export interface AnalyzeProductInput {
  imageUrls: string[];
  imageMeta?: Array<{
    id?: string;
    url: string;
    fileName?: string;
    isPrimary?: boolean;
  }>;
  productHints?: {
    brand?: string;
    model?: string;
    upc?: string;
    size?: string;
    condition?: string;
    categoryId?: string;
    categoryName?: string;
    notes?: string;
  };
  forceImproveOcr?: boolean;
  forceDeepAnalysis?: boolean;
  forceFreshAnalysis?: boolean;
  analysisTier?: AnalysisTier;
  providers?: {
    openaiEnabled?: boolean;
    googleVisionEnabled?: boolean;
    barcodeEnabled?: boolean;
    googleVisionMode?: GoogleVisionMode;
    googleVisionMaxImages?: number;
    documentTextFallback?: boolean;
  };
  userId?: string;
  productId?: string;
  supabase?: SupabaseClient | null;
}

function parseJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return JSON.parse(fenced[1].trim()) as unknown;
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    }
    throw new Error("JSON parse failed");
  }
}

export async function analyzeProductHybrid(input: AnalyzeProductInput) {
  const providers = {
    openaiEnabled:
      input.providers?.openaiEnabled ?? AI_PROVIDER_DEFAULTS.openaiEnabled,
    googleVisionEnabled:
      input.providers?.googleVisionEnabled ?? isGoogleVisionEnabled(),
    barcodeEnabled:
      input.providers?.barcodeEnabled ?? AI_PROVIDER_DEFAULTS.barcodeEnabled,
    googleVisionMode:
      input.providers?.googleVisionMode ?? AI_PROVIDER_DEFAULTS.googleVisionMode,
    googleVisionMaxImages:
      input.providers?.googleVisionMaxImages ??
      AI_PROVIDER_DEFAULTS.googleVisionMaxImages,
    documentTextFallback:
      input.providers?.documentTextFallback ??
      AI_PROVIDER_DEFAULTS.documentTextFallback,
  };

  const maxImages = Math.min(
    input.imageUrls.length,
    AI_PROVIDER_DEFAULTS.maxAnalysisImages,
    IMAGE_ANALYSIS_DEFAULTS.maxAnalysisImages,
  );
  const urls = input.imageUrls.slice(0, maxImages);
  const metas =
    input.imageMeta?.filter((m) => urls.includes(m.url)) ??
    urls.map((url, index) => ({
      id: `img-${index}`,
      url,
      fileName: `image-${index}.jpg`,
      isPrimary: index === 0,
    }));

  // --- Load → normalize (Sharp) → quality gate (local, pre paid APIs) ---
  // Formats converge here so the rest of the pipeline only sees JPEG/PNG.
  const sourceBuffers = await Promise.all(
    urls.map(async (url) => {
      const buffer = await fetchImageBuffer(url);
      return { url, buffer };
    }),
  );

  const buffers: Array<{
    url: string;
    buffer: Buffer;
    hash: string;
    sourceHash: string;
    originalMimeType: string;
    normalizedMimeType: string;
  }> = [];

  for (const item of sourceBuffers) {
    try {
      const normalized = await normalizeImageForAnalysis(item.buffer);
      buffers.push({
        url: item.url,
        buffer: normalized.buffer,
        hash: hashImageBuffer(normalized.buffer),
        sourceHash: normalized.sourceHash,
        originalMimeType: normalized.originalMimeType,
        normalizedMimeType: normalized.normalizedMimeType,
      });
    } catch (error) {
      if (error instanceof ImageNormalizeError) {
        throw new AnalysisPipelineError(error.code, error.message);
      }
      throw new AnalysisPipelineError(
        "IMAGE_DECODE_FAILED",
        error instanceof Error ? error.message : undefined,
      );
    }
  }

  // Photo quality ≠ product recognition. Only block unreadable / unusable frames.
  const qualityGate = gateImagesForAnalysis(buffers.map((b) => b.buffer));
  if (qualityGate.blocked) {
    const block = describeQualityBlock(qualityGate);
    throw new AnalysisPipelineError(block.code, block.message);
  }

  const usableBuffers = qualityGate.usableIndexes.map((i) => buffers[i]);
  const usableUrls = usableBuffers.map((b) => b.url);
  const usableHashes = usableBuffers.map((b) => b.hash);
  const usableMetas = usableUrls.map(
    (url, index) =>
      metas.find((m) => m.url === url) ?? {
        id: `img-${index}`,
        url,
        fileName: `image-${index}.jpg`,
        isPrimary: index === 0,
      },
  );

  const analysisMode = mapTierToAnalysisMode(
    input.analysisTier,
    input.forceDeepAnalysis,
  );
  const fingerprint = createProductFingerprint({
    imageHashes: usableHashes,
    analysisMode,
    pipelineVersion: PIPELINE_VERSION,
    promptVersion: PROMPT_VERSION,
  });

  // --- A2 Product fingerprint cache ---
  if (!input.forceFreshAnalysis) {
    const cached = await loadProductAnalysisCache(
      input.supabase,
      input.userId,
      fingerprint,
    );
    if (cached?.analysisResult) {
      await recordAiUsageEvent(input.supabase ?? null, {
        userId: input.userId,
        productId: input.productId,
        provider: "cache",
        operation: "product_analysis_cache_hit",
        imageCount: usableHashes.length,
        estimatedCost: 0,
        status: "ok",
      });
      const cachedAnalysis = cached.analysisResult as ReturnType<
        typeof fuseProductAnalysis
      >["analysis"];
      const stages = buildAnalysisPipelineStages({
        analysis: cachedAnalysis,
        barcodeCount: Array.isArray(cached.barcodes)
          ? cached.barcodes.length
          : 0,
        ocrImageCount: Array.isArray(cached.ocrResults)
          ? cached.ocrResults.length
          : 0,
        ocrWeak: true,
        categorySource: (cached.pipeline as { categorySource?: string } | null)
          ?.categorySource,
      });
      return {
        analysis: cachedAnalysis,
        evidence: cached.evidence,
        conflicts: cached.conflicts,
        barcodes: cached.barcodes,
        ocrResults: cached.ocrResults,
        normalizedProduct: {
          ...cached.normalizedProduct,
          analysis: {
            ...cached.normalizedProduct.analysis,
            cacheHit: true,
          },
        } as NormalizedProduct,
        costEstimate: {
          category: "platform_operating_costs" as const,
          openai: 0,
          googleVisionUnits: 0,
          model: "cache",
          tier: analysisMode === "advanced" ? ("advanced" as const) : ("economy" as const),
          escalationReason: undefined,
          cacheHit: true,
          savingsNote: "Full product analysis loaded from cache — $0 paid APIs",
          disclaimer:
            "Estimated platform operating cost only. Not an official invoice.",
        },
        pipeline: {
          ...(cached.pipeline as object),
          cacheHit: true,
          productFingerprint: fingerprint,
          qualityWarnings: qualityGate.warnings,
          skippedPaidApis: true,
          stages,
        },
        stages,
        quality: qualityGate,
      };
    }
  }

  // --- A4 Initial plan (barcode + OCR/OpenAI limits) ---
  let plan = buildAnalysisPlan({
    usableIndexes: usableBuffers.map((_, i) => i),
    barcodeEnabled: providers.barcodeEnabled,
    visionEnabled: providers.googleVisionEnabled && isGoogleVisionConfigured(),
    openaiEnabled: providers.openaiEnabled,
    forceDeepAnalysis: input.forceDeepAnalysis,
    forceImproveOcr: input.forceImproveOcr,
    forceFreshAnalysis: input.forceFreshAnalysis,
    requestedMode: analysisMode,
  });

  const barcodes: BarcodeDetection[] = [];
  if (plan.runBarcode) {
    const decoder = createBarcodeDecoder();
    for (const idx of plan.ocrImageIndexes.length
      ? usableBuffers.map((_, i) => i)
      : usableBuffers.map((_, i) => i)) {
      const item = usableBuffers[idx];
      if (!item) continue;
      const meta = usableMetas[idx];
      try {
        const hits = await decoder.decodeFromImageBuffer(item.buffer, {
          sourceImageId: meta?.id || item.hash.slice(0, 12),
          tryContrast: true,
          tryRotation: true,
        });
        barcodes.push(...hits);
        await recordAiUsageEvent(input.supabase ?? null, {
          userId: input.userId,
          productId: input.productId,
          provider: "zxing",
          operation: "barcode_decode",
          imageCount: 1,
          status: hits.length ? "ok" : "empty",
        });
      } catch {
        await recordAiUsageEvent(input.supabase ?? null, {
          userId: input.userId,
          productId: input.productId,
          provider: "zxing",
          operation: "barcode_decode",
          imageCount: 1,
          status: "error",
        });
      }
    }
  }

  // Refine plan after barcode evidence
  plan = buildAnalysisPlan({
    usableIndexes: usableBuffers.map((_, i) => i),
    barcodes,
    barcodeEnabled: providers.barcodeEnabled,
    visionEnabled: providers.googleVisionEnabled && isGoogleVisionConfigured(),
    openaiEnabled: providers.openaiEnabled,
    forceDeepAnalysis: input.forceDeepAnalysis,
    forceImproveOcr: input.forceImproveOcr,
    requestedMode: analysisMode,
  });

  const missingCriticalFields = Boolean(
    !input.productHints?.brand ||
      !input.productHints?.upc ||
      !input.productHints?.size,
  );

  const ocrCandidates = selectOcrImages({
    images: usableMetas.map((m) => ({
      id: m.id || m.url,
      url: m.url,
      fileName: m.fileName,
      isPrimary: m.isPrimary,
    })),
    mode: providers.googleVisionMode,
    maxImages: providers.googleVisionMaxImages,
    barcodesFound: barcodes.length > 0,
    openaiLowConfidence: false,
    missingCriticalFields,
    forceImproveOcr: input.forceImproveOcr,
    visionEnabled: providers.googleVisionEnabled,
  });

  // Intersect selector with cost plan indexes
  const plannedOcrUrls = new Set(
    plan.ocrImageIndexes.map((i) => usableBuffers[i]?.url).filter(Boolean),
  );
  const filteredOcrCandidates = plan.runOcr
    ? ocrCandidates.filter((c) => plannedOcrUrls.has(c.url)).slice(
        0,
        plan.ocrImageIndexes.length || 4,
      )
    : [];

  let ocrResults: OCRImageResult[] = [];
  const visionWarnings: string[] = [...qualityGate.warnings];
  let visionUnitsThisRun = 0;
  let visionMonthUnitsBefore = 0;

  if (input.supabase && input.userId) {
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    const { data: visionRows } = await input.supabase
      .from("ai_usage_events")
      .select("ocr_unit_count")
      .eq("user_id", input.userId)
      .eq("provider", "google_vision")
      .gte("created_at", start.toISOString());
    visionMonthUnitsBefore = (visionRows ?? []).reduce(
      (sum, row) => sum + Number(row.ocr_unit_count || 0),
      0,
    );
  }

  if (
    plan.runOcr &&
    providers.googleVisionEnabled &&
    isGoogleVisionConfigured() &&
    filteredOcrCandidates.length
  ) {
    try {
      const batch = await extractTextFromImages({
        images: filteredOcrCandidates
          .map((candidate) => {
            const buf = usableBuffers.find((b) => b.url === candidate.url);
            if (!buf) return null;
            return {
              imageId: candidate.id,
              imageUrl: candidate.url,
              buffer: buf.buffer,
              imageHash: buf.hash,
            };
          })
          .filter(Boolean) as Array<{
          imageId: string;
          imageUrl: string;
          buffer: Buffer;
          imageHash: string;
        }>,
        useDocumentFallback: providers.documentTextFallback,
        userId: input.userId,
        productId: input.productId,
        supabase: input.supabase,
        unitsUsedThisMonthBefore: visionMonthUnitsBefore,
      });
      ocrResults = batch.results;
      visionUnitsThisRun = batch.unitsUsed;
      visionWarnings.push(...batch.warnings);
    } catch {
      visionWarnings.push(
        "Google Vision OCR unavailable — continued with barcode + AI.",
      );
    }
  } else if (providers.googleVisionEnabled && !isGoogleVisionConfigured()) {
    visionWarnings.push(
      "Google Vision credentials not configured — OCR skipped.",
    );
  } else if (!plan.runOcr) {
    visionWarnings.push(`OCR skipped by cost optimizer (${plan.estimatedSavingsNote}).`);
  }

  const ocrWeak =
    ocrResults.length === 0 ||
    ocrResults.every((r) => (r.normalizedText || "").trim().length < 12);
  const visionFailed = visionWarnings.some((w) =>
    /OCR unavailable|credentials not configured|OCR skipped/i.test(w),
  );

  // When OCR failed/empty, send more angles to OpenAI so it can read on-pack text itself
  if ((ocrWeak || visionFailed) && plan.openAiImageIndexes.length < usableBuffers.length) {
    plan = {
      ...plan,
      openAiImageIndexes: usableBuffers
        .map((_, i) => i)
        .slice(0, Math.min(8, usableBuffers.length)),
      reason: [
        ...plan.reason,
        "OCR weak/unavailable — expanded OpenAI images for visual text reading",
      ],
    };
  }

  if (!providers.openaiEnabled || !plan.runOpenAiVision) {
    throw new Error(
      "OpenAI is disabled in AI Providers settings. Enable it to analyze products.",
    );
  }

  const openai = createOpenAIClient();
  const openAiBuffers = plan.openAiImageIndexes
    .map((i) => usableBuffers[i])
    .filter(Boolean);
  const imageContents = openAiBuffers.map((item) => ({
    type: "image_url" as const,
    image_url: {
      url: toDataUrl(item.buffer, item.normalizedMimeType || sniffImageMime(item.buffer)),
    },
  }));

  const evidenceContext = {
    barcodes,
    ocr: ocrResults.map((r) => ({
      imageId: r.imageId,
      text: r.normalizedText.slice(0, 4000),
      confidence: r.confidence,
    })),
    ocrStatus: {
      available: ocrResults.length > 0,
      weak: ocrWeak,
      visionFailed,
      note: visionFailed
        ? "Google Vision OCR did not run successfully. YOU must carefully read ALL visible text in the product images yourself."
        : ocrWeak
          ? "OCR text is thin. Double-check every photo for printed specs, model, wattage, lumens, voltage, MPN."
          : "OCR evidence available below — cross-check against images.",
    },
    userHints: input.productHints ?? {},
    storeBranding: {
      storeName: STORE_BRANDING_DEFAULTS.storeName,
    },
    analysisPlan: plan.reason,
  };

  let tier: AnalysisTier =
    plan.analysisMode === "advanced"
      ? "advanced"
      : shouldEscalateToAdvanced({
          requestedTier: input.analysisTier,
          forceDeepAnalysis: input.forceDeepAnalysis,
          conflictingEvidence: false,
        });
  let model = getOpenAIModel(tier);
  let escalationReason: string | undefined;

  const runCompletion = async (selectedModel: string) =>
    openai.chat.completions.create({
      model: selectedModel,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: HYBRID_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Create a complete eBay draft listing analysis for Higlou Store.

Supplemental evidence (may be incomplete or noisy):
${JSON.stringify(evidenceContext)}

CRITICAL — Identify AND fully describe ANY product (not limited to tip examples):
1) Look at the images and name what the product actually is from VISUAL appearance even if there is no label, barcode, or packaging (e.g. dual-head black spotlight track light).
2) READ EVERY readable printed line on the product/packaging in the photos (brand, model, MPN, watts, volts, lumens, color temp, SKU). Put transcribed lines into detectedText[]. Use those values to fill brand/model/mpn/features/itemSpecifics when clearly printed — do not invent unseen codes.
3) If brand/UPC/MPN/model text is NOT visible anywhere, leave those fields as empty strings — still return a solid title, type, colors, materials, features, categoryId, and descriptionSummary.
4) categoryId MUST be numeric digits only (3–8). Never words like "sneakers" or "jeans".
5) Return the most specific real US eBay LEAF categoryId + categoryName for that product.
   You may use ANY valid US leaf ID — tipExamples below are optional hints only, not a closed list.
6) Fill itemSpecifics for THAT category (C:Brand only when visible; Type/Color/Material and printed electrical specs from photos).
7) colors/materials/features/setIncludes/missingItems/defects MUST be JSON arrays of strings, e.g. ["Black","Metal"] — never a single string.
   For materials: use printed text when available; otherwise infer from appearance (metal/plastic/glass/fabric) with fieldMeta.material.needs_review=true.
8) descriptionSummary: 2–4 factual sentences for the listing intro — no return-policy language.
9) Prefer empty string over guessing identity fields. Never invent UPC/MPN/serial.
10) Condition: report honest condition from photos. Also return defects[] and conditionNotes.
11) Package: setIncludes[] / missingItems[] only when clearly evidenced; otherwise empty arrays.
12) When ocrStatus.visionFailed or ocrStatus.weak is true, prioritize careful visual reading of text in images before leaving model/mpn/features empty.
13) Shipping box for eBay Calculated (always fill): packageWeightLbs (int), packageWeightOz (0–15), packageLengthIn, packageWidthIn, packageDepthIn (inches). Prefer printed shipping/net weight and carton size on packaging. If not printed, estimate the retail box you see (ready to ship). Never use 3 oz / envelope sizes for heavy goods (pumps, appliances, vacuums, cookware).

tipExamples (optional hints only):
${JSON.stringify(getEbayCategoryExamplesForPrompt())}

Also return JSON keys:
title, brand, collection, model, mpn, upc, categoryId, categoryName, condition, conditionId,
price (number|null), quantity, size, type, colors[], materials[], pattern, style, department, room,
features[], setIncludes[], missingItems[], defects[], conditionNotes,
numberOfItems (number|null), careInstructions[], countryOfManufacture,
descriptionSummary, detectedText[], warnings[],
packageWeightLbs (number|null), packageWeightOz (number|null),
packageLengthIn (number|null), packageWidthIn (number|null), packageDepthIn (number|null),
confidence:{brand,model,upc,category,size,condition},
fieldMeta:{ [field]: { confidence, source: image|user|inferred, needs_review } },
itemSpecifics:[{key,label,value,confidence?}].`,
            },
            ...imageContents,
          ],
        },
      ],
    });

  let completion = await runCompletion(model);
  let content = completion.choices[0]?.message?.content;
  let parsedOk = false;
  let openaiResult;
  let parseErrors: string[] = [];

  const tryParse = (rawContent: string | null | undefined) => {
    if (!rawContent) return { ok: false as const, error: "empty response" };
    try {
      return parseAnalysisResult(parseJsonObject(rawContent));
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof Error ? error.message : "JSON parse failed",
      };
    }
  };

  {
    const first = tryParse(content);
    if (first.ok) {
      openaiResult = first.data;
      parsedOk = true;
    } else {
      parseErrors.push(first.error);
      parsedOk = false;
    }
  }

  const lowConfidence =
    parsedOk &&
    openaiResult &&
    Object.values(openaiResult.confidence).some((v) => v < 0.45);

  if ((!parsedOk || lowConfidence) && tier === "economy") {
    tier = "advanced";
    model = getOpenAIModel("advanced");
    escalationReason = !parsedOk
      ? "Structured validation failed on economy model"
      : "Low confidence on economy model";
    completion = await runCompletion(model);
    content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned an empty analysis response");
    }
    const advanced = tryParse(content);
    if (!advanced.ok) {
      parseErrors.push(advanced.error);
      throw new Error(
        "We identified the photos but couldn't parse the AI response into a listing. Try Generate again — unlabeled products are supported; brand/UPC can stay empty.",
      );
    }
    openaiResult = advanced.data;
    parsedOk = true;
  }

  if (!content || !openaiResult) {
    throw new Error(
      parseErrors[0]
        ? `Analysis failed while reading AI output (${parseErrors[0]}). Try Generate again.`
        : "We couldn't finish analyzing this product. Try Generate again.",
    );
  }

  const usageCost = calculateOpenAICost(
    completion.usage,
    getOpenAIPricingForTier(tier),
  );

  await recordAiUsageEvent(input.supabase ?? null, {
    userId: input.userId,
    productId: input.productId,
    provider: "openai",
    model,
    operation: "analyze_product",
    requestId: completion.id,
    inputTokens: usageCost.inputTokens,
    cachedInputTokens: usageCost.cachedInputTokens,
    outputTokens: usageCost.outputTokens,
    imageCount: imageContents.length,
    estimatedCost: usageCost.estimatedCost,
    status: "ok",
  });

  const fused = fuseProductAnalysis({
    openai: openaiResult,
    barcodes,
    ocrResults,
    userHints: input.productHints,
  });

  // Category resolution is independent of recognition — never abort identity on timeout.
  let categoryFailed = false;
  let ensuredCategory: Awaited<ReturnType<typeof ensureEbayCategory>>;
  try {
    ensuredCategory = await ensureEbayCategory({
      categoryId: fused.analysis.categoryId,
      categoryName: fused.analysis.categoryName,
      productType: fused.analysis.type,
      title: fused.analysis.title,
      brand: fused.analysis.brand,
      model: fused.analysis.model,
      materials: fused.analysis.materials,
      features: fused.analysis.features,
      userId: input.userId,
      productId: input.productId,
      supabase: input.supabase,
    });
  } catch {
    categoryFailed = true;
    ensuredCategory = {
      categoryId: fused.analysis.categoryId || "",
      categoryName: fused.analysis.categoryName || "",
      source: "model",
      confidence: fused.analysis.confidence?.category || 0,
      inferred: true,
    };
    fused.analysis.warnings.push(
      messageForAnalysisFailure("CATEGORY_RESOLUTION_FAILED"),
    );
  }

  fused.analysis.categoryId = ensuredCategory.categoryId;
  fused.analysis.categoryName = ensuredCategory.categoryName;
  if (ensuredCategory.inferred && !ensuredCategory.categoryId) {
    categoryFailed = true;
    fused.analysis.warnings.push(
      "Category could not be determined confidently — choose one before generating CSV.",
    );
  } else if (ensuredCategory.source !== "model" && ensuredCategory.categoryId) {
    fused.analysis.warnings.push(
      `Category auto-assigned (${ensuredCategory.source}): ${ensuredCategory.categoryName} [${ensuredCategory.categoryId}].`,
    );
  }
  if (ensuredCategory.categoryId) {
    fused.analysis.confidence = {
      ...fused.analysis.confidence,
      category: Math.max(
        fused.analysis.confidence.category || 0,
        ensuredCategory.confidence,
      ),
    };
  }

  fused.analysis.warnings = Array.from(
    new Set([...fused.analysis.warnings, ...visionWarnings]),
  );

  // --- Phase B: Condition Analyzer ---
  const ocrBlob = ocrResults.map((r) => r.normalizedText).join("\n");
  const conditionResult = analyzeCondition({
    condition: fused.analysis.condition,
    conditionId: fused.analysis.conditionId,
    conditionNotes:
      (fused.analysis as { conditionNotes?: string }).conditionNotes || "",
    defects: (fused.analysis as { defects?: string[] }).defects || [],
    detectedText: fused.analysis.detectedText,
    features: fused.analysis.features,
    ocrText: ocrBlob,
    userCondition: input.productHints?.condition,
  });
  fused.analysis.condition = conditionResult.conditionLabel;
  fused.analysis.conditionId = conditionResult.conditionId;
  (fused.analysis as { conditionNotes?: string }).conditionNotes =
    conditionResult.notes;
  (fused.analysis as { defects?: string[] }).defects = conditionResult.defects;
  fused.analysis.confidence = {
    ...fused.analysis.confidence,
    condition: Math.max(
      fused.analysis.confidence.condition || 0,
      conditionResult.confidence,
    ),
  };
  fused.analysis.warnings.push(...conditionResult.warnings);

  // --- Phase B: Package contents / missing parts ---
  const packageResult = analyzePackageContents({
    setIncludes: fused.analysis.setIncludes,
    missingItems: (fused.analysis as { missingItems?: string[] }).missingItems,
    features: fused.analysis.features,
    detectedText: fused.analysis.detectedText,
    ocrText: ocrBlob,
    descriptionSummary: fused.analysis.descriptionSummary,
  });
  fused.analysis.setIncludes = packageResult.included;
  (fused.analysis as { missingItems?: string[] }).missingItems =
    packageResult.missing;
  fused.analysis.warnings.push(...packageResult.warnings);
  if (packageResult.missing.length) {
    fused.analysis.warnings.push(
      `Possibly missing: ${packageResult.missing.join(", ")}`,
    );
  }

  // --- Phase B: Item specifics for resolved category ---
  const specificsBuilt = buildItemSpecificsForCategory({
    categoryId: fused.analysis.categoryId,
    analysis: fused.analysis,
  });
  fused.analysis.itemSpecifics = specificsBuilt.itemSpecifics
    .filter((row) => row.value)
    .map((row) => ({
      key: row.key,
      label: row.label,
      value: row.value,
      confidence: row.confidence,
    }));
  if (specificsBuilt.missingRequired.length) {
    fused.analysis.warnings.push(
      `Item specifics still needed for ${specificsBuilt.family.name}: ${specificsBuilt.missingRequired.join(", ")}`,
    );
  }

  let normalized = buildNormalizedProduct({
    analysis: fused.analysis,
    fingerprint,
    imageUrls: usableUrls,
    imageHashes: usableHashes,
    conflicts: fused.conflicts,
    warnings: fused.analysis.warnings,
    cacheHit: false,
    planReasons: plan.reason,
    savingsNote: plan.estimatedSavingsNote,
    conditionAnalysis: conditionResult,
    packageAnalysis: packageResult,
    ebayItemSpecifics: specificsBuilt.asConfidentRecord,
  });

  fused.analysis = applyConfidencePolicyToAnalysis(
    fused.analysis,
    normalized,
  );

  // rebuild after policy emptyings
  normalized = buildNormalizedProduct({
    analysis: fused.analysis,
    fingerprint,
    imageUrls: usableUrls,
    imageHashes: usableHashes,
    conflicts: fused.conflicts,
    warnings: fused.analysis.warnings,
    cacheHit: false,
    planReasons: plan.reason,
    savingsNote: plan.estimatedSavingsNote,
    conditionAnalysis: conditionResult,
    packageAnalysis: packageResult,
    ebayItemSpecifics: specificsBuilt.asConfidentRecord,
  });

  const stages = buildAnalysisPipelineStages({
    analysis: fused.analysis,
    barcodeCount: barcodes.length,
    ocrImageCount: ocrResults.length,
    ocrWeak,
    categorySource: ensuredCategory.source,
    categoryMissing: Boolean(
      ensuredCategory.inferred && !ensuredCategory.categoryId,
    ),
    categoryFailed,
  });

  await saveProductAnalysisCache(input.supabase, input.userId, fingerprint, {
    normalizedProduct: normalized,
    confidenceJson: {
      overall: normalized.analysis.overallConfidence,
      identity: normalized.identity,
    },
    costJson: {
      openai: usageCost.estimatedCost,
      googleVisionUnits: visionUnitsThisRun,
      savingsNote: plan.estimatedSavingsNote,
    },
    analysisResult: fused.analysis,
    evidence: fused.evidence,
    conflicts: fused.conflicts,
    pipeline: {
      barcodeCount: barcodes.length,
      ocrImageCount: ocrResults.length,
      openaiImages: imageContents.length,
      visionConfigured: isGoogleVisionConfigured(),
      analysisTier: tier,
      model,
      categorySource: ensuredCategory.source,
      productFingerprint: fingerprint,
      plan: plan.reason,
      savingsNote: plan.estimatedSavingsNote,
      cacheHit: false,
      stages,
    },
    barcodes,
    ocrResults,
  });

  return {
    analysis: fused.analysis,
    evidence: fused.evidence,
    conflicts: fused.conflicts,
    barcodes,
    ocrResults,
    normalizedProduct: normalized,
    costEstimate: {
      category: "platform_operating_costs" as const,
      openai: usageCost.estimatedCost,
      googleVisionUnits: visionUnitsThisRun,
      model,
      tier,
      escalationReason,
      cacheHit: false,
      savingsNote: plan.estimatedSavingsNote,
      disclaimer:
        "Estimated platform operating cost only. Not an official invoice.",
    },
    pipeline: {
      barcodeCount: barcodes.length,
      ocrImageCount: ocrResults.length,
      openaiImages: imageContents.length,
      visionConfigured: isGoogleVisionConfigured(),
      analysisTier: tier,
      model,
      categorySource: ensuredCategory.source,
      productFingerprint: fingerprint,
      plan: plan.reason,
      savingsNote: plan.estimatedSavingsNote,
      cacheHit: false,
      qualityWarnings: qualityGate.warnings,
      skippedPaidApis: false,
      stages,
    },
    stages,
    quality: qualityGate,
  };
}
