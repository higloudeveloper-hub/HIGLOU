import { NextResponse } from "next/server";
import { z } from "zod";
import {
  checkRateLimit,
  clientKeyFromRequest,
} from "@/lib/api/rate-limit";
import { requireUser } from "@/lib/auth/require-user";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import {
  AnalysisPipelineError,
  analyzeProductHybrid,
  QualityBlockedError,
} from "@/lib/ai/analyze-product";
import { ImageNormalizeError } from "@/lib/images/normalize-image";
import { AI_PROVIDER_DEFAULTS } from "@/config/ai-providers";
import {
  checkAnalysisBudgetGate,
  resolveRequestedTier,
} from "@/lib/costs/gate";
import {
  httpStatusForAnalysisFailure,
  type AnalysisFailureCode,
} from "@/types/analysis-failures";
import { cleanEnvUrl, cleanHttpsUrl } from "@/lib/images/url-sanitize";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  imageUrls: z.array(z.string().url()).min(1).max(12),
  imageMeta: z
    .array(
      z.object({
        id: z.string().optional(),
        url: z.string().url(),
        fileName: z.string().optional(),
        isPrimary: z.boolean().optional(),
      }),
    )
    .optional(),
  productId: z.string().uuid().optional(),
  forceImproveOcr: z.boolean().optional(),
  forceDeepAnalysis: z.boolean().optional(),
  forceFreshAnalysis: z.boolean().optional(),
  analysisTier: z.enum(["economy", "advanced"]).optional(),
  adminConfirmed: z.boolean().optional(),
  providers: z
    .object({
      openaiEnabled: z.boolean().optional(),
      googleVisionEnabled: z.boolean().optional(),
      barcodeEnabled: z.boolean().optional(),
      googleVisionMode: z.enum(["off", "fallback", "always"]).optional(),
      googleVisionMaxImages: z.number().int().min(0).max(8).optional(),
      documentTextFallback: z.boolean().optional(),
    })
    .optional(),
  productHints: z
    .object({
      brand: z.string().optional(),
      model: z.string().optional(),
      upc: z.string().optional(),
      categoryId: z.string().optional(),
      categoryName: z.string().optional(),
      condition: z.string().optional(),
      size: z.string().optional(),
      notes: z.string().optional(),
    })
    .optional(),
});

function isOwnedSupabaseImageUrl(url: string, userId?: string): boolean {
  const base = cleanEnvUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const clean = cleanHttpsUrl(url);
  if (!base || !userId) return true;
  const prefix = `${base}/storage/v1/object/public/`;
  if (!clean.startsWith(prefix)) {
    return /amazon|media-amazon|ssl-images-amazon|ebayimg\.com|ebaystatic\.com/i.test(
      clean,
    );
  }
  return clean.includes(`/${userId}/`);
}

