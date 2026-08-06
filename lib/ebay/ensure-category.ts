import { z } from "zod";
import {
  resolveEbayCategory,
  findEbayCategoryById,
  scoreEbayCategories,
  isValidEbayCategoryId,
  getEbayCategoryExamplesForPrompt,
} from "@/config/ebay-categories";
import { isCategoryProductMismatch } from "@/lib/ebay/category-guard";
import { createOpenAIClient, getOpenAIModel } from "@/lib/ai/openai-client";
import { calculateOpenAICost } from "@/lib/costs/calculate-openai-cost";
import { getOpenAIPricingForTier } from "@/lib/costs/pricing";
import { recordAiUsageEvent } from "@/lib/ai/usage";
import type { SupabaseClient } from "@supabase/supabase-js";

const categoryPickSchema = z.object({
  categoryId: z.string(),
  categoryName: z.string().optional().default(""),
  confidence: z.number().min(0).max(1).optional().default(0.75),
});

export type CategoryResolution = {
  categoryId: string;
  categoryName: string;
  inferred: boolean;
  confidence: number;
  source: "model" | "catalog" | "ai_fallback";
};

/**
 * Ensure a numeric US eBay leaf category for any product.
 *
 * Priority:
 * 1) Keep model numeric categoryId when it matches the product (not fishing-for-water)
 * 2) Strong curated keyword match when available
 * 3) Free-form AI lookup of the correct US leaf
 * 4) Weak curated keyword match as last resort
 */
export async function ensureEbayCategory(options: {
  categoryId?: string | null;
  categoryName?: string | null;
  productType?: string | null;
  title?: string | null;
  brand?: string | null;
  model?: string | null;
  materials?: string[] | null;
  features?: string[] | null;
  userId?: string;
  productId?: string;
  supabase?: SupabaseClient | null;
  /** When false, never call OpenAI (use for CSV export to avoid spend). Default true. */
  allowAi?: boolean;
}): Promise<CategoryResolution> {
  const rawId = (options.categoryId || "").trim();
  const allowAi = options.allowAi !== false;
  const productType =
    options.productType ||
    (rawId && !isValidEbayCategoryId(rawId) ? rawId : null);

  const normalized = {
    ...options,
    categoryId: isValidEbayCategoryId(rawId) ? rawId : "",
    productType,
  };

  const mismatch = isCategoryProductMismatch({
    categoryId: rawId,
    categoryName: options.categoryName,
    productType,
    title: options.title,
    brand: options.brand,
    materials: options.materials,
    features: options.features,
  });

  // 1) Trust plausible numeric IDs only when they agree with the product.
  // Keep ANY valid leaf (even outside curated tips) so Don Baratón can create it.
  if (isValidEbayCategoryId(rawId) && !mismatch) {
    const known = findEbayCategoryById(rawId);
    return {
      categoryId: rawId,
      categoryName:
        options.categoryName?.trim() || known?.name || options.categoryName || "",
      inferred: false,
      confidence: known ? 0.95 : 0.9,
      source: "model",
    };
  }

  // 2) Catalog keyword match before AI when we already know the product family.
  const catalogHit = resolveEbayCategory({
    ...normalized,
    categoryId: "", // force scoring path
  });
  if (catalogHit.categoryId && catalogHit.confidence >= 0.72) {
    return { ...catalogHit, source: "catalog" };
  }

  // 3) Free-form AI: resolve ANY product to a real US leaf ID.
  if (allowAi) {
    const aiResolved = await resolveCategoryWithAi({
      ...options,
      productType,
      rejectCategoryId: mismatch ? rawId : undefined,
    });
    if (aiResolved) return aiResolved;
  }

  // 4) Weak catalog keyword fallback only when AI unavailable / failed / disabled.
  const initial = resolveEbayCategory(normalized);
  if (initial.categoryId && initial.confidence >= 0.72) {
    return { ...initial, source: "catalog" };
  }

  return {
    categoryId: "",
    categoryName: options.categoryName || "",
    inferred: false,
    confidence: 0,
    source: "catalog",
  };
}

