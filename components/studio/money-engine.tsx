"use client";

import { ListingPipeline } from "@/components/studio/listing-pipeline";

export function MoneyEngine({
  compact = false,
  storeName,
}: {
  compact?: boolean;
  storeName?: string | null;
}) {
  return <ListingPipeline compact={compact} storeName={storeName} />;
}
