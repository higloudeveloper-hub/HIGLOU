"use client";

import { ListingPipeline } from "@/components/studio/listing-pipeline";

export function EbaySetupStory({
  storeName,
}: {
  connected?: boolean;
  username?: string | null;
  storeName?: string | null;
}) {
  return <ListingPipeline storeName={storeName} />;
}