async function resolveCategoryWithAi(options: {
  categoryId?: string | null;
  categoryName?: string | null;
  productType?: string | null;
  title?: string | null;
  brand?: string | null;
  model?: string | null;
  materials?: string[] | null;
  features?: string[] | null;
  userId?: string;
  productId?: string;
  supabase?: SupabaseClient | null;
  rejectCategoryId?: string;
}): Promise<CategoryResolution | null> {
  try {
    const openai = createOpenAIModelSafe();
    if (!openai) return null;

    const completion = await openai.chat.completions.create({
      model: getOpenAIModel("economy"),
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are an eBay US category expert for Higlou Store.
Return the most specific real US eBay LEAF Category ID for the product described.
Rules:
- categoryId must be digits only (3–8 digits). Never words like sneakers or jeans.
- You may use ANY valid US eBay leaf ID — you are NOT limited to the tip examples.
- Match the actual product (ATVs are Motors / Off-Road; never clothing because of a color word).
- Bottled water / soda / juice → Food & Beverages soft-drinks leaf (e.g. 185035). NEVER Fishing Equipment (179985) or camping tackle.
- Empty reusable water bottles / tumblers / flasks → drinkware / hydration leaf (e.g. 181408), not fishing.
- If unsure between two leaves, prefer the more specific leaf that a seller would list this item under.
Return JSON: {"categoryId":"12345","categoryName":"...","confidence":0.0-1.0}`,
        },
        {
          role: "user",
          content: JSON.stringify({
            product: {
              title: options.title,
              brand: options.brand,
              model: options.model,
              productType: options.productType,
              categoryNameHint: options.categoryName,
              materials: options.materials,
              features: options.features,
            },
            doNotUseCategoryId: options.rejectCategoryId || null,
            tipExamplesOnly: getEbayCategoryExamplesForPrompt(),
            note: "tipExamplesOnly are optional hints — use the correct real leaf even if not listed. Never invent fishing for beverages.",
          }),
        },
      ],
    });

    const usageCost = calculateOpenAICost(
      completion.usage,
      getOpenAIPricingForTier("economy"),
    );
    await recordAiUsageEvent(options.supabase ?? null, {
      userId: options.userId,
      productId: options.productId,
      provider: "openai",
      model: getOpenAIModel("economy"),
      operation: "resolve_category",
      requestId: completion.id,
      inputTokens: usageCost.inputTokens,
      cachedInputTokens: usageCost.cachedInputTokens,
      outputTokens: usageCost.outputTokens,
      imageCount: 0,
      estimatedCost: usageCost.estimatedCost,
      status: "ok",
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = categoryPickSchema.parse(JSON.parse(raw));
    if (!isValidEbayCategoryId(parsed.categoryId)) return null;
    if (
      options.rejectCategoryId &&
      parsed.categoryId.trim() === options.rejectCategoryId
    ) {
      return null;
    }
    if (
      isCategoryProductMismatch({
        categoryId: parsed.categoryId,
        categoryName: parsed.categoryName,
        productType: options.productType,
        title: options.title,
        brand: options.brand,
        materials: options.materials,
        features: options.features,
      })
    ) {
      return null;
    }

    const known = findEbayCategoryById(parsed.categoryId);
    return {
      categoryId: parsed.categoryId.trim(),
      categoryName: parsed.categoryName?.trim() || known?.name || "",
      inferred: true,
      confidence: Math.max(0.7, parsed.confidence || 0.8),
      source: "ai_fallback",
    };
  } catch {
    return null;
  }
}

function createOpenAIModelSafe() {
  try {
    return createOpenAIClient();
  } catch {
    return null;
  }
}

/** Exported for tests — scoring should not force apparel onto vehicles. */
export function peekCatalogFallback(options: Parameters<typeof scoreEbayCategories>[0]) {
  return scoreEbayCategories(options)[0] ?? null;
}
