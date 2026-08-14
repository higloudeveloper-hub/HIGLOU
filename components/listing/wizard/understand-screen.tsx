"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Images,
  Loader2,
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
    return [
      {
        label: "Category",
        value:
          stages?.classification.categoryName ||
          listing.categoryName ||
          (complete ? "—" : "Matching…"),
      },
      {
        label: "Brand",
        value:
          (stages?.recognition.brand || listing.brand).trim() ||
          "Not on labels",
      },
      { label: "Color", value: colors },
      {
        label: "Material",
        value: materials,
        hint: materialEstimated ? "Estimated — review" : undefined,
      },
      {
        label: "Style",
        value: listing.pattern?.trim() || listing.type || "—",
      },
      { label: "Size", value: dims },
    ] as const;
  }, [listing, stages, complete, materialConfidence]);

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
      <div className="mx-auto max-w-[880px] animate-in fade-in slide-in-from-bottom-2 px-4 py-4 duration-500 sm:px-0">
        <ol className="mb-4 flex gap-1 overflow-x-auto pb-0.5">
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
                  "flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
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
                  <Loader2 className="size-2.5 animate-spin" />
                ) : state === "done" ? (
                  <Check className="size-2.5" strokeWidth={3} />
                ) : null}
                {s.label}
                <span className="sr-only">{statusLabel(state)}</span>
              </li>
            );
          })}
        </ol>

        <section className="overflow-hidden rounded-3xl border border-border/80 bg-surface shadow-[0_24px_60px_-48px_rgba(20,16,8,0.45)]">
          <div className="grid lg:grid-cols-[240px_1fr]">
            <div className="relative bg-muted/40 lg:border-r lg:border-border/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={heroSrc}
                alt="Product"
                className="h-[160px] w-full object-contain sm:h-[180px] lg:h-full lg:min-h-[280px]"
              />
              {!complete && !hasError ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-brand/25 to-transparent [animation:higlou-scan_2.4s_ease-in-out_infinite]"
                />
              ) : null}
              <div className="absolute right-2 bottom-2 left-2 flex items-center justify-between rounded-lg bg-background/90 px-2 py-1 text-[11px] font-medium backdrop-blur-md">
                <span className="inline-flex items-center gap-1.5">
                  {!complete && !hasError ? <LiveDot /> : null}
                  {hasError
                    ? "Paused"
                    : complete
                      ? "Ready"
                      : STAGES[stage]?.label || "Reading"}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {progress}%
                </span>
              </div>
            </div>

            <div className="flex min-h-0 flex-col p-4 sm:p-5">
              <div className="flex items-center gap-2">
                {hasError ? (
                  <AlertTriangle className="size-4 text-destructive" />
                ) : complete ? (
                  <Check className="size-4 text-success" strokeWidth={3} />
                ) : (
                  <Loader2 className="size-4 animate-spin text-brand-foreground" />
                )}
                <h2 className="text-[15px] font-semibold tracking-tight">
                  {hasError
                    ? isPhotoQualityError
                      ? "Photos need a fix"
                      : isIdentityError
                        ? "Couldn’t identify the product"
                        : "Couldn’t finish this run"
                    : complete
                      ? recognitionOk
                        ? "Product recognized"
                        : "Draft ready"
                      : "Reading the product…"}
                </h2>
                {confidencePct != null && complete ? (
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {confidencePct}%
                  </span>
                ) : null}
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
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
              <p className="mt-1.5 text-[12px] text-muted-foreground">
                {hasError
                  ? "Fix this step, then continue."
                  : complete
                    ? "Check title and price next."
                    : secondaryLines[0] || "Shape, labels, color, category…"}
              </p>

              {analysisError ? (
                <div className="mt-3 space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-sm text-destructive">{analysisError}</p>
                  <div className="flex flex-wrap gap-2">
                    {onRetry ? (
                      <button
                        type="button"
                        onClick={onRetry}
                        className="rounded-lg bg-foreground px-3 py-1.5 text-[12px] font-semibold text-background"
                      >
                        Try again
                      </button>
                    ) : null}
                    {onCancel ? (
                      <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium"
                      >
                        Back to photos
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <ul className="mt-3 grid grid-cols-2 gap-x-4">
                  <AnimatePresence>
                    {findings.slice(0, revealed).map((f) => (
                      <motion.li
                        key={f.label}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.22 }}
                        className="flex min-w-0 items-baseline justify-between gap-2 border-b border-border/50 py-1.5"
                      >
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {f.label}
                        </span>
                        <span
                          className={cn(
                            "truncate text-right text-[12.5px] font-medium",
                            "hint" in f && f.hint && "text-amber-800",
                          )}
                          title={
                            "hint" in f && f.hint
                              ? `${f.value} — ${f.hint}`
                              : f.value
                          }
                        >
                          {f.value}
                        </span>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}

              {secondaryLines.length && !analysisError ? (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {secondaryLines.join(" · ")}
                </p>
              ) : null}
              {allDone && !analysisError ? (
                <p className="mt-2 text-[12px] font-medium text-foreground">
                  Ready — continue to edit title and price.
                </p>
              ) : null}
            </div>
          </div>
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
