"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { amazonAsinFromListing, amazonListingUrl } from "@/lib/amazon/asin";
import { AmazonSourceLink } from "@/components/listing/amazon-source-link";
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
import {
  estimatePackageAndShipping,
  listingHasMeasuredPackage,
  seedPackageOnListing,
} from "@/lib/ebay/package-shipping";
import {
  hasCriticalErrors,
  criticalErrorLabels,
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
import { detectCatalogStore } from "@/lib/catalog/detect-store";
import { fetchHomeDepotOfficialGalleryInBrowser } from "@/lib/homedepot/browser-gallery";
import {
  brandingFromEbayStoreName,
  displayNameFromEbayUsername,
} from "@/lib/ebay/store-display-name";
import type { ConfidenceStatus } from "@/lib/ai/confidence-engine";
import {
  wizardStepToProgressIndex,
  type WizardStep,
} from "@/components/listing/wizard/types";
import { WizardShell } from "@/components/listing/wizard/wizard-shell";
import { PhotosScreen } from "@/components/listing/wizard/photos-screen";
import { UnderstandScreen } from "@/components/listing/wizard/understand-screen";
import { ReviewScreen } from "@/components/listing/wizard/review-screen";
import { ExportScreen } from "@/components/listing/wizard/export-screen";
import { MoreDetailsDialog } from "@/components/listing/wizard/more-details-dialog";
import { humanizeAnalysisFailure } from "@/lib/ai/analysis-failure-ui";
import { SkeletonBlock } from "@/components/ui/studio";

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
    amazonAsin: String(product.amazonAsin ?? product.amazon_asin ?? ""),
    amazonUrl: String(product.amazonUrl ?? product.amazon_url ?? ""),
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
    packageWeightLbs:
      product.packageWeightLbs === null || product.packageWeightLbs === undefined
        ? null
        : Number(product.packageWeightLbs),
    packageWeightOz:
      product.packageWeightOz === null || product.packageWeightOz === undefined
        ? null
        : Number(product.packageWeightOz),
    packageLengthIn:
      product.packageLengthIn === null || product.packageLengthIn === undefined
        ? null
        : Number(product.packageLengthIn),
    packageWidthIn:
      product.packageWidthIn === null || product.packageWidthIn === undefined
        ? null
        : Number(product.packageWidthIn),
    packageDepthIn:
      product.packageDepthIn === null || product.packageDepthIn === undefined
        ? null
        : Number(product.packageDepthIn),
    packageSource:
      String(product.packageSource || "auto") === "manual" ? "manual" : "auto",
    createdAt: String(product.createdAt ?? base.createdAt),
    updatedAt: String(product.updatedAt ?? base.updatedAt),
  };

  if (!mapped.amazonUrl) {
    mapped.amazonUrl = amazonListingUrl({
      amazonAsin: mapped.amazonAsin,
      sku: mapped.sku,
      description: mapped.descriptionHtml,
      itemSpecifics: mapped.itemSpecifics,
    });
  }

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
  const [catalogImporting, setCatalogImporting] = useState<
    false | "amazon" | "homedepot"
  >(false);
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
  const [publishingEbay, setPublishingEbay] = useState(false);
  const [ebayPublishMode, setEbayPublishMode] = useState<"draft" | "live" | null>(
    null,
  );
  const [ebayPublishError, setEbayPublishError] = useState<string | null>(null);
  const [ebayPublishResult, setEbayPublishResult] = useState<{
    mode: "draft" | "live";
    offerId?: string;
    listingId?: string | null;
    sellerHubHint?: string;
    imageCount?: number;
    storePath?: string;
  } | null>(null);
  const [ebayConnection, setEbayConnection] = useState<{
    connected: boolean;
    configured: boolean;
    ebayUsername: string | null;
    ebayStoreName: string | null;
  }>({
    connected: false,
    configured: false,
    ebayUsername: null,
    ebayStoreName: null,
  });
  const [amazonConnection, setAmazonConnection] = useState<{
    connected: boolean;
    configured: boolean;
  }>({ connected: false, configured: false });
  const [publishingAmazon, setPublishingAmazon] = useState(false);
  const [amazonPublishError, setAmazonPublishError] = useState<string | null>(
    null,
  );
  const [amazonPublishResult, setAmazonPublishResult] = useState<{
    asin?: string;
    sku?: string;
    sellerCentralUrl?: string;
    mode?: "attach" | "create";
  } | null>(null);
  const [isOwnerAccount, setIsOwnerAccount] = useState(false);
  const brandingDirtyRef = useRef(false);
  const ebayNameLockRef = useRef(false);
  const brandingSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const analyzeAbortRef = useRef(false);
  const firstAttentionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cached = localStorage.getItem("higlou-active-branding");
        if (cached) {
          const parsed = JSON.parse(cached) as StoreBranding;
        if (!cancelled && parsed?.storeName && !brandingDirtyRef.current && !ebayNameLockRef.current) {
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
        // Don't clobber in-progress typing if the user already edited.
        if (
          !cancelled &&
          body.branding &&
          !brandingDirtyRef.current &&
          !ebayNameLockRef.current
        ) {
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

  const handleStoreBrandingChange = (next: StoreBranding) => {
    brandingDirtyRef.current = true;
    const cloned = cloneStoreBranding(next);
    setStoreBranding(cloned);
    try {
      localStorage.setItem("higlou-active-branding", JSON.stringify(cloned));
    } catch {
      /* ignore */
    }
    // Debounce persist — saving every keystroke raced with empty→default
    // coercion on the API and made the store name field fight the user.
    if (brandingSaveTimerRef.current) {
      clearTimeout(brandingSaveTimerRef.current);
    }
    brandingSaveTimerRef.current = setTimeout(() => {
      const payload = cloneStoreBranding(cloned);
      if (!payload.storeName.trim()) return;
      void fetch("/api/settings/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {
        /* offline / auth — local cache still applies for this session */
      });
    }, 600);
  };

  useEffect(() => {
    return () => {
      if (brandingSaveTimerRef.current) {
        clearTimeout(brandingSaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const applyEbayStoreName = (name: string, username: string | null) => {
      if (!name.trim() || brandingDirtyRef.current) return;
      ebayNameLockRef.current = true;
      setEbayConnection((prev) => ({
        ...prev,
        ebayUsername: username ?? prev.ebayUsername,
        ebayStoreName: name,
      }));
      setStoreBranding((prev) => {
        const next = brandingFromEbayStoreName(prev, name);
        return next.storeName === prev.storeName ? prev : next;
      });
    };
    void (async () => {
      try {
        const res = await fetch("/api/ebay/connection");
        if (!res.ok) return;
        const body = (await res.json()) as {
          connection?: {
            connected?: boolean;
            configured?: boolean;
            ebayUsername?: string | null;
          };
        };
        if (cancelled || !body.connection) return;
        const username = body.connection.ebayUsername || null;
        setEbayConnection({
          connected: Boolean(body.connection.connected),
          configured: Boolean(body.connection.configured),
          ebayUsername: username,
          ebayStoreName: username
            ? displayNameFromEbayUsername(username)
            : null,
        });
        if (body.connection.connected && username) {
          applyEbayStoreName(displayNameFromEbayUsername(username), username);
        }
      } catch {
        /* optional */
      }
      if (cancelled) return;
      try {
        const amzRes = await fetch("/api/amazon/connection");
        if (amzRes.ok) {
          const amzBody = (await amzRes.json()) as {
            connection?: { connected?: boolean; configured?: boolean };
          };
          if (!cancelled && amzBody.connection) {
            setAmazonConnection({
              connected: Boolean(amzBody.connection.connected),
              configured: Boolean(amzBody.connection.configured),
            });
          }
        }
      } catch {
        /* optional */
      }
      if (cancelled) return;
      try {
        const meRes = await fetch("/api/me");
        if (meRes.ok) {
          const me = (await meRes.json()) as { owner?: boolean };
          if (!cancelled) setIsOwnerAccount(Boolean(me.owner));
        }
      } catch {
        /* optional */
      }
      if (cancelled) return;
      try {
        const res = await fetch("/api/ebay/store-name");
        if (!res.ok) return;
        const body = (await res.json()) as {
          storeName?: string | null;
          username?: string | null;
        };
        if (!cancelled && body.storeName) {
          applyEbayStoreName(body.storeName, body.username || null);
        }
      } catch {
        /* username already applied */
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
    () =>
      validateListing(
        listing,
        storeBranding.storeName,
        storeBranding.storeNameDisplay,
      ),
    [listing, storeBranding.storeName, storeBranding.storeNameDisplay],
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

    const sku = /^(AMZ|HD)-/i.test(prev.sku)
      ? prev.sku
      : generateSku({
          brand,
          model: model || analysis.collection,
          size,
          color: colors[0],
        });

    const mappedSpecifics =
      analysis.itemSpecifics.length > 0
        ? analysis.itemSpecifics.map((field) => ({
            key: field.key.startsWith("C:") ? field.key : `C:${field.key}`,
            label: field.label,
            value: field.value,
            confidence: field.confidence,
          }))
        : prev.itemSpecifics;
    const importedAsin = /^HD-/i.test(prev.sku)
      ? (/^[A-Z0-9]{10}$/i.test(String(prev.amazonAsin || "").trim())
          ? String(prev.amazonAsin).trim().toUpperCase()
          : "")
      : amazonAsinFromListing(prev);
    const itemSpecifics =
      importedAsin &&
      !mappedSpecifics.some((field) =>
        /^(asin|amazon\s*asin)$/i.test(String(field.label || "").replace(/^C:/, "")),
      )
        ? [
            { key: "C:ASIN", label: "ASIN", value: importedAsin },
            ...mappedSpecifics,
          ]
        : mappedSpecifics;

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
      dimensionsText: [
        ...(analysis.detectedText || []),
        size,
        title,
        productType,
      ].join(" "),
    });

    const nextBase: ProductListing = {
      ...prev,
      title: title.slice(0, 80),
      brand,
      collection: analysis.collection || prev.collection,
      model,
      mpn: analysis.mpn || prev.mpn,
      upc: analysis.upc || prev.upc,
      sku,
      amazonAsin: importedAsin || prev.amazonAsin || "",
      amazonUrl: prev.amazonUrl || "",
      productType,
      type: productType,
      categoryId: category.categoryId,
      categoryName: category.categoryName,
      itemLocation: prev.itemLocation || DEFAULT_VALUES.itemLocation,
      postalCode: prev.postalCode || DEFAULT_VALUES.postalCode,
      country: prev.country || DEFAULT_VALUES.country,
      shippingService: shipping.shippingService,
      shippingCost: shipping.shippingCost,
      freeShipping: false,
      condition: analysis.condition || prev.condition,
      conditionId:
      analysis.conditionId || prev.conditionId || "NEW",
      conditionDescription:
        (analysis as { conditionNotes?: string }).conditionNotes ||
        prev.conditionDescription,
      price: /^(AMZ|HD)-/i.test(prev.sku)
        ? prev.price ?? analysis.price
        : analysis.price ?? prev.price,
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

    // Auto package from AI label/vision + OCR + category heuristics.
    // Only keep seller edits when they explicitly marked Measured (manual).
    const next =
      prev.packageSource === "manual"
        ? {
            ...nextBase,
            packageWeightLbs: prev.packageWeightLbs,
            packageWeightOz: prev.packageWeightOz,
            packageLengthIn: prev.packageLengthIn,
            packageWidthIn: prev.packageWidthIn,
            packageDepthIn: prev.packageDepthIn,
            packageSource: "manual" as const,
            shippingService: prev.shippingService || shipping.shippingService,
            shippingCost: prev.shippingCost ?? shipping.shippingCost,
          }
        : seedPackageOnListing(
            {
              ...nextBase,
              dimensionsText: [
                ...(analysis.detectedText || []),
                size,
                title,
                productType,
              ].join(" "),
              aiPackageWeightLbs: analysis.packageWeightLbs,
              aiPackageWeightOz: analysis.packageWeightOz,
              aiPackageLengthIn: analysis.packageLengthIn,
              aiPackageWidthIn: analysis.packageWidthIn,
              aiPackageDepthIn: analysis.packageDepthIn,
            },
            true,
          );

    return withFreshDescription(next, storeBranding);
  };

  const analyzeProduct = async (options?: {
    forceImproveOcr?: boolean;
    forceDeepAnalysis?: boolean;
    forceFreshAnalysis?: boolean;
    images?: ProductImage[];
    imageUrls?: string[];
    baseListing?: ProductListing;
    hints?: {
      brand?: string;
      model?: string;
      upc?: string;
      notes?: string;
      condition?: string;
    };
  }) => {
    const current = options?.baseListing ?? listing;
    const images = options?.images ?? current.images;
    const imageUrls = (
      options?.imageUrls ??
      images.map((img) => img.url).filter((url) => /^https:\/\//i.test(url))
    );
    if (!images.length) {
      toast.error("Upload at least one product image first");
      return;
    }
    if (!imageUrls.length) {
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
          imageUrls,
          forceImproveOcr: Boolean(options?.forceImproveOcr),
          forceDeepAnalysis: Boolean(options?.forceDeepAnalysis),
          forceFreshAnalysis: Boolean(options?.forceFreshAnalysis),
          analysisTier: options?.forceDeepAnalysis ? "advanced" : "economy",
          productId: /^[0-9a-f-]{36}$/i.test(current.id) ? current.id : undefined,
          providers: {
            openaiEnabled: aiProviders.openaiEnabled,
            googleVisionEnabled: aiProviders.googleVisionEnabled,
            barcodeEnabled: aiProviders.barcodeEnabled,
            googleVisionMode: aiProviders.googleVisionMode,
            googleVisionMaxImages: aiProviders.googleVisionMaxImages,
            documentTextFallback: aiProviders.documentTextFallback,
          },
          imageMeta: images
            .filter((img) => /^https:\/\//i.test(img.url))
            .map((img) => ({
              id: img.id,
              url: img.url,
              fileName: img.fileName,
              isPrimary: img.isPrimary,
            })),
          productHints: {
            brand: options?.hints?.brand || current.brand,
            model: options?.hints?.model || current.model,
            upc: options?.hints?.upc || current.upc,
            categoryId: current.categoryId,
            categoryName: current.categoryName,
            condition: options?.hints?.condition || current.condition,
            size: current.size,
            notes: options?.hints?.notes,
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
      const analyzed = applyAnalysisResult(body.analysis!, current);
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

  const importFromCatalog = async (url: string): Promise<boolean> => {
    if (catalogImporting || analyzing) return false;
    const store = detectCatalogStore(url);
    if (!store) {
      const message = "Paste an Amazon or Home Depot product link.";
      setAnalysisError(message);
      toast.error(message);
      return false;
    }

    const storeLabel = store === "amazon" ? "Amazon" : "Home Depot";
    const endpoint =
      store === "amazon" ? "/api/amazon/import" : "/api/homedepot/import";

    setCatalogImporting(store);
    setAnalysisError(null);
    try {
      const html =
        store === "homedepot"
          ? await fetchHomeDepotOfficialGalleryInBrowser(url).catch(() => "")
          : "";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, ...(html ? { html } : {}) }),
      });
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        title?: string;
        brand?: string;
        model?: string;
        price?: number | null;
        upc?: string;
        features?: string[];
        sku?: string;
        asin?: string;
        amazonUrl?: string;
        images?: ProductImage[];
      } | null;
      if (!response.ok || !body?.ok || !body.images?.length) {
        const message = body?.error || `${storeLabel} import failed`;
        setAnalysisError(message);
        toast.error(message);
        return false;
      }

      const newCondition = "New";
      const match = CONDITION_OPTIONS.find((c) => c.label === newCondition);
      const fromHomeDepot = store === "homedepot";
      const importedAsin = fromHomeDepot
        ? ""
        : String(body.asin || "").trim().toUpperCase();
      const withoutAsin = listing.itemSpecifics.filter(
        (field) => !/^(asin|amazon\s*asin)$/i.test(field.label.replace(/^C:/, "")),
      );
      const seeded: ProductListing = {
        ...listing,
        title: (body.title || listing.title).slice(0, 80),
        brand: body.brand || listing.brand,
        model: body.model || listing.model,
        price: body.price ?? listing.price,
        upc: fromHomeDepot ? body.upc || "" : body.upc || listing.upc,
        sku: body.sku || listing.sku,
        amazonAsin: fromHomeDepot ? "" : importedAsin || listing.amazonAsin,
        amazonUrl: fromHomeDepot
          ? ""
          : String(body.amazonUrl || "").trim() ||
            listing.amazonUrl ||
            (importedAsin ? `https://www.amazon.com/dp/${importedAsin}` : ""),
        features: body.features?.length ? body.features : listing.features,
        images: body.images,
        descriptionHtml: fromHomeDepot ? "" : listing.descriptionHtml,
        descriptionSummary: fromHomeDepot ? "" : listing.descriptionSummary,
        itemSpecifics: importedAsin
          ? [
              {
                key: "C:ASIN",
                label: "ASIN",
                value: importedAsin,
              },
              ...withoutAsin,
            ]
          : fromHomeDepot
            ? withoutAsin
            : listing.itemSpecifics,
        condition: newCondition,
        conditionId: match?.conditionId ?? listing.conditionId,
        status: "Uploaded",
        updatedAt: new Date().toISOString(),
      };
      setListing(seeded);
      setStep("photos");
      toast.success(
        `${storeLabel} photos loaded — delete, add, or drag to reorder, then Continue.`,
      );
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `${storeLabel} import failed`;
      setAnalysisError(message);
      toast.error(message);
      return false;
    } finally {
      setCatalogImporting(false);
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
        amazonAsin: amazonAsinFromListing(
          /^HD-/i.test(current.sku)
            ? { asin: current.amazonAsin, sku: current.sku }
            : {
                asin: current.amazonAsin,
                sku: current.sku,
                itemSpecifics: current.itemSpecifics,
                description: current.descriptionHtml,
              },
        ),
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
        packageWeightLbs: current.packageWeightLbs,
        packageWeightOz: current.packageWeightOz,
        packageLengthIn: current.packageLengthIn,
        packageWidthIn: current.packageWidthIn,
        packageDepthIn: current.packageDepthIn,
        packageSource: current.packageSource || "auto",
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

    const items = validateListing(
      exportListing,
      storeBranding.storeName,
      storeBranding.storeNameDisplay,
    );
    // Category can be healed server-side — don't block the export UX on it.
    const blocking = items.filter(
      (item) =>
        !item.ok &&
        item.severity === "critical" &&
        item.id !== "category",
    );
    if (blocking.length > 0) {
      toast.error("Fix critical validation errors before generating CSV", {
        description: criticalErrorLabels(blocking).join(" · "),
      });
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
          categoryId: exportListing.categoryId || "117503",
          title: exportListing.title,
          upc: exportListing.upc,
          price: exportListing.price,
          quantity: exportListing.quantity,
          itemPhotoUrls: httpsImageUrls.length
            ? httpsImageUrls
            : orderedImageUrls.filter((url) => /^https:\/\//i.test(url)),
          conditionId: exportListing.conditionId,
          descriptionHtml: exportListing.descriptionHtml,
          format: exportListing.listingFormat,
          brand: exportListing.brand,
          model: exportListing.model || exportListing.collection,
          size: exportListing.size,
          productType: exportListing.productType || exportListing.type,
          categoryName: exportListing.categoryName,
          colors: (exportListing.colors || []).map(String).filter(Boolean),
          materials: (exportListing.materials || []).map(String).filter(Boolean),
          features: (exportListing.features || []).map(String).filter(Boolean),
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
          packageWeightLbs: exportListing.packageWeightLbs ?? undefined,
          packageWeightOz: exportListing.packageWeightOz ?? undefined,
          packageLengthIn: exportListing.packageLengthIn ?? undefined,
          packageWidthIn: exportListing.packageWidthIn ?? undefined,
          packageDepthIn: exportListing.packageDepthIn ?? undefined,
          packageSource: exportListing.packageSource || "auto",
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

    const items = validateListing(
      publishListing,
      storeBranding.storeName,
      storeBranding.storeNameDisplay,
    );
    const blocking = items.filter(
      (item) =>
        !item.ok &&
        item.severity === "critical" &&
        item.id !== "category",
    );
    if (blocking.length > 0) {
      toast.error("Fix critical validation errors before publishing", {
        description: criticalErrorLabels(blocking).join(" · "),
      });
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
          categoryId: publishListing.categoryId || "117503",
          title: publishListing.title,
          upc: publishListing.upc,
          price: publishListing.price,
          quantity: publishListing.quantity,
          itemPhotoUrls: httpsImageUrls.length
            ? httpsImageUrls
            : orderedImageUrls.filter((url) => /^https:\/\//i.test(url)),
          conditionId: publishListing.conditionId,
          descriptionHtml: publishListing.descriptionHtml,
          format: publishListing.listingFormat,
          brand: publishListing.brand,
          model: publishListing.model || publishListing.collection,
          size: publishListing.size,
          productType: publishListing.productType || publishListing.type,
          categoryName:
            publishListing.categoryName || "Lamps, Lighting & Ceiling Fans",
          colors: (publishListing.colors || []).map(String).filter(Boolean),
          materials: (publishListing.materials || [])
            .map(String)
            .filter(Boolean),
          features: (publishListing.features || []).map(String).filter(Boolean),
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
          packageWeightLbs: publishListing.packageWeightLbs ?? undefined,
          packageWeightOz: publishListing.packageWeightOz ?? undefined,
          packageLengthIn: publishListing.packageLengthIn ?? undefined,
          packageWidthIn: publishListing.packageWidthIn ?? undefined,
          packageDepthIn: publishListing.packageDepthIn ?? undefined,
          packageSource: publishListing.packageSource || "auto",
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

  const publishToEbay = async (mode: "draft" | "live") => {
    const fresh = withFreshDescription(listing, storeBranding);
    if (fresh.descriptionHtml !== listing.descriptionHtml) {
      setListing((prev) => ({
        ...prev,
        descriptionSummary: fresh.descriptionSummary,
        descriptionHtml: fresh.descriptionHtml,
        updatedAt: new Date().toISOString(),
      }));
    }

    // Ensure auto package exists before publish (AI/heuristic) if still empty.
    const withPackage =
      fresh.packageSource === "manual"
        ? fresh
        : seedPackageOnListing(
            fresh,
            !listingHasMeasuredPackage(fresh),
          );

    if (withPackage !== fresh) {
      setListing((prev) => ({ ...prev, ...withPackage }));
    }

    setEbayPublishError(null);
    setEbayPublishResult(null);
    setEbayPublishMode(mode);
    setPublishingEbay(true);
    try {
      await persistDraft({ quiet: true, draft: withPackage });
      const productId =
        /^[0-9a-f-]{36}$/i.test(withPackage.id) ? withPackage.id : undefined;
      const response = await fetch("/api/ebay/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          mode,
          listing: {
            sku: withPackage.sku,
            title: withPackage.title,
            descriptionHtml: withPackage.descriptionHtml,
            descriptionSummary: withPackage.descriptionSummary,
            categoryId: withPackage.categoryId,
            categoryName: withPackage.categoryName,
            brand: withPackage.brand,
            model: withPackage.model,
            mpn: withPackage.mpn,
            upc: withPackage.upc,
            size: withPackage.size,
            productType: withPackage.productType || withPackage.type,
            type: withPackage.type,
            condition: withPackage.condition,
            conditionId: withPackage.conditionId,
            price: withPackage.price,
            quantity: withPackage.quantity,
            colors: withPackage.colors,
            materials: withPackage.materials,
            features: withPackage.features,
            itemSpecifics: withPackage.itemSpecifics.map((f) => ({
              key: f.key,
              value: f.value,
              label: f.label,
            })),
            images: withPackage.images
              .filter((img) => /^https:\/\//i.test(img.url))
              .map((img) => ({ url: img.url })),
            shippingPolicyId: withPackage.shippingPolicyId,
            returnPolicyId: withPackage.returnPolicyId,
            paymentPolicyId: withPackage.paymentPolicyId,
            packageWeightLbs: withPackage.packageWeightLbs,
            packageWeightOz: withPackage.packageWeightOz,
            packageLengthIn: withPackage.packageLengthIn,
            packageWidthIn: withPackage.packageWidthIn,
            packageDepthIn: withPackage.packageDepthIn,
            packageSource: withPackage.packageSource || "auto",
          },
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        code?: string;
        offerId?: string;
        listingId?: string | null;
        sellerHubHint?: string;
        imageCount?: number;
        storeOrganize?: {
          storePath?: string;
          storePath2?: string | null;
          createdFolder?: boolean;
        } | null;
        storeOrganizeWarning?: string | null;
      } | null;
      if (!response.ok) {
        if (body?.code === "EBAY_NOT_CONNECTED") {
          setEbayPublishError("Connect your eBay store first");
          toast.error("Connect your eBay store first", {
            description: "Settings → eBay store connection",
            action: {
              label: "Open Settings",
              onClick: () => {
                window.location.href = "/settings#ebay-store";
              },
            },
          });
          return;
        }
        throw new Error(body?.error || "eBay publish failed");
      }
      const photoBit =
        typeof body?.imageCount === "number"
          ? ` · ${body.imageCount} photo${body.imageCount === 1 ? "" : "s"} on eBay EPS`
          : "";
      const folderBit = body?.storeOrganize?.storePath
        ? ` · Store ${body.storeOrganize.storePath}${body.storeOrganize.storePath2 ? ` + ${body.storeOrganize.storePath2}` : ""}${body.storeOrganize.createdFolder ? " (created)" : ""}`
        : "";
      toast.success(
        mode === "live" ? "Published to eBay" : "eBay draft offer created",
        {
          description:
            (body?.sellerHubHint ||
              (body?.listingId
                ? `Listing ${body.listingId}`
                : `Offer ${body?.offerId || ""}`)) +
            photoBit +
            folderBit,
        },
      );
      setEbayPublishResult({
        mode,
        offerId: body?.offerId,
        listingId: body?.listingId || null,
        sellerHubHint: body?.sellerHubHint,
        imageCount: body?.imageCount,
        storePath: body?.storeOrganize?.storePath,
      });
      if (body?.storeOrganizeWarning) {
        toast.warning("Published, but Store folder failed", {
          description: body.storeOrganizeWarning,
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "eBay publish failed";
      setEbayPublishError(message);
      toast.error(message);
    } finally {
      setPublishingEbay(false);
    }
  };

  const publishToAmazon = async () => {
    const fresh = withFreshDescription(listing, storeBranding);
    if (fresh.price == null || Number(fresh.price) <= 0) {
      const message = "Set a price before publishing to Amazon.";
      setAmazonPublishError(message);
      toast.error(message);
      return;
    }
    setAmazonPublishError(null);
    setAmazonPublishResult(null);
    setPublishingAmazon(true);
    try {
      await persistDraft({ quiet: true, draft: fresh });
      const productId = /^[0-9a-f-]{36}$/i.test(fresh.id) ? fresh.id : undefined;
      const response = await fetch("/api/amazon/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          listing: {
            sku: fresh.sku,
            title: fresh.title,
            upc: fresh.upc,
            asin: amazonAsinFromListing(
              /^HD-/i.test(fresh.sku)
                ? { asin: fresh.amazonAsin, sku: fresh.sku }
                : {
                    ...fresh,
                    asin: fresh.amazonAsin,
                    description: fresh.descriptionHtml,
                  },
            ),
            brand: fresh.brand,
            model: fresh.model || fresh.collection,
            mpn: fresh.mpn,
            price: fresh.price,
            quantity: fresh.quantity,
            condition: fresh.condition,
            conditionId: fresh.conditionId,
            handlingTime: fresh.handlingTime || DEFAULT_VALUES.handlingTime,
            description: fresh.descriptionSummary || fresh.descriptionHtml,
            features: fresh.features,
            images: fresh.images
              .map((image) => image.url)
              .filter((url) => /^https:\/\//i.test(url)),
            color: fresh.colors[0] || "",
            material: fresh.materials[0] || "",
            countryOfManufacture: fresh.countryOfManufacture || fresh.country,
            categoryName: fresh.categoryName,
            packageLengthIn: fresh.packageLengthIn ?? undefined,
            packageWidthIn: fresh.packageWidthIn ?? undefined,
            packageDepthIn: fresh.packageDepthIn ?? undefined,
            itemSpecifics: fresh.itemSpecifics.map((field) => ({
              label: field.label,
              key: field.key,
              value: field.value,
            })),
          },
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        code?: string;
        asin?: string;
        sku?: string;
        sellerCentralUrl?: string;
        mode?: "attach" | "create";
      } | null;
      if (!response.ok) {
        if (body?.code === "AMAZON_NOT_CONNECTED") {
          setAmazonPublishError("Connect Amazon in Settings first");
          toast.error("Connect Amazon in Settings first", {
            action: {
              label: "Open Settings",
              onClick: () => {
                window.location.href = "/settings#amazon-store";
              },
            },
          });
          return;
        }
        throw new Error(body?.error || "Amazon publish failed");
      }
      setAmazonPublishResult({
        asin: body?.asin,
        sku: body?.sku,
        sellerCentralUrl: body?.sellerCentralUrl,
        mode: body?.mode,
      });
      toast.success(
        body?.mode === "create"
          ? "Created a new Amazon product"
          : "Published complete Amazon listing",
        {
          description: body?.asin
            ? body.mode === "create"
              ? `New catalog product ${body.asin}`
              : `Attached to existing ASIN ${body.asin} with photos, price, and shipping`
            : `SKU ${body?.sku || fresh.sku}`,
        },
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Amazon publish failed";
      setAmazonPublishError(message);
      toast.error(message);
    } finally {
      setPublishingAmazon(false);
    }
  };

  const startNewProduct = () => {
    setListing(createEmptyListing());
    setStep("photos");
    setAnalysisError(null);
    setCostEstimate(null);
    setFieldConfidence({});
    setMoreOpen(false);
    setPublishingEbay(false);
    setEbayPublishMode(null);
    setEbayPublishError(null);
    setEbayPublishResult(null);
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
      onSelectStep={(index) => {
        const current = wizardStepToProgressIndex(step);
        if (index >= current) return;
        if (index === 0) setStep("photos");
        if (index === 1) setStep("reveal");
        if (index === 2) setStep("review");
      }}
      headerActions={
        <>
          <AmazonSourceLink listing={listing} className="shrink-0" />
          {showChrome ? (
            <button
              type="button"
              onClick={() => void saveDraft()}
              disabled={loadingProduct}
              className="hidden h-9 items-center rounded-full border border-border bg-surface px-4 text-sm font-medium sm:inline-flex"
            >
              Save Draft
            </button>
          ) : null}
        </>
      }
    >
      {loadingProduct ? (
        <div className="mx-auto max-w-[720px] space-y-4 px-4 py-6 sm:px-0">
          <SkeletonBlock className="h-8 w-48" />
          <SkeletonBlock className="min-h-[320px] rounded-3xl" />
          <div className="grid gap-3 sm:grid-cols-2">
            <SkeletonBlock className="h-24 rounded-2xl" />
            <SkeletonBlock className="h-24 rounded-2xl" />
          </div>
        </div>
      ) : null}

      {!loadingProduct && step === "photos" ? (
        <PhotosScreen
          images={listing.images}
          productId={listing.id}
          price={listing.price}
          condition={listing.condition}
          storeName={storeBranding.storeName}
          uploadingPending={
            Boolean(catalogImporting) ||
            (listing.images.length > 0 && !httpsImageUrls.length)
          }
          canContinue={
            httpsImageUrls.length > 0 && !analyzing && !catalogImporting
          }
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
          onContinue={() => {
            void analyzeProduct();
          }}
          onCatalogImport={importFromCatalog}
          catalogImporting={catalogImporting}
          sourceListing={listing}
        />
      ) : null}

      {!loadingProduct && (step === "analyzing" || step === "reveal") ? (
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

      {!loadingProduct && step === "review" ? (
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
          storeBranding={storeBranding}
          onStoreBrandingChange={handleStoreBrandingChange}
          onImagesChange={(images) => update("images", images)}
          productId={listing.id}
        />
      ) : null}

      {!loadingProduct && step === "export" ? (
        <ExportScreen
          listing={listing}
          productName={productLabel}
          photoCount={listing.images.length}
          exported={exported}
          exportDisabled={exportDisabled}
          exportDisabledReason={generateCsvDisabledReason}
          onExport={generateCsv}
          onPublishToDonBaraton={
            isOwnerAccount ? () => void publishToDonBaraton() : undefined
          }
          publishingDonBaraton={publishingDonBaraton}
          donBaratonPublished={donBaratonPublished}
          onBack={() => setStep("review")}
          onOpenMore={() => setMoreOpen(true)}
          onStartNew={startNewProduct}
          onSaveDraft={() => void saveDraft()}
          storeBranding={storeBranding}
          onStoreBrandingChange={handleStoreBrandingChange}
          ebayConnected={ebayConnection.connected}
          ebayUsername={ebayConnection.ebayUsername}
          ebayStoreName={ebayConnection.ebayStoreName}
          ebayConfigured={ebayConnection.configured}
          onPublishToEbay={(mode) => void publishToEbay(mode)}
          publishingEbay={publishingEbay}
          ebayPublishMode={ebayPublishMode}
          ebayPublishResult={ebayPublishResult}
          ebayPublishError={ebayPublishError}
          onRetryEbayPublish={() => {
            if (ebayPublishMode) void publishToEbay(ebayPublishMode);
          }}
          onDismissEbayPublish={() => {
            setEbayPublishError(null);
            setEbayPublishResult(null);
            setEbayPublishMode(null);
          }}
          amazonConnected={amazonConnection.connected}
          amazonConfigured={amazonConnection.configured}
          onPublishToAmazon={() => void publishToAmazon()}
          publishingAmazon={publishingAmazon}
          amazonPublishError={amazonPublishError}
          amazonPublishResult={amazonPublishResult}
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
        storeBranding={storeBranding}
        onStoreBrandingChange={handleStoreBrandingChange}
      />
    </WizardShell>
  );
}
