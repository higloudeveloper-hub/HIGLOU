"use client";

import { ListingPipeline } from "@/components/studio/listing-pipeline";

export function EditPromoStrip({
  photoSrc,
  storeName,
  onGoLive,
}: {
  photoSrc?: string | null;
  title: string;
  priceLabel: string;
  storeName: string;
  categoryLabel: string;
  categoryMatch: boolean;
  photoCount: number;
  shipsFrom: string;
  shippingLabel: string;
  onGoLive: () => void;
}) {
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
      <div className="h-[280px]">
        <ListingPipeline
          storeName={storeName}
          photos={photoSrc ? [photoSrc] : undefined}
          mode="drop"
        />
      </div>
      <div className="flex items-center justify-between border-t border-[#e5e5e5] px-4 py-3">
        <p className="text-[13px] text-[#707070]">
          One click · eBay · Amazon · Facebook · Shopify · your site
        </p>
        <button
          type="button"
          onClick={onGoLive}
          className="h-10 rounded-md bg-[#141414] px-4 text-[13px] font-semibold text-white hover:bg-[#2a2a2a]"
        >
          Go to publish
        </button>
      </div>
    </div>
  );
}
