"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CONDITION_OPTIONS } from "@/config/condition-map";
import { DEFAULT_VALUES } from "@/config/default-values";
import { createEmptyListing } from "@/lib/demo/sample-listing";
import {
  EBAY_CATEGORY_OPTIONS,
  resolveEbayCategory,
} from "@/config/ebay-categories";
import {
  buildListingDescriptionHtml,
  isWeakDescriptionHtml,
  synthesizeDescriptionSummary,
} from "@/lib/ebay/description-html";
import { sanitizeEbayHtml } from "@/lib/ebay/sanitize-html";
import {
  STORE_BRANDING_DEFAULTS,
  cloneStoreBranding,
  type StoreBranding,
} from "@/config/store-branding";
import {
  buildEbayTitle,
  generateSku,
} from "@/lib/ebay/listing-helpers";
import { estimatePackageAndShipping } from "@/lib/ebay/package-shipping";
import {
  hasCriticalErrors,
  validateListing,
} from "@/lib/validation/listing";
import {
  ANALYSIS_PROGRESS_STEPS,
  type AnalysisResult,
} from "@/types/analysis";
import type { ProductImage, ProductListing } from "@/types/product";
import type { AnalysisCostEstimate } from "@/components/listing/analysis-cost-panel";
import {
  mapAnalysisStepToPipeline,
} from "@/components/listing/analysis-pipeline";
import {
  getAttentionFields,
} from "@/components/listing/review-helpers";
import { readAiProviderSettings } from "@/components/settings/ai-settings-form";
import type { ConfidenceStatus } from "@/lib/ai/confidence-engine";
import type { WizardStep } from "@/components/listing/wizard/types";
import { WizardShell } from "@/components/listing/wizard/wizard-shell";
import { PhotosScreen } from "@/components/listing/wizard/photos-screen";
import { UnderstandScreen } from "@/components/listing/wizard/understand-screen";
import { ReviewScreen } from "@/components/listing/wizard/review-screen";
import { ExportScreen } from "@/components/listing/wizard/export-screen";
import { MoreDetailsDialog } from "@/components/listing/wizard/more-details-dialog";
import { humanizeAnalysisFailure } from "@/lib/ai/analysis-failure-ui";

const LISTING_SAVE_REQUIRED_MESSAGE =
  "Save the listing first so your draft can sync to eBay export.";

const PRODUCT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Rebuild Description HTML from current fields so drafts never ship stale/empty copy. */
function withFreshDescription(
  listing: ProductListing,
  branding: StoreBranding = STORE_BRANDING_DEFAULTS,
): ProductListing {
  const descriptionSummary = synthesizeDescriptionSummary(listing);
  const descriptionHtml = sanitizeEbayHtml(
    buildListingDescriptionHtml(
      {
        ...listing,
        descriptionSummary,
      },
      branding,
    ),
  );
  return {
    ...listing,
    descriptionSummary,
    descriptionHtml,
  };
}

function mapApiProductToListing(
  product: Record<string, unknown>,
  branding: StoreBranding = STORE_BRANDING_DEFAULTS,
): ProductListing {
  const base = createEmptyListing();
  const images = Array.isArray(product.images)
    ? (product.images as Array<Record<string, unknown>>).map(
        (image, index): ProductImage => ({
          id: String(image.id ?? `img-${index}`),
          url: String(image.publicUrl ?? image.url ?? ""),
          storagePath: String(image.storagePath ?? ""),
          fileName: String(image.fileName ?? "image.jpg"),
          sortOrder: Number(image.sortOrder ?? index),
          isPrimary: Boolean(image.isPrimary),
          mimeType: String(image.mimeType ?? "image/jpeg"),
          sizeBytes: Number(image.sizeBytes ?? 0),
          uploadProgress: 100,
        }),
      )
    : [];

  const itemSpecifics = Array.isArray(product.itemSpecifics)
    ? (product.itemSpecifics as Array<Record<string, unknown>>).map((field) => ({
        key: String(field.key ?? field.csvColumn ?? "C:Custom"),
        label: String(field.label ?? "Custom"),
        value: String(field.value ?? ""),
        required: Boolean(field.required),
        confidence:
          field.confidence === null || field.confidence === undefined
            ? undefined
            : Number(field.confidence),
        isCustom: Boolean(field.isCustom),
      }))
    : base.itemSpecifics;

  const mapped: ProductListing = {
    ...base,
    id: String(product.id ?? base.id),
    status: (product.status as ProductListing["status"]) || base.status,
    title: String(product.title ?? ""),
    subtitle: String(product.subtitle ?? ""),
    brand: String(product.brand ?? ""),
    collection: String(product.collection ?? ""),
    model: String(product.model ?? ""),
    mpn: String(product.mpn ?? ""),
    upc: String(product.upc ?? ""),
    sku: String(product.sku ?? ""),
    productType: String(product.productType ?? ""),
    categoryId: String(product.categoryId ?? ""),
    categoryName: String(product.categoryName ?? ""),
    condition: String(product.condition ?? "New"),
    conditionId: String(product.conditionId ?? "NEW"),
    conditionDescription: String(product.conditionDescription ?? ""),
    price:
      product.price === null || product.price === undefined
        ? null
        : Number(product.price),
    quantity: Number(product.quantity ?? 1),
    listingFormat:
      (product.listingFormat as ProductListing["listingFormat"]) ||
      "FixedPrice",
    size: String(product.size ?? ""),
    type: String(product.productType ?? ""),
    colors: Array.isArray(product.colors)
      ? (product.colors as string[])
      : [],
    materials: Array.isArray(product.materials)
      ? (product.materials as string[])
      : [],
    features: Array.isArray(product.features)
      ? (product.features as string[])
      : [],
    setIncludes: Array.isArray(product.setIncludes)
      ? (product.setIncludes as string[])
      : [],
    missingItems: Array.isArray(product.missingItems)
      ? (product.missingItems as string[])
      : [],
    descriptionSummary: String(product.descriptionSummary ?? ""),
    descriptionHtml: String(product.descriptionHtml ?? base.descriptionHtml),
    itemSpecifics,
    images,
    shippingPolicyId: String(product.shippingPolicyId ?? ""),
    returnPolicyId: String(product.returnPolicyId ?? ""),
    paymentPolicyId: String(product.paymentPolicyId ?? ""),
    handlingTime: Number(product.handlingTime ?? 1),
    itemLocation: String(product.itemLocation || DEFAULT_VALUES.itemLocation),
    postalCode: String(product.postalCode || DEFAULT_VALUES.postalCode),
    country: String(product.country || DEFAULT_VALUES.country),
    createdAt: String(product.createdAt ?? base.createdAt),
    updatedAt: String(product.updatedAt ?? base.updatedAt),
  };

  // Heal empty/stale HTML from DB so review + export show real copy.
  if (isWeakDescriptionHtml(mapped.descriptionHtml) && mapped.title.trim()) {
    return withFreshDescription(mapped, branding);
  }
  return mapped;
}

