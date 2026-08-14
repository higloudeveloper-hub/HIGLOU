"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { ImageUploader } from "@/components/uploader/image-uploader";
import { StickyActionBar } from "@/components/listing/wizard/sticky-action-bar";
import { ListingPipeline } from "@/components/studio/listing-pipeline";
import { CONDITION_OPTIONS } from "@/config/condition-map";
import type { ProductImage } from "@/types/product";
import { cn } from "@/lib/utils";

export function PhotosScreen({
  images,
  productId,
  price,
  condition,
  uploadingPending,
  canContinue,
  analysisError,
  onImagesChange,
  onPriceChange,
  onConditionChange,
  onContinue,
}: {
  images: ProductImage[];
  productId?: string;
  listingId?: string;
  price: number | null;
  condition: string;
  uploadingPending: boolean;
  canContinue: boolean;
  analysisError?: string | null;
  onImagesChange: (images: ProductImage[]) => void;
  onPriceChange: (price: number | null) => void;
  onConditionChange: (condition: string) => void;
  onContinue: () => void;
  onPhotoIntakeSessionChange?: (session: unknown) => void;
}) {
  const [coach, setCoach] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem("higlou-photos-coach") === "1") return;
    } catch {
      /* ignore */
    }
    setCoach(true);
  }, []);

  return (
    <div className="pb-28">
      <div className="mx-auto max-w-[760px] animate-in fade-in slide-in-from-bottom-2 px-4 py-6 duration-500 sm:px-0">
        {coach && images.length === 0 ? (
          <div className="mb-4">
            <ListingPipeline compact />
          </div>
        ) : coach ? (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-brand/40 bg-brand-soft/70 px-4 py-3">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-brand-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">Part 1 — just photos</p>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                Drop them in. Higlou writes the listing. You don’t need a
                perfect title yet.
              </p>
            </div>
            <button
              type="button"
              className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
              onClick={() => {
                setCoach(false);
                try {
                  window.localStorage.setItem("higlou-photos-coach", "1");
                } catch {
                  /* ignore */
                }
              }}
            >
              Got it
            </button>
          </div>
        ) : null}
        <section className="rounded-3xl border border-border/80 bg-surface p-5 shadow-[0_24px_60px_-48px_rgba(20,16,8,0.45)] sm:p-7">
          <ImageUploader
            images={images}
            onChange={onImagesChange}
            productId={productId}
            variant="wizard"
          />
          <p className="mt-3 text-[13px] text-muted-foreground">
            Clear shots from a few angles work best. Labels and packaging help.
          </p>
        </section>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="rounded-2xl border border-border/80 bg-surface p-4">
            <span className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              Selling price
            </span>
            <div className="mt-2 flex overflow-hidden rounded-xl border border-border bg-background focus-within:ring-2 focus-within:ring-brand/50">
              <span className="border-r border-border px-3 py-2.5 text-[13px] font-medium text-muted-foreground">
                USD
              </span>
              <input
                id="wizard-price"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                placeholder="0.00"
                value={price ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    onPriceChange(null);
                    return;
                  }
                  const next = Number(raw);
                  onPriceChange(Number.isFinite(next) ? next : null);
                }}
                className="w-full bg-transparent px-3 py-2.5 text-[15px] font-medium outline-none"
              />
            </div>
            <span className="mt-1.5 block text-[12px] text-muted-foreground">
              Optional now. You can change it later.
            </span>
          </label>

          <label className="rounded-2xl border border-border/80 bg-surface p-4">
            <span className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              Condition
            </span>
            <select
              id="wizard-condition"
              value={condition || "New"}
              onChange={(e) => onConditionChange(e.target.value)}
              className={cn(
                "mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-[15px] font-medium outline-none",
                "focus:ring-2 focus:ring-brand/50",
              )}
            >
              {CONDITION_OPTIONS.map((option) => (
                <option
                  key={`${option.label}-${option.conditionId}`}
                  value={option.label}
                >
                  {option.label}
                </option>
              ))}
            </select>
            <span className="mt-1.5 block text-[12px] text-muted-foreground">
              Defaults to New. Change if it isn’t.
            </span>
          </label>
        </div>

        {images.length > 0 && uploadingPending ? (
          <p className="mt-3 text-sm text-brand-foreground">
            Waiting for uploads to finish…
          </p>
        ) : null}
        {analysisError ? (
          <p className="mt-3 text-sm text-destructive">{analysisError}</p>
        ) : null}
      </div>

      <StickyActionBar
        left={
          <span className="hidden items-center gap-1.5 text-[12px] text-muted-foreground sm:inline-flex">
            <ShieldCheck className="h-3.5 w-3.5" />
              {images.length
              ? `${images.length} photo${images.length === 1 ? "" : "s"} ready · next: AI writes`
              : "Add at least one photo to continue"}
          </span>
        }
        right={
          <button
            type="button"
            disabled={!canContinue}
            onClick={onContinue}
            className="inline-flex items-center gap-2 rounded-xl bg-foreground px-5 py-3 text-[14px] font-semibold text-background shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </button>
        }
      />
    </div>
  );
}
