"use client";

import { ArrowRight } from "lucide-react";
import { ImageUploader } from "@/components/uploader/image-uploader";
import { ListingPipeline } from "@/components/studio/listing-pipeline";
import { CatalogImportDock } from "@/components/listing/wizard/catalog-import-dock";
import { AmazonSourceLink } from "@/components/listing/amazon-source-link";
import { CONDITION_OPTIONS } from "@/config/condition-map";
import type { ProductImage, ProductListing } from "@/types/product";
import { cn } from "@/lib/utils";

export function PhotosScreen({
  images,
  productId,
  price,
  condition,
  uploadingPending,
  canContinue,
  analysisError,
  storeName,
  onImagesChange,
  onPriceChange,
  onConditionChange,
  onContinue,
  onCatalogImport,
  catalogImporting = false,
  sourceListing,
}: {
  images: ProductImage[];
  productId?: string;
  listingId?: string;
  price: number | null;
  condition: string;
  uploadingPending: boolean;
  canContinue: boolean;
  analysisError?: string | null;
  storeName?: string | null;
  onImagesChange: (images: ProductImage[]) => void;
  onPriceChange: (price: number | null) => void;
  onConditionChange: (condition: string) => void;
  onContinue: () => void;
  onCatalogImport?: (url: string) => Promise<boolean | void>;
  catalogImporting?: false | "amazon" | "homedepot";
  sourceListing?: ProductListing;
  onPhotoIntakeSessionChange?: (session: unknown) => void;
}) {
  const shots = images
    .map((img) => img.previewUrl || img.url)
    .filter((src): src is string => Boolean(src));
  const importing = Boolean(catalogImporting);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      {onCatalogImport ? (
        <CatalogImportDock
          importing={catalogImporting}
          onImport={onCatalogImport}
        />
      ) : null}
      <div className="relative min-h-0 flex-1">
        <ListingPipeline storeName={storeName} photos={shots} mode="drop" />
        <ImageUploader
          images={images}
          onChange={onImagesChange}
          productId={productId}
          variant="stage"
        />
      </div>

      {images.length > 0 && uploadingPending ? (
        <p className="border-t border-[#eee] px-4 py-2 text-[13px] text-[#707070]">
          Waiting for uploads to finish…
        </p>
      ) : null}
      {analysisError ? (
        <p className="border-t border-[#eee] px-4 py-2 text-[13px] text-destructive">
          {analysisError}
        </p>
      ) : null}

      <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-[#e5e5e5] bg-white px-4 py-3">
        <label className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-[#707070]">USD</span>
          <input
            id="wizard-price"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder="Price"
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
            className="h-9 w-[92px] rounded-md border border-[#ccc] bg-white px-2 text-[13px] font-medium outline-none focus:border-[#141414]"
          />
        </label>
        <select
          id="wizard-condition"
          value={condition || "New"}
          onChange={(e) => onConditionChange(e.target.value)}
          className={cn(
            "h-9 rounded-md border border-[#ccc] bg-white px-2 text-[13px] font-medium outline-none",
            "focus:border-[#141414]",
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
        <span className="min-w-0 flex-1 truncate text-[12px] text-[#707070]">
          {images.length
            ? `${images.length} photo${images.length === 1 ? "" : "s"}`
            : importing
              ? catalogImporting === "homedepot"
                ? "Reading Home Depot…"
                : "Reading Amazon…"
              : "Drop a photo, or import — then delete, add, or reorder"}
          {sourceListing ? (
            <AmazonSourceLink listing={sourceListing} className="ml-1" />
          ) : null}
        </span>
        <button
          type="button"
          disabled={!canContinue}
          onClick={onContinue}
          className="inline-flex items-center gap-2 rounded-md bg-[#141414] px-5 py-2.5 text-[14px] font-semibold tracking-[-0.01em] text-white transition hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Continue
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
