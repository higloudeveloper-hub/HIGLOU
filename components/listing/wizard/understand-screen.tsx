"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleUser,
  Images,
  Layers,
  Loader2,
  MapPin,
  PackageCheck,
  Palette,
  Ruler,
  Sparkles,
  Tag,
  AlertTriangle,
} from "lucide-react";
import { StickyActionBar } from "@/components/listing/wizard/sticky-action-bar";
import type { ProductImage, ProductListing } from "@/types/product";
import type {
  AnalysisPipelineStages,
  AnalysisStageStatus,
} from "@/types/analysis-stages";
import {
  isPhotoInfrastructureFailure,
  isRecognitionFailure,
} from "@/lib/ai/analysis-failure-ui";
import { cn } from "@/lib/utils";
import type { ConfidenceStatus } from "@/lib/ai/confidence-engine";
import { LiveDot } from "@/components/ui/studio";

const STAGES = [
  { key: "understanding", label: "Understanding product", pipe: "recognition" },
  { key: "details", label: "Product details", pipe: "extraction" },
  { key: "features", label: "Key features", pipe: "extraction" },
  { key: "category", label: "Category match", pipe: "classification" },
  { key: "ready", label: "Ready to build", pipe: "listing" },
] as const;

function statusLabel(
  state: "done" | "active" | "todo" | "failed" | "soft",
): string {
  if (state === "done") return "Completed";
  if (state === "active") return "In progress";
  if (state === "failed") return "Needs attention";
  if (state === "soft") return "Partial";
  return "Waiting";
}

function pipeStatus(
  stages: AnalysisPipelineStages | null | undefined,
  key: (typeof STAGES)[number]["pipe"],
): AnalysisStageStatus | undefined {
  return stages?.[key]?.status;
}

