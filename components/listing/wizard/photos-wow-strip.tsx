"use client";

import { ListingPipeline } from "@/components/studio/listing-pipeline";

/** Photos step teaser — same money machine as Home (no black HUD). */
export function PhotosWowStrip({
  storeName,
}: {
  storeName?: string | null;
}) {
  return (
    <div className="flex h-[min(56vh,580px)] min-h-[440px] flex-col overflow-hidden rounded-[20px] border border-[#e5e5e5] bg-white shadow-[0_12px_40px_-24px_rgba(15,17,17,0.18)]">
      <ListingPipeline storeName={storeName} />
    </div>
  );
}