export async function POST(request: Request) {
  let authResult: Awaited<ReturnType<typeof requireUser>> | null = null;
  let userId: string | undefined;

  if (isSupabaseConfigured()) {
    authResult = await requireUser();
    if (!authResult.ok) return authResult.response;
    userId = authResult.user.id;
  }

  const rate = checkRateLimit({
    key: clientKeyFromRequest(request, userId),
    limit: 10,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded. Try again shortly.",
        retryAfterMs: rate.retryAfterMs,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000) || 1),
        },
      },
    );
  }

  if (!process.env.OPENAI_API_KEY || !AI_PROVIDER_DEFAULTS.openaiEnabled) {
    return NextResponse.json(
      {
        error:
          "OPENAI_API_KEY is not configured. Set it in the server environment to analyze products.",
        code: "MISSING_OPENAI_API_KEY",
      },
      { status: 503 },
    );
  }

  try {
    const json = await request.json();
    const body = requestSchema.parse(json);
    const httpsUrls = body.imageUrls.filter((url) => /^https:\/\//i.test(url));

    if (!httpsUrls.length) {
      return NextResponse.json(
        {
          error:
            "Analyze requires at least one HTTPS image URL. Upload images first.",
        },
        { status: 400 },
      );
    }

    if (userId) {
      const foreign = httpsUrls.filter(
        (url) => !isOwnedSupabaseImageUrl(url, userId),
      );
      if (foreign.length) {
        return NextResponse.json(
          {
            error:
              "One or more image URLs are not owned by the current user or are not allowed hosts.",
          },
          { status: 403 },
        );
      }
    }

    const requestedTier = resolveRequestedTier({
      forceDeepAnalysis: body.forceDeepAnalysis,
      analysisTier: body.analysisTier,
    });

    const gate = await checkAnalysisBudgetGate({
      supabase: authResult?.ok ? authResult.supabase : null,
      userId,
      requestedTier,
      adminConfirmed: body.adminConfirmed,
    });

    if (!gate.allowed) {
      return NextResponse.json(
        {
          error: gate.message || "Budget limit reached for new AI analysis",
          code: "BUDGET_BLOCKED",
          status: gate.status,
          recommendations: gate.recommendations,
        },
        { status: 402 },
      );
    }

    if (requestedTier === "advanced" && !gate.allowAdvanced) {
      return NextResponse.json(
        {
          error:
            gate.message ||
            "Advanced analysis is blocked by the current budget settings.",
          code: "BUDGET_BLOCK_ADVANCED",
          status: gate.status,
          recommendations: gate.recommendations,
        },
        { status: 402 },
      );
    }

    const result = await analyzeProductHybrid({
      imageUrls: httpsUrls,
      imageMeta: body.imageMeta,
      productHints: body.productHints,
      forceImproveOcr: body.forceImproveOcr,
      forceDeepAnalysis: body.forceDeepAnalysis,
      forceFreshAnalysis: body.forceFreshAnalysis,
      analysisTier: requestedTier,
      providers: body.providers,
      userId,
      productId: body.productId,
      supabase: authResult?.ok ? authResult.supabase : null,
    });

    if (authResult?.ok) {
      try {
        await authResult.supabase.from("analysis_history").insert({
          user_id: authResult.user.id,
          product_id: body.productId ?? null,
          request_meta: {
            imageUrls: httpsUrls,
            productHints: body.productHints ?? {},
            pipeline: result.pipeline,
          },
          response_json: {
            analysis: result.analysis,
            evidence: result.evidence,
            conflicts: result.conflicts,
            barcodes: result.barcodes,
            ocrResults: result.ocrResults,
            costEstimate: result.costEstimate,
            normalizedProduct: result.normalizedProduct,
          },
          status: "completed",
        });
      } catch {
        // ignore persistence errors
      }
    }

    return NextResponse.json({
      analysis: result.analysis,
      evidence: result.evidence,
      conflicts: result.conflicts,
      barcodes: result.barcodes,
      ocrResults: result.ocrResults,
      normalizedProduct: result.normalizedProduct,
      pipeline: result.pipeline,
      stages: result.stages,
      costEstimate: result.costEstimate,
      quality: result.quality,
      budgetWarning: gate.message,
      budgetStatus: gate.status,
      recommendations: gate.recommendations,
      disclaimer:
        "Cost figures are internal estimates of platform operating costs only. Not an official invoice.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Product analysis failed";
    const code: AnalysisFailureCode | undefined =
      error instanceof AnalysisPipelineError ||
      error instanceof ImageNormalizeError ||
      error instanceof QualityBlockedError
        ? error.code
        : undefined;

    if (authResult?.ok) {
      try {
        await authResult.supabase.from("analysis_history").insert({
          user_id: authResult.user.id,
          request_meta: {},
          status: "failed",
          error_message: message,
        });
      } catch {
        // ignore
      }
    }

    const isPhotoInfra =
      code === "UNSUPPORTED_INPUT_FORMAT" ||
      code === "IMAGE_DECODE_FAILED" ||
      code === "IMAGE_TOO_SMALL";

    return NextResponse.json(
      {
        error: message,
        code,
        // Photo / pipeline failures are NOT "product unrecognized".
        stages: isPhotoInfra
          ? {
              recognition: {
                status: "waiting",
                message: "Recognition did not run — photo input failed first",
              },
              extraction: {
                status: "waiting",
                ocr: "waiting",
                barcode: "waiting",
              },
              classification: { status: "waiting" },
              listing: { status: "waiting" },
            }
          : code === "RECOGNITION_FAILED" || code === "NO_PRODUCT_VISIBLE"
            ? {
                recognition: { status: "failed", message },
                extraction: {
                  status: "waiting",
                  ocr: "waiting",
                  barcode: "waiting",
                },
                classification: { status: "waiting" },
                listing: { status: "waiting" },
              }
            : undefined,
      },
      { status: code ? httpStatusForAnalysisFailure(code) : 400 },
    );
  }
}
