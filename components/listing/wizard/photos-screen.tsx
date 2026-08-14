"use client";

import {
  ArrowRight,
  Info,
  Lightbulb,
  ShieldCheck,
  Sparkles,
  Timer,
} from "lucide-react";
import { ImageUploader } from "@/components/uploader/image-uploader";
import { StickyActionBar } from "@/components/listing/wizard/sticky-action-bar";
import { CONDITION_OPTIONS } from "@/config/condition-map";
import type { ProductImage } from "@/types/product";
import { cn } from "@/lib/utils";

const VALUES = [
  {
    icon: Sparkles,
    title: "AI-Powered",
    body: "We analyze your photos and generate everything automatically.",
  },
  {
    icon: Timer,
    title: "Saves Time",
    body: "From photos to an eBay + marketplace-ready CSV in minutes.",
  },
  {
    icon: ShieldCheck,
    title: "Expert Quality",
    body: "Accurate titles, item specifics, and sell-ready descriptions.",
  },
] as const;

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
  return (
    <div className="pb-28">
      <div className="mx-auto grid max-w-[1600px] gap-8 px-6 py-10 lg:grid-cols-[340px_1fr]">
        <aside className="space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-[11px] font-semibold tracking-wider text-brand-foreground uppercase">
            Step 1 of 4
          </span>
          <div>
            <h1 className="font-display text-[42px] leading-[1.05] tracking-tight">
              Let&apos;s create
              <br />
              your listing<span className="text-brand">.</span>
            </h1>
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
              Add your product photos. Higlou will handle the rest.
            </p>
          </div>

          <ul className="space-y-3">
            {VALUES.map((v) => (
              <li
                key={v.title}
                className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-xs"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-foreground">
                  <v.icon className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-[14px] font-semibold">{v.title}</div>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                    {v.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="rounded-2xl border border-brand/40 bg-brand-soft/70 p-5">
            <div className="flex items-center gap-2 text-[14px] font-semibold">
              <Lightbulb className="h-4 w-4 text-brand-foreground" />
              Tips for best results
            </div>
            <ul className="mt-3 space-y-1.5 text-[13px] text-foreground/80">
              <li>• Add clear photos from multiple angles</li>
              <li>• Include packaging, labels and details</li>
              <li>
                • More photos = better results{" "}
                <span className="text-brand-foreground">✦</span>
              </li>
            </ul>
          </div>
        </aside>

        <section className="rounded-3xl border border-border bg-surface p-6 shadow-sm md:p-8">
          <ImageUploader
            images={images}
            onChange={onImagesChange}
            productId={productId}
            variant="wizard"
          />

          <div className="mt-6 grid gap-4 rounded-2xl border border-border bg-background/50 p-5 md:grid-cols-2">
            <div>
              <label
                htmlFor="wizard-price"
                className="flex items-center gap-1.5 text-[13px] font-semibold"
              >
                Selling price{" "}
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </label>
              <div className="mt-2 flex overflow-hidden rounded-xl border border-border bg-surface focus-within:ring-2 focus-within:ring-brand/50">
                <span className="border-r border-border bg-muted/60 px-3 py-2.5 text-[14px] font-medium">
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
              <p className="mt-1.5 text-[12px] text-muted-foreground">
                Set the price you want to sell for
              </p>
            </div>
            <div>
              <label
                htmlFor="wizard-condition"
                className="flex items-center gap-1.5 text-[13px] font-semibold"
              >
                Condition{" "}
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </label>
              <select
                id="wizard-condition"
                value={condition || "New"}
                onChange={(e) => onConditionChange(e.target.value)}
                className={cn(
                  "mt-2 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-[15px] font-medium outline-none",
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
              <p className="mt-1.5 text-[12px] text-muted-foreground">
                Select the condition of your item
              </p>
            </div>
          </div>

          {images.length > 0 && uploadingPending ? (
            <p className="mt-3 text-sm text-brand-foreground">
              Waiting for uploads to finish…
            </p>
          ) : null}
          {analysisError ? (
            <p className="mt-3 text-sm text-destructive">{analysisError}</p>
          ) : null}
        </section>
      </div>

      <StickyActionBar
        left={
          <span className="hidden items-center gap-1.5 text-[12px] text-muted-foreground sm:inline-flex">
            <ShieldCheck className="h-3.5 w-3.5" /> Your data is safe and secure
          </span>
        }
        right={
          <button
            type="button"
            disabled={!canContinue}
            onClick={onContinue}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-[14px] font-semibold text-brand-foreground shadow-sm transition-transform hover:-translate-y-px hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
          >
            Create my listing <ArrowRight className="h-4 w-4" />
          </button>
        }
      />
    </div>
  );
}