export function UnderstandScreen({
  mode,
  listing,
  images,
  activeIndex,
  analysisError,
  analysisErrorCode,
  stages,
  materialConfidence,
  onCancel,
  onRetry,
  onContinue,
}: {
  /** analyzing = in progress; reveal = analysis done */
  mode: "analyzing" | "reveal";
  listing: ProductListing;
  images: ProductImage[];
  activeIndex: number;
  analysisError?: string | null;
  analysisErrorCode?: string | null;
  stages?: AnalysisPipelineStages | null;
  materialConfidence?: {
    status: ConfidenceStatus;
    sources: string[];
    confidence: number;
  };
  onCancel?: () => void;
  onRetry?: () => void;
  onContinue: () => void;
}) {
  const complete = mode === "reveal";
  const hasError = Boolean(analysisError);
  const isPhotoQualityError = isPhotoInfrastructureFailure(analysisErrorCode);
  const isIdentityError = isRecognitionFailure(analysisErrorCode);
  const recognitionOk =
    !isIdentityError &&
    (stages?.recognition.status === "success" ||
      stages?.recognition.status === "partial" ||
      Boolean(listing.brand?.trim() || listing.productType?.trim()));

  const stage = useMemo(() => {
    if (hasError) {
      // Never fake "Understanding completed" while the run failed.
      return 0;
    }
    if (complete) return STAGES.length - 1;
    if (stages) {
      const order: Array<(typeof STAGES)[number]["pipe"]> = [
        "recognition",
        "extraction",
        "extraction",
        "classification",
        "listing",
      ];
      let idx = 0;
      for (let i = 0; i < order.length; i++) {
        const st = pipeStatus(stages, order[i]);
        if (st === "success" || st === "partial" || st === "missing") {
          idx = Math.min(i + 1, STAGES.length - 1);
        } else if (st === "running") {
          return i;
        } else {
          break;
        }
      }
      return idx;
    }
    return Math.min(
      STAGES.length - 1,
      Math.floor((activeIndex / 4) * (STAGES.length - 1)),
    );
  }, [hasError, complete, stages, activeIndex]);

  const findings = useMemo(() => {
    const colors = listing.colors?.filter(Boolean).join(" / ") || "—";
    const materialValues = listing.materials?.filter(Boolean) ?? [];
    const materials =
      materialValues.length > 0
        ? materialValues.join(", ")
        : "—";
    const materialEstimated =
      materialValues.length > 0 && materialConfidence?.status === "review";
    const dims =
      stages?.recognition.size?.trim() || listing.size?.trim() || "—";
    const product =
      [
        stages?.recognition.brand || listing.brand,
        listing.model || listing.collection,
        stages?.recognition.productType || listing.productType,
      ]
        .filter(Boolean)
        .join(" ") ||
      listing.title ||
      "Product";
    return [
      { icon: MapPin, label: "Product identified", value: product },
      {
        icon: CircleUser,
        label: "Category",
        value:
          stages?.classification.categoryName ||
          listing.categoryName ||
          (complete ? "—" : "Matching…"),
      },
      {
        icon: Tag,
        label: "Brand detected",
        value:
          (stages?.recognition.brand || listing.brand).trim() ||
          "Not on labels",
      },
      { icon: Palette, label: "Color", value: colors },
      {
        icon: Layers,
        label: "Material",
        value: materials,
        hint: materialEstimated ? "Estimated from photos — review" : undefined,
      },
      {
        icon: Sparkles,
        label: "Style",
        value: listing.pattern?.trim() || listing.type || "—",
      },
      { icon: Ruler, label: "Size / dimensions", value: dims },
      {
        icon: PackageCheck,
        label: "Packaging detected",
        value:
          listing.setIncludes?.length || listing.features?.length
            ? "Details found in photos"
            : images.length > 1
              ? "Reviewing multiple angles"
              : "From your uploads",
      },
    ] as const;
  }, [listing, images.length, stages, complete, materialConfidence]);

  const secondaryLines = useMemo(() => {
    if (!stages || hasError) return [] as string[];
    const lines: string[] = [];
    if (stages.extraction.ocr === "running") lines.push("Reading label…");
    else if (stages.extraction.ocr === "partial")
      lines.push("Label partially read");
    else if (stages.extraction.ocr === "missing")
      lines.push("Label reading limited");

    if (stages.extraction.barcode === "running") lines.push("Searching UPC…");
    else if (stages.extraction.barcode === "missing")
      lines.push("UPC not detected");
    else if (stages.extraction.barcode === "success")
      lines.push("UPC detected");

    if (stages.classification.status === "running")
      lines.push("Matching eBay category…");
    else if (
      stages.classification.status === "partial" &&
      !stages.classification.categoryName
    )
      lines.push("Finding best eBay category…");

    if (stages.listing.status === "running") lines.push("Building listing…");
    return lines;
  }, [stages, hasError]);

  const [revealed, setRevealed] = useState(complete ? findings.length : 0);
  const [progress, setProgress] = useState(complete ? 100 : 8);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (complete || hasError) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [complete, hasError]);

  useEffect(() => {
    if (hasError) {
      setProgress(100);
      return;
    }
    if (complete) {
      setRevealed(findings.length);
      setProgress(100);
      return;
    }
    const t = setInterval(
      () => setProgress((p) => (p >= 92 ? 92 : p + 2)),
      120,
    );
    return () => clearInterval(t);
  }, [complete, findings.length, hasError]);

  useEffect(() => {
    if (complete || hasError) return;
    const target = Math.min(
      findings.length,
      Math.floor(((stage + 1) / STAGES.length) * findings.length),
    );
    if (revealed >= target) return;
    const t = setInterval(
      () => setRevealed((r) => (r >= target ? r : r + 1)),
      400,
    );
    return () => clearInterval(t);
  }, [complete, hasError, stage, findings.length, revealed]);

  const heroSrc =
    images[0]?.previewUrl || images[0]?.url || "/favicon.ico";
  const allDone = complete || revealed >= findings.length;

  const recognitionConfidence = stages?.recognition.confidence;
  const confidencePct =
    typeof recognitionConfidence === "number"
      ? Math.round(recognitionConfidence * 100)
      : null;

  return (
    <div className="pb-28">
      <div className="mx-auto max-w-[720px] animate-in fade-in slide-in-from-bottom-2 px-4 py-6 duration-500 sm:px-0">
        <ol className="mb-5 flex gap-1.5 overflow-x-auto pb-1">
          {STAGES.map((s, i) => {
            const pipe = pipeStatus(stages, s.pipe);
            let state: "done" | "active" | "todo" | "failed" | "soft" =
              i < stage ? "done" : i === stage ? "active" : "todo";
            if (hasError && i === 0) state = "failed";
            if (hasError && i > 0) state = "todo";
            if (!hasError && complete) state = "done";
            if (
              !hasError &&
              stages &&
              (pipe === "partial" || pipe === "missing") &&
              i <= stage
            ) {
              state = "soft";
            }
            return (
              <li
                key={s.key}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                  state === "active" &&
                    "border-brand bg-brand-soft text-foreground",
                  state === "done" &&
                    "border-transparent bg-foreground text-background",
                  state === "failed" &&
                    "border-destructive/40 bg-destructive/10 text-destructive",
                  state === "soft" &&
                    "border-amber-300 bg-amber-50 text-amber-900",
                  state === "todo" &&
                    "border-border bg-surface text-muted-foreground",
                )}
              >
                {state === "active" ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : state === "done" ? (
                  <Check className="size-3" strokeWidth={3} />
                ) : null}
                {s.label}
                <span className="sr-only">{statusLabel(state)}</span>
              </li>
            );
          })}
        </ol>

        <section className="overflow-hidden rounded-3xl border border-border/80 bg-surface shadow-[0_24px_60px_-48px_rgba(20,16,8,0.45)]">
          <div className="relative bg-muted/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heroSrc}
              alt="Product"
              className="h-[280px] w-full object-contain sm:h-[360px]"
            />
            {!complete && !hasError ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-brand/25 to-transparent [animation:higlou-scan_2.4s_ease-in-out_infinite]"
              />
            ) : null}
            <div className="absolute right-3 bottom-3 left-3 flex items-center justify-between rounded-xl bg-background/90 px-3 py-2 text-[12px] font-medium backdrop-blur-md">
              <span className="inline-flex items-center gap-2">
                {!complete && !hasError ? <LiveDot /> : null}
                {hasError
                  ? "Paused"
                  : complete
                    ? "Draft ready"
                    : STAGES[stage]?.label || "Reading photos"}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {complete || hasError
                  ? `${progress}%`
                  : `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")} · ${progress}%`}
              </span>
            </div>
          </div>
          {images.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto border-t border-border/60 px-4 py-3">
              {images.slice(0, 8).map((img, i) => (
                <div
                  key={img.id || i}
                  className="size-12 shrink-0 overflow-hidden rounded-lg border border-border bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.previewUrl || img.url}
                    alt=""
                    className="size-full object-cover"
                  />
                </div>
              ))}
            </div>
          ) : null}
          <div className="px-5 pt-4 pb-2">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <motion.div
                className={cn(
                  "h-full",
                  hasError ? "bg-destructive/70" : "bg-brand-gradient",
                )}
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ ease: "easeOut" }}
              />
            </div>
            <p className="mt-2 text-[12px] text-muted-foreground">
              {hasError
                ? "Only this step is blocked. Fix it, then continue."
                : complete
                  ? "Ready to edit the draft."
                  : secondaryLines[0] ||
                    "Looking at shape, labels, color, and category…"}
            </p>
          </div>
        </section>

        <section className="mt-4 rounded-3xl border border-border/80 bg-surface p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "grid h-9 w-9 place-items-center rounded-full",
                hasError
                  ? "bg-destructive/10 text-destructive"
                  : complete
                    ? "bg-success-soft text-success"
                    : "bg-brand-soft text-brand-foreground",
              )}
            >
              {hasError ? (
                <AlertTriangle className="h-5 w-5" />
              ) : complete ? (
                <Check className="h-5 w-5" strokeWidth={3} />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin" />
              )}
            </span>
            <div>
              <h2 className="text-[20px] font-semibold tracking-tight">
                {hasError
                  ? isPhotoQualityError
                    ? "Photos need a fix first"
                    : isIdentityError
                      ? "Couldn’t identify the product"
                      : "Couldn’t finish this run"
                  : complete
                    ? recognitionOk
                      ? "Product recognized"
                      : "We found it!"
                    : "Discovering…"}
              </h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {hasError
                  ? isPhotoQualityError
                    ? "This is an image input issue — not “product unrecognized”."
                    : isIdentityError
                      ? "Recognition did not return a confident product match."
                      : "A later step failed — that is not the same as “product unknown”."
                  : "Here’s what we discovered about your product."}
              </p>
            </div>
          </div>

          {analysisError ? (
            <div className="mt-5 space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm text-destructive">{analysisError}</p>
              {isPhotoQualityError ? (
                <p className="text-[12px] text-muted-foreground">
                  Supported formats: JPEG, PNG, WebP, HEIC. We normalize them
                  before analysis — if this keeps failing, re-export and upload
                  again.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {onRetry ? (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="rounded-xl bg-foreground px-3 py-2 text-[13px] font-semibold text-background"
                  >
                    Try again
                  </button>
                ) : null}
                {onCancel ? (
                  <button
                    type="button"
                    onClick={onCancel}
                    className="rounded-xl border border-border px-3 py-2 text-[13px] font-medium"
                  >
                    Back to photos
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              {complete && recognitionOk ? (
                <div className="mt-5 rounded-2xl border border-success/30 bg-success-soft/40 p-4">
                  <div className="text-[13px] font-semibold text-success">
                    Product recognized
                  </div>
                  <dl className="mt-3 grid gap-2 text-[13px]">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Brand</dt>
                      <dd className="font-medium">
                        {stages?.recognition.brand ||
                          listing.brand ||
                          "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Product</dt>
                      <dd className="font-medium text-right">
                        {stages?.recognition.productType ||
                          listing.productType ||
                          listing.title ||
                          "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Size</dt>
                      <dd className="font-medium">
                        {stages?.recognition.size || listing.size || "—"}
                      </dd>
                    </div>
                    {confidencePct != null ? (
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Confidence</dt>
                        <dd className="font-medium">{confidencePct}%</dd>
                      </div>
                    ) : null}
                  </dl>
                </div>
              ) : null}

              <ul className="mt-5 space-y-2.5">
                <AnimatePresence>
                  {findings.slice(0, revealed).map((f) => (
                    <motion.li
                      key={f.label}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.28 }}
                      className="flex items-center gap-3 rounded-xl border border-border bg-background/50 px-3.5 py-3"
                    >
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-muted text-foreground">
                        <f.icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] text-muted-foreground">
                          {f.label}
                        </div>
                        <div className="truncate text-[13.5px] font-medium">
                          {f.value}
                        </div>
                        {"hint" in f && f.hint ? (
                          <div className="mt-0.5 text-[11.5px] text-amber-800">
                            {f.hint}
                          </div>
                        ) : null}
                      </div>
                      <span
                        className={cn(
                          "grid h-6 w-6 place-items-center rounded-full",
                          "hint" in f && f.hint
                            ? "bg-amber-100 text-amber-800"
                            : "bg-success-soft text-success",
                        )}
                      >
                        {"hint" in f && f.hint ? (
                          <AlertTriangle className="h-3.5 w-3.5" />
                        ) : (
                          <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        )}
                      </span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>

              {secondaryLines.length ? (
                <ul className="mt-4 space-y-1.5 border-t border-border pt-4">
                  {secondaryLines.map((line) => (
                    <li
                      key={line}
                      className="text-[12.5px] text-muted-foreground"
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}

          {allDone && !analysisError ? (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-5 rounded-2xl border border-brand/40 bg-brand-soft/60 p-4"
            >
              <div className="flex items-center gap-2 text-[13.5px] font-semibold">
                <Sparkles className="h-4 w-4 text-brand-foreground" /> Great! We
                have everything we need.
              </div>
              <p className="mt-1 text-[12.5px] text-muted-foreground">
                Next: check title, price, and specifics.
              </p>
            </motion.div>
          ) : null}
        </section>
      </div>

      <StickyActionBar
        left={
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heroSrc}
              alt=""
              className="h-9 w-9 rounded-lg border border-border object-cover"
            />
            <div className="flex flex-col leading-tight">
              <span className="text-[13px] font-medium">
                {images.length} photos uploaded
              </span>
              <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
                <Images className="h-3 w-3" /> Part 2 — Higlou is writing
              </span>
            </div>
          </>
        }
        right={
          <>
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-[14px] font-medium hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button
              type="button"
              disabled={!complete || Boolean(analysisError)}
              onClick={onContinue}
              className="inline-flex items-center gap-2 rounded-xl bg-foreground px-5 py-2.5 text-[14px] font-semibold text-background shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </button>
          </>
        }
      />
    </div>
  );
}