export function NewListingWorkspace({
  productId,
}: {
  productId?: string;
} = {}) {
  const [listing, setListing] = useState<ProductListing>(() => createEmptyListing());
  const [storeBranding, setStoreBranding] = useState<StoreBranding>(() =>
    cloneStoreBranding(STORE_BRANDING_DEFAULTS),
  );
  const [step, setStep] = useState<WizardStep>("photos");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisErrorCode, setAnalysisErrorCode] = useState<string | null>(
    null,
  );
  const [analysisStages, setAnalysisStages] = useState<
    import("@/types/analysis-stages").AnalysisPipelineStages | null
  >(null);
  const [costEstimate, setCostEstimate] = useState<AnalysisCostEstimate | null>(
    null,
  );
  const [loadingProduct, setLoadingProduct] = useState(Boolean(productId));
  const [fieldConfidence, setFieldConfidence] = useState<
    Record<string, { status: ConfidenceStatus; sources: string[]; confidence: number }>
  >({});
  const [moreOpen, setMoreOpen] = useState(false);
  const [publishingDonBaraton, setPublishingDonBaraton] = useState(false);
  const analyzeAbortRef = useRef(false);
  const firstAttentionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cached = localStorage.getItem("higlou-active-branding");
        if (cached) {
          const parsed = JSON.parse(cached) as StoreBranding;
          if (!cancelled && parsed?.storeName) {
            setStoreBranding(cloneStoreBranding(parsed));
          }
        }
      } catch {
        /* ignore */
      }
      try {
        const res = await fetch("/api/settings/branding");
        if (!res.ok) return;
        const body = (await res.json()) as { branding: StoreBranding };
        if (!cancelled && body.branding) {
          setStoreBranding(cloneStoreBranding(body.branding));
          try {
            localStorage.setItem(
              "higlou-active-branding",
              JSON.stringify(body.branding),
            );
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* keep defaults / cache */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    (async () => {
      setLoadingProduct(true);
      try {
        const response = await fetch(`/api/products/${productId}`);
        if (!response.ok) {
          throw new Error("Failed to load product");
        }
        const body = (await response.json()) as {
          product: Record<string, unknown>;
        };
        if (!cancelled && body.product) {
          setListing(mapApiProductToListing(body.product, storeBranding));
          setStep("review");
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(
            error instanceof Error ? error.message : "Failed to load product",
          );
        }
      } finally {
        if (!cancelled) setLoadingProduct(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId]); // branding applied via separate effect

  // Keep description HTML aligned with active store name + template.
  useEffect(() => {
    setListing((prev) => {
      if (!prev.title.trim() && !prev.descriptionSummary.trim()) return prev;
      const next = withFreshDescription(prev, storeBranding);
      if (next.descriptionHtml === prev.descriptionHtml) return prev;
      return next;
    });
  }, [storeBranding]);

  const update = <K extends keyof ProductListing>(
    key: K,
    value: ProductListing[K],
  ) => {
    setListing((prev) => ({ ...prev, [key]: value, updatedAt: new Date().toISOString() }));
  };

  const validationItems = useMemo(
    () => validateListing(listing, storeBranding.storeName),
    [listing, storeBranding.storeName],
  );
  const blocked = hasCriticalErrors(validationItems);
  const attentionFields = useMemo(() => getAttentionFields(listing), [listing]);

  const orderedImageUrls = useMemo(() => {
    const ordered = [...listing.images].sort((a, b) => {
      if (a.isPrimary === b.isPrimary) return a.sortOrder - b.sortOrder;
      return a.isPrimary ? -1 : 1;
    });
    return ordered.map((img) => img.url).filter(Boolean);
  }, [listing.images]);

  const httpsImageUrls = useMemo(
    () => orderedImageUrls.filter((url) => /^https:\/\//i.test(url)),
    [orderedImageUrls],
  );

  const exported = listing.status === "CSV Generated";
  const donBaratonPublished = listing.status === "Published";

  const regenerateFieldWithAi = async (
    field: "title" | "description",
    instruction?: string,
  ) => {
    try {
      const response = await fetch("/api/regenerate-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field,
          productId: /^[0-9a-f-]{36}$/i.test(listing.id)
            ? listing.id
            : undefined,
          listingSnapshot: {
            title: listing.title,
            brand: listing.brand,
            model: listing.model,
            categoryName: listing.categoryName,
            condition: listing.condition,
            size: listing.size,
            upc: listing.upc,
            descriptionSummary: listing.descriptionSummary,
            colors: listing.colors,
            materials: listing.materials,
            features: listing.features,
          },
          instruction:
            instruction ??
            (field === "title"
              ? "Make the title better without inventing facts"
              : "Regenerate description from saved analysis facts"),
        }),
      });
      const body = (await response.json()) as {
        title?: string;
        descriptionSummary?: string;
        error?: string;
        budgetWarning?: string;
      };
      if (!response.ok) {
        toast.error(body.error || "Partial regeneration failed");
        return;
      }
      if (field === "title" && body.title) {
        update("title", body.title.slice(0, 80));
        toast.success("Title updated");
      }
      if (field === "description" && body.descriptionSummary) {
        const next = withFreshDescription(
          {
            ...listing,
            descriptionSummary: body.descriptionSummary,
          },
          storeBranding,
        );
        setListing((prev) => ({
          ...prev,
          descriptionSummary: next.descriptionSummary,
          descriptionHtml: next.descriptionHtml,
          updatedAt: new Date().toISOString(),
        }));
        toast.success("Description updated");
      }
      if (body.budgetWarning) toast.message(body.budgetWarning);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Partial regeneration failed",
      );
    }
  };

  const applyAnalysisResult = (analysis: AnalysisResult, prev: ProductListing) => {
    const brand = analysis.brand || prev.brand;
    const model = analysis.model || analysis.collection || prev.model;
    const productType = analysis.type || prev.productType;
    const size = analysis.size || prev.size;
    const colors = analysis.colors.length ? analysis.colors : prev.colors;
    const numberOfItems = analysis.numberOfItems ?? prev.numberOfItems;

    const title =
      analysis.title ||
      buildEbayTitle({
        brand,
        model: analysis.collection || model,
        type: productType,
        size,
        pieces: numberOfItems,
        color: colors[0],
      });

    const sku = generateSku({
      brand,
      model: model || analysis.collection,
      size,
      color: colors[0],
    });

    const itemSpecifics =
      analysis.itemSpecifics.length > 0
        ? analysis.itemSpecifics.map((field) => ({
            key: field.key.startsWith("C:") ? field.key : `C:${field.key}`,
            label: field.label,
            value: field.value,
            confidence: field.confidence,
          }))
        : prev.itemSpecifics;

    const category = resolveEbayCategory({
      categoryId: analysis.categoryId || prev.categoryId,
      categoryName: analysis.categoryName || prev.categoryName,
      productType: productType || analysis.type || analysis.categoryId,
      title,
      brand,
      materials: analysis.materials,
      features: analysis.features,
    });

    const shipping = estimatePackageAndShipping({
      title,
      productType,
      size,
      categoryName: category.categoryName,
      brand,
      quantity: analysis.quantity || prev.quantity,
    });

    const next: ProductListing = {
      ...prev,
      title: title.slice(0, 80),
      brand,
      collection: analysis.collection || prev.collection,
      model,
      mpn: analysis.mpn || "",
      upc: analysis.upc || "",
      sku,
      productType,
      type: productType,
      categoryId: category.categoryId,
      categoryName: category.categoryName,
      itemLocation: prev.itemLocation || DEFAULT_VALUES.itemLocation,
      postalCode: prev.postalCode || DEFAULT_VALUES.postalCode,
      country: prev.country || DEFAULT_VALUES.country,
      shippingService: shipping.shippingService,
      shippingCost: shipping.shippingCost,
      freeShipping: shipping.shippingCost === 0,
      condition: analysis.condition || prev.condition,
      conditionId:
      analysis.conditionId || prev.conditionId || "NEW",
      conditionDescription:
        (analysis as { conditionNotes?: string }).conditionNotes ||
        prev.conditionDescription,
      price: analysis.price ?? prev.price,
      quantity: analysis.quantity || prev.quantity,
      size,
      colors,
      materials: analysis.materials.length ? analysis.materials : prev.materials,
      pattern: analysis.pattern || prev.pattern,
      style: analysis.style || prev.style,
      department: analysis.department || prev.department,
      room: analysis.room || prev.room,
      features: analysis.features.length ? analysis.features : prev.features,
      setIncludes: analysis.setIncludes.length
        ? analysis.setIncludes
        : prev.setIncludes,
      missingItems: Array.isArray((analysis as { missingItems?: string[] }).missingItems)
        ? ((analysis as { missingItems?: string[] }).missingItems as string[])
        : prev.missingItems,
      numberOfItems,
      careInstructions: analysis.careInstructions.length
        ? analysis.careInstructions
        : prev.careInstructions,
      countryOfManufacture:
        analysis.countryOfManufacture || prev.countryOfManufacture,
      descriptionSummary:
        analysis.descriptionSummary || prev.descriptionSummary,
      itemSpecifics,
      status: "Needs Review",
      updatedAt: new Date().toISOString(),
      descriptionHtml: "",
    };

    return withFreshDescription(next, storeBranding);
  };

  const analyzeProduct = async (options?: {
    forceImproveOcr?: boolean;
    forceDeepAnalysis?: boolean;
    forceFreshAnalysis?: boolean;
  }) => {
    if (!listing.images.length) {
      toast.error("Upload at least one product image first");
      return;
    }
    if (!httpsImageUrls.length) {
      toast.error(
        "Upload images to HTTPS public URLs before analyzing (retry failed uploads).",
      );
      return;
    }

    analyzeAbortRef.current = false;
    setAnalyzing(true);
    setStep("analyzing");
    setAnalysisStep(0);
    setAnalysisError(null);
    setAnalysisErrorCode(null);
    setAnalysisStages(null);
    update("status", "Analyzing");

    const progressTimer = window.setInterval(() => {
      setAnalysisStep((s) =>
        Math.min(s + 1, ANALYSIS_PROGRESS_STEPS.length - 1),
      );
    }, 700);

    try {
      const aiProviders = readAiProviderSettings();
      const response = await fetch("/api/analyze-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrls: httpsImageUrls,
          forceImproveOcr: Boolean(options?.forceImproveOcr),
          forceDeepAnalysis: Boolean(options?.forceDeepAnalysis),
          forceFreshAnalysis: Boolean(options?.forceFreshAnalysis),
          analysisTier: options?.forceDeepAnalysis ? "advanced" : "economy",
          productId: /^[0-9a-f-]{36}$/i.test(listing.id) ? listing.id : undefined,
          providers: {
            openaiEnabled: aiProviders.openaiEnabled,
            googleVisionEnabled: aiProviders.googleVisionEnabled,
            barcodeEnabled: aiProviders.barcodeEnabled,
            googleVisionMode: aiProviders.googleVisionMode,
            googleVisionMaxImages: aiProviders.googleVisionMaxImages,
            documentTextFallback: aiProviders.documentTextFallback,
          },
          imageMeta: listing.images
            .filter((img) => /^https:\/\//i.test(img.url))
            .map((img) => ({
              id: img.id,
              url: img.url,
              fileName: img.fileName,
              isPrimary: img.isPrimary,
            })),
          productHints: {
            brand: listing.brand,
            model: listing.model,
            upc: listing.upc,
            categoryId: listing.categoryId,
            categoryName: listing.categoryName,
            condition: listing.condition,
            size: listing.size,
          },
        }),
      });

      const body = (await response.json().catch(() => null)) as {
        analysis?: AnalysisResult;
        error?: string;
        code?: string;
        costEstimate?: AnalysisCostEstimate & {
          cacheHit?: boolean;
          savingsNote?: string;
        };
        budgetWarning?: string;
        recommendations?: string[];
        stages?: import("@/types/analysis-stages").AnalysisPipelineStages;
        normalizedProduct?: {
          identity?: Record<
            string,
            { status: ConfidenceStatus; sources: string[]; confidence: number }
          >;
          analysis?: { cacheHit?: boolean };
        };
        pipeline?: {
          barcodeCount?: number;
          ocrImageCount?: number;
          openaiImages?: number;
          cacheHit?: boolean;
          stages?: import("@/types/analysis-stages").AnalysisPipelineStages;
        };
      } | null;

      if (analyzeAbortRef.current) {
        toast.message("Analysis cancelled");
        setStep("photos");
        return;
      }

      if (!response.ok || !body?.analysis) {
        const raw =
          body?.error ||
          (body?.code === "MISSING_OPENAI_API_KEY"
            ? "OPENAI_API_KEY is not configured"
            : "Product analysis failed");
        const message =
          raw.includes("conditionId") || raw.includes("invalid_type")
            ? "Analysis almost finished, but one product field needed a cleanup. Please try again."
            : raw.startsWith("[")
              ? "Analysis failed while validating AI output. Please try again."
              : humanizeAnalysisFailure(body?.code, raw);
        setAnalysisError(message);
        setAnalysisErrorCode(body?.code ?? null);
        setAnalysisStages(body?.stages ?? body?.pipeline?.stages ?? null);
        if (body?.recommendations?.length) {
          toast.message("Budget recommendations", {
            description: body.recommendations.slice(0, 3).join(" · "),
          });
        }
        update("status", "Needs Review");
        toast.error(message);
        return;
      }

      setAnalysisStep(ANALYSIS_PROGRESS_STEPS.length - 1);
      setAnalysisStages(body.stages ?? body.pipeline?.stages ?? null);
      setAnalysisErrorCode(null);
      const identity = body.normalizedProduct?.identity ?? {};
      const attributes = (
        body.normalizedProduct as
          | {
              attributes?: {
                material?: {
                  status: ConfidenceStatus;
                  sources: string[];
                  confidence: number;
                };
              };
            }
          | undefined
      )?.attributes;
      const nextConfidence: typeof fieldConfidence = {};
      for (const key of ["brand", "model", "upc", "mpn", "productType"] as const) {
        const field = identity[key];
        if (field) {
          nextConfidence[key] = {
            status: field.status,
            sources: field.sources,
            confidence: field.confidence,
          };
        }
      }
      if (attributes?.material) {
        nextConfidence.material = {
          status: attributes.material.status,
          sources: attributes.material.sources,
          confidence: attributes.material.confidence,
        };
      }
      setFieldConfidence(nextConfidence);
      const cacheHit = Boolean(
        body.pipeline?.cacheHit ||
          body.costEstimate?.cacheHit ||
          body.normalizedProduct?.analysis?.cacheHit,
      );
      const analyzed = applyAnalysisResult(body.analysis!, listing);
      setListing(analyzed);
      setStep("reveal");
      setCostEstimate({
        ...(body.costEstimate ?? {}),
        barcodeCount: body.pipeline?.barcodeCount,
        ocrImageCount: body.pipeline?.ocrImageCount,
        imageCount: body.pipeline?.openaiImages,
      });
      // Persist immediately so /listings always shows this draft.
      const saved = await persistDraft({ quiet: true, draft: analyzed });
      if (body.budgetWarning) {
        toast.message(body.budgetWarning);
      }
      if (saved.ok) {
        toast.success(
          cacheHit
            ? "Loaded from cache — saved to Listings"
            : body.costEstimate?.savingsNote
              ? `Listing ready · saved · ${body.costEstimate.savingsNote}`
              : "Listing ready — saved to Listings",
        );
      } else if (body.analysis.warnings?.length) {
        toast.message("Your listing is ready — a few fields need a quick review", {
          description: body.analysis.warnings.slice(0, 3).join(" · "),
        });
      } else if (cacheHit) {
        toast.success("Loaded from cache — no paid AI calls");
      } else {
        toast.success("Your listing is ready — review when you’re set");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Product analysis failed";
      setAnalysisError(message);
      update("status", "Needs Review");
      toast.error(message);
    } finally {
      window.clearInterval(progressTimer);
      setAnalyzing(false);
    }
  };

  const persistDraft = async (options?: {
    quiet?: boolean;
    draft?: ProductListing;
  }): Promise<
    | { ok: true; productId: string }
    | { ok: false; message: string }
  > => {
    const current = options?.draft ?? listing;
    localStorage.setItem(
      `higlou-listing-${current.id}`,
      JSON.stringify(current),
    );

    try {
      const priceNum =
        current.price === null || current.price === undefined
          ? null
          : Number(current.price);
      const payload = {
        title: String(current.title || ""),
        subtitle: String(current.subtitle || ""),
        brand: String(current.brand || ""),
        collection: String(current.collection || ""),
        model: String(current.model || ""),
        sku: String(current.sku || ""),
        upc: String(current.upc || ""),
        mpn: String(current.mpn || ""),
        categoryId: String(current.categoryId || ""),
        categoryName: String(current.categoryName || ""),
        condition: String(current.condition || ""),
        conditionId: String(current.conditionId || ""),
        conditionDescription: String(current.conditionDescription || ""),
        price: Number.isFinite(priceNum as number) ? priceNum : null,
        quantity: Math.max(1, Math.floor(Number(current.quantity) || 1)),
        listingFormat: String(current.listingFormat || "FixedPrice"),
        descriptionHtml: String(current.descriptionHtml || ""),
        descriptionSummary: String(current.descriptionSummary || ""),
        itemSpecifics: (current.itemSpecifics || []).map((field) => ({
          key: String(field.key || ""),
          label: String(field.label || field.key || "Custom"),
          value: field.value == null ? "" : String(field.value),
          required: Boolean(field.required),
          confidence:
            field.confidence === null || field.confidence === undefined
              ? null
              : Number(field.confidence),
          isCustom: Boolean(field.isCustom),
        })),
        features: (current.features || []).map(String),
        setIncludes: (current.setIncludes || []).map(String),
        colors: (current.colors || []).map(String),
        materials: (current.materials || []).map(String),
        size: String(current.size || ""),
        productType: String(current.productType || ""),
        shippingPolicyId: String(current.shippingPolicyId || ""),
        returnPolicyId: String(current.returnPolicyId || ""),
        paymentPolicyId: String(current.paymentPolicyId || ""),
        handlingTime: Math.max(0, Math.floor(Number(current.handlingTime) || 1)),
        itemLocation: String(current.itemLocation || ""),
        postalCode: String(current.postalCode || ""),
        country: String(current.country || "US"),
        status: current.status || "Needs Review",
        images: current.images
          .filter((image) => /^https:\/\//i.test(image.url))
          .map((image, index) => ({
            publicUrl: image.url,
            storagePath: image.storagePath || `pending/${current.id}/${index}`,
            fileName: image.fileName || `image-${index}.jpg`,
            sortOrder: Number.isFinite(image.sortOrder) ? image.sortOrder : index,
            isPrimary: Boolean(image.isPrimary ?? index === 0),
            mimeType: image.mimeType || "image/jpeg",
            sizeBytes: Math.max(0, Math.floor(Number(image.sizeBytes) || 0)),
          })),
      };

      const isUuid = PRODUCT_UUID_RE.test(current.id);

      const response = await fetch(
        isUuid ? `/api/products/${current.id}` : "/api/products",
        {
          method: isUuid ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (response.status === 401 || response.status === 503) {
        const message =
          "Sign in to save your listing, then try again. / Inicia sesión para guardar tu anuncio e intenta de nuevo.";
        toast.error("Listing not saved to library", { description: message });
        return { ok: false, message };
      }

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || "Failed to sync draft");
      }

      const body = (await response.json()) as {
        product?: { id?: string };
      };
      const savedId = body.product?.id;
      if (savedId && PRODUCT_UUID_RE.test(savedId)) {
        if (savedId !== current.id || options?.draft) {
          setListing((prev) => ({
            ...prev,
            ...(options?.draft ?? {}),
            id: savedId,
            updatedAt: new Date().toISOString(),
          }));
        }
        if (!options?.quiet) {
          toast.success("Draft saved to Listings");
        }
        return { ok: true, productId: savedId };
      }

      if (isUuid) {
        if (!options?.quiet) {
          toast.success("Draft saved to Listings");
        }
        return { ok: true, productId: current.id };
      }

      toast.error("Listing not saved to library", {
        description: LISTING_SAVE_REQUIRED_MESSAGE,
      });
      return { ok: false, message: LISTING_SAVE_REQUIRED_MESSAGE };
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "Cloud sync unavailable";
      toast.error("Listing not saved to library", { description });
      return {
        ok: false,
        message: `${description} — ${LISTING_SAVE_REQUIRED_MESSAGE}`,
      };
    }
  };

  const saveDraft = async () => {
    await persistDraft({ quiet: false });
  };

  const generateCsv = async (): Promise<boolean> => {
    // Rebuild Description from current fields BEFORE save/export.
    const fresh = withFreshDescription(listing, storeBranding);
    if (
      fresh.descriptionHtml !== listing.descriptionHtml ||
      fresh.descriptionSummary !== listing.descriptionSummary
    ) {
      setListing((prev) => ({
        ...prev,
        descriptionSummary: fresh.descriptionSummary,
        descriptionHtml: fresh.descriptionHtml,
        updatedAt: new Date().toISOString(),
      }));
    }

    // Ensure the listing is in the library before export.
    await persistDraft({ quiet: true, draft: fresh });

    // Heal missing/non-numeric category before hitting the API (AI often returns a name only).
    let exportListing = fresh;
    if (!/^\d{3,8}$/.test(String(listing.categoryId || "").trim())) {
      const resolved = resolveEbayCategory({
        categoryId: listing.categoryId,
        categoryName: listing.categoryName,
        productType: listing.productType || listing.type,
        title: listing.title,
        brand: listing.brand,
      });
      if (resolved.categoryId) {
        exportListing = {
          ...listing,
          categoryId: resolved.categoryId,
          categoryName: resolved.categoryName || listing.categoryName,
        };
        setListing((prev) => ({
          ...prev,
          categoryId: resolved.categoryId,
          categoryName: resolved.categoryName || prev.categoryName,
          updatedAt: new Date().toISOString(),
        }));
      }
    }

    const items = validateListing(exportListing);
    // Category can be healed server-side — don't block the export UX on it.
    const blocking = items.filter(
      (item) =>
        !item.ok &&
        item.severity === "critical" &&
        item.id !== "category",
    );
    if (blocking.length > 0) {
      toast.error("Fix critical validation errors before generating CSV");
      setMoreOpen(true);
      return false;
    }

    try {
      const response = await fetch("/api/generate-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: /^[0-9a-f-]{36}$/i.test(exportListing.id)
            ? exportListing.id
            : undefined,
          sku: exportListing.sku,
          categoryId: exportListing.categoryId || "20620",
          title: exportListing.title,
          upc: exportListing.upc,
          price: exportListing.price,
          quantity: exportListing.quantity,
          itemPhotoUrls: orderedImageUrls,
          conditionId: exportListing.conditionId,
          descriptionHtml: exportListing.descriptionHtml,
          format: exportListing.listingFormat,
          brand: exportListing.brand,
          model: exportListing.model || exportListing.collection,
          size: exportListing.size,
          productType: exportListing.productType || exportListing.type,
          categoryName: exportListing.categoryName,
          itemSpecifics: exportListing.itemSpecifics.map((field) => ({
            key: field.key,
            value: field.value,
          })),
          policyValues: {
            ...(exportListing.shippingPolicyId
              ? { "Shipping profile name": exportListing.shippingPolicyId }
              : {}),
            ...(exportListing.returnPolicyId
              ? { "Return profile name": exportListing.returnPolicyId }
              : {}),
            ...(exportListing.paymentPolicyId
              ? { "Payment profile name": exportListing.paymentPolicyId }
              : {}),
          },
          itemLocation:
            exportListing.itemLocation || DEFAULT_VALUES.itemLocation,
          postalCode: exportListing.postalCode || DEFAULT_VALUES.postalCode,
          country: exportListing.country || DEFAULT_VALUES.country,
          handlingTime: exportListing.handlingTime,
          shippingPolicyId: exportListing.shippingPolicyId,
          returnPolicyId: exportListing.returnPolicyId,
          paymentPolicyId: exportListing.paymentPolicyId,
          shippingService: exportListing.shippingService,
          shippingCost: exportListing.shippingCost ?? undefined,
          // Official Create Drafts template (eBay rejects invented Create/Schedule INFO).
          exportMode: "draft",
        }),
      });

      if (!response.ok) {
        const raw = await response.text();
        let message = "CSV generation failed";
        if (/^\s*<!DOCTYPE html/i.test(raw) || /__next_error__/i.test(raw)) {
          message =
            response.status === 401
              ? "Sign in again, then export the CSV."
              : "CSV export crashed on the server. Try again in a moment.";
        } else {
          try {
            const errorBody = JSON.parse(raw) as { error?: string };
            if (errorBody?.error?.trim()) message = errorBody.error.trim();
          } catch {
            if (raw.trim()) message = raw.trim().slice(0, 240);
          }
        }
        throw new Error(message);
      }

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        throw new Error("Sign in again, then export the CSV.");
      }

      const blob = await response.blob();
      if (!blob.size) {
        throw new Error("CSV generation returned an empty file");
      }
      const disposition = response.headers.get("Content-Disposition") || "";
      const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const asciiMatch = disposition.match(/filename="([^"]+)"/);
      const fileName = utf8Match
        ? decodeURIComponent(utf8Match[1])
        : asciiMatch?.[1] || "Higlou_Export.csv";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      update("status", "CSV Generated");
      const uploadHint =
        response.headers.get("X-Higlou-Upload-Hint") ||
        'Upload as "Create drafts" — then complete shipping on eBay.';
      const donBaratonSync =
        response.headers.get("X-Higlou-DonBaraton-Sync") || "";
      toast.success(`Downloaded ${fileName}`, {
        description: uploadHint,
        duration: 12000,
      });
      // CSV export never publishes to Don Baratón — only the Publish button does.
      if (donBaratonSync.startsWith("error:")) {
        toast.error("Don Baratón sync failed", {
          description: donBaratonSync.slice(6).slice(0, 160),
          duration: 10000,
        });
      }
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "CSV generation failed");
      return false;
    }
  };

  const publishToDonBaraton = async () => {
    const fresh = withFreshDescription(listing, storeBranding);
    if (
      fresh.descriptionHtml !== listing.descriptionHtml ||
      fresh.descriptionSummary !== listing.descriptionSummary
    ) {
      setListing((prev) => ({
        ...prev,
        descriptionSummary: fresh.descriptionSummary,
        descriptionHtml: fresh.descriptionHtml,
        updatedAt: new Date().toISOString(),
      }));
    }

    let publishListing = fresh;
    if (!/^\d{3,8}$/.test(String(fresh.categoryId || "").trim())) {
      const resolved = resolveEbayCategory({
        categoryId: fresh.categoryId,
        categoryName: fresh.categoryName,
        productType: fresh.productType || fresh.type,
        title: fresh.title,
        brand: fresh.brand,
      });
      if (resolved.categoryId) {
        publishListing = {
          ...fresh,
          categoryId: resolved.categoryId,
          categoryName: resolved.categoryName || fresh.categoryName,
        };
        setListing((prev) => ({
          ...prev,
          categoryId: resolved.categoryId,
          categoryName: resolved.categoryName || prev.categoryName,
          updatedAt: new Date().toISOString(),
        }));
      }
    }

    const items = validateListing(publishListing);
    const blocking = items.filter(
      (item) =>
        !item.ok &&
        item.severity === "critical" &&
        item.id !== "category",
    );
    if (blocking.length > 0) {
      toast.error("Fix critical validation errors before publishing");
      setMoreOpen(true);
      return;
    }

    setPublishingDonBaraton(true);
    try {
      const csvResponse = await fetch("/api/generate-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: /^[0-9a-f-]{36}$/i.test(publishListing.id)
            ? publishListing.id
            : undefined,
          sku: publishListing.sku,
          categoryId: publishListing.categoryId || "20620",
          title: publishListing.title,
          upc: publishListing.upc,
          price: publishListing.price,
          quantity: publishListing.quantity,
          itemPhotoUrls: orderedImageUrls,
          conditionId: publishListing.conditionId,
          descriptionHtml: publishListing.descriptionHtml,
          format: publishListing.listingFormat,
          brand: publishListing.brand,
          model: publishListing.model || publishListing.collection,
          size: publishListing.size,
          productType: publishListing.productType || publishListing.type,
          categoryName:
            publishListing.categoryName || "Lamps, Lighting & Ceiling Fans",
          itemSpecifics: publishListing.itemSpecifics.map((field) => ({
            key: field.key,
            value: field.value,
          })),
          policyValues: {
            ...(publishListing.shippingPolicyId
              ? { "Shipping profile name": publishListing.shippingPolicyId }
              : {}),
            ...(publishListing.returnPolicyId
              ? { "Return profile name": publishListing.returnPolicyId }
              : {}),
            ...(publishListing.paymentPolicyId
              ? { "Payment profile name": publishListing.paymentPolicyId }
              : {}),
          },
          itemLocation:
            publishListing.itemLocation || DEFAULT_VALUES.itemLocation,
          postalCode: publishListing.postalCode || DEFAULT_VALUES.postalCode,
          country: publishListing.country || DEFAULT_VALUES.country,
          handlingTime: publishListing.handlingTime,
          shippingPolicyId: publishListing.shippingPolicyId,
          returnPolicyId: publishListing.returnPolicyId,
          paymentPolicyId: publishListing.paymentPolicyId,
          shippingService: publishListing.shippingService,
          shippingCost: publishListing.shippingCost ?? undefined,
          exportMode: "draft",
        }),
      });

      if (!csvResponse.ok) {
        const errBody = (await csvResponse.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(errBody?.error || "Failed to build eBay CSV");
      }

      const csv = await csvResponse.text();
      const disposition = csvResponse.headers.get("Content-Disposition") || "";
      const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const asciiMatch = disposition.match(/filename="([^"]+)"/);
      const fileName = utf8Match
        ? decodeURIComponent(utf8Match[1])
        : asciiMatch?.[1] || "Higlou_Export.csv";

      const syncHeader =
        csvResponse.headers.get("X-Higlou-DonBaraton-Sync") || "";
      if (syncHeader.startsWith("ok")) {
        update("status", "Published");
        toast.success("Published to Don Baratón", {
          description: "Same eBay CSV applied (create/update by SKU).",
          duration: 10000,
        });
        return;
      }

      // Retry via dedicated import route if generate-csv skipped or errored.
      const importResponse = await fetch("/api/don-baraton/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, fileName }),
      });
      const body = (await importResponse.json().catch(() => null)) as {
        error?: string;
        message?: string;
        storefrontUrl?: string;
      } | null;
      if (!importResponse.ok) {
        throw new Error(body?.error || "Failed to publish to Don Baratón");
      }
      update("status", "Published");
      toast.success("Published to Don Baratón", {
        description: body?.storefrontUrl || body?.message || "Import applied",
        duration: 10000,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Don Baratón publish failed",
      );
    } finally {
      setPublishingDonBaraton(false);
    }
  };

  const startNewProduct = () => {
    setListing(createEmptyListing());
    setStep("photos");
    setAnalysisError(null);
    setCostEstimate(null);
    setFieldConfidence({});
    setMoreOpen(false);
    toast.success("Ready for a new product");
  };

  const generateCsvDisabledReason = blocked
    ? "Blocked by critical validation errors"
    : "";

  const exportDisabled = blocked || loadingProduct;

  const pipelineIndex = mapAnalysisStepToPipeline(
    analysisStep,
    ANALYSIS_PROGRESS_STEPS.length,
  );

  const productLabel =
    [listing.brand, listing.model || listing.collection, listing.productType]
      .filter(Boolean)
      .join(" ") || listing.title;

  const showChrome =
    step !== "photos" && step !== "analyzing" && step !== "reveal";

  return (
    <WizardShell
      step={step}
      exported={exported}
      flush
      headerActions={
        showChrome ? (
          <button
            type="button"
            onClick={() => void saveDraft()}
            disabled={loadingProduct}
            className="hidden h-9 items-center rounded-full border border-border bg-surface px-4 text-sm font-medium sm:inline-flex"
          >
            Save Draft
          </button>
        ) : undefined
      }
    >
      {loadingProduct ? (
        <p className="mb-4 px-6 text-sm text-muted-foreground">
          Loading product…
        </p>
      ) : null}

      {step === "photos" ? (
        <PhotosScreen
          images={listing.images}
          productId={listing.id}
          price={listing.price}
          condition={listing.condition}
          uploadingPending={listing.images.length > 0 && !httpsImageUrls.length}
          canContinue={httpsImageUrls.length > 0 && !analyzing}
          analysisError={analysisError}
          onImagesChange={(images) => update("images", images)}
          onPriceChange={(price) => update("price", price)}
          onConditionChange={(condition) => {
            const match = CONDITION_OPTIONS.find((c) => c.label === condition);
            setListing((prev) => ({
              ...prev,
              condition,
              conditionId: match?.conditionId ?? prev.conditionId,
              updatedAt: new Date().toISOString(),
            }));
          }}
          onContinue={() => void analyzeProduct()}
        />
      ) : null}

      {step === "analyzing" || step === "reveal" ? (
        <UnderstandScreen
          mode={step === "reveal" ? "reveal" : "analyzing"}
          listing={listing}
          images={listing.images}
          activeIndex={pipelineIndex}
          analysisError={analysisError}
          analysisErrorCode={analysisErrorCode}
          stages={analysisStages}
          materialConfidence={fieldConfidence.material}
          onCancel={() => {
            if (step === "analyzing") {
              analyzeAbortRef.current = true;
              setAnalyzing(false);
              toast.message("Cancelled");
            }
            setStep("photos");
          }}
          onRetry={() => void analyzeProduct()}
          onContinue={() => {
            void (async () => {
              await persistDraft({ quiet: true });
              setStep("review");
            })();
          }}
        />
      ) : null}

      {step === "review" ? (
        <ReviewScreen
          listing={listing}
          attentionFields={attentionFields}
          analyzing={analyzing}
          firstAttentionRef={firstAttentionRef}
          onUpdate={update}
          onCategoryChange={(categoryId) => {
            const match = EBAY_CATEGORY_OPTIONS.find((c) => c.id === categoryId);
            setListing((prev) => ({
              ...prev,
              categoryId,
              categoryName: match?.name || prev.categoryName,
              updatedAt: new Date().toISOString(),
            }));
          }}
          onConditionChange={(condition) => {
            const match = CONDITION_OPTIONS.find((c) => c.label === condition);
            setListing((prev) => ({
              ...prev,
              condition,
              conditionId: match?.conditionId ?? prev.conditionId,
            }));
          }}
          onImproveTitle={(instruction) =>
            void regenerateFieldWithAi("title", instruction)
          }
          onRegenerateDescription={() =>
            void regenerateFieldWithAi("description")
          }
          onContinue={() => setStep("export")}
          onBack={productId ? undefined : () => setStep("reveal")}
          onOpenMore={() => setMoreOpen(true)}
        />
      ) : null}

      {step === "export" ? (
        <ExportScreen
          listing={listing}
          productName={productLabel}
          photoCount={listing.images.length}
          exported={exported}
          exportDisabled={exportDisabled}
          exportDisabledReason={generateCsvDisabledReason}
          onExport={generateCsv}
          onPublishToDonBaraton={() => void publishToDonBaraton()}
          publishingDonBaraton={publishingDonBaraton}
          donBaratonPublished={donBaratonPublished}
          onBack={() => setStep("review")}
          onOpenMore={() => setMoreOpen(true)}
          onStartNew={startNewProduct}
          onSaveDraft={() => void saveDraft()}
        />
      ) : null}

      <MoreDetailsDialog
        open={moreOpen}
        onOpenChange={setMoreOpen}
        listing={listing}
        fieldConfidence={fieldConfidence}
        analyzing={analyzing}
        loadingProduct={loadingProduct}
        httpsImageUrls={httpsImageUrls}
        onUpdate={update}
        onRegenerateDescription={() =>
          void regenerateFieldWithAi("description")
        }
        setFieldConfidence={setFieldConfidence}
      />
    </WizardShell>
  );
}
