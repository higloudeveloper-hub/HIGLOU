"use client";

import { amazonListingUrl } from "@/lib/amazon/asin";
import type { ProductListing } from "@/types/product";
import { cn } from "@/lib/utils";

export function AmazonSourceLink({
  listing,
  className,
}: {
  listing: Pick<
    ProductListing,
    "amazonUrl" | "amazonAsin" | "sku" | "descriptionHtml" | "itemSpecifics"
  >;
  className?: string;
}) {
  const href = amazonListingUrl({
    amazonUrl: listing.amazonUrl,
    amazonAsin: listing.amazonAsin,
    sku: listing.sku,
    description: listing.descriptionHtml,
    itemSpecifics: listing.itemSpecifics,
  });
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "text-[12px] text-[#707070] underline underline-offset-2 hover:text-[#141414]",
        className,
      )}
    >
      Amazon listing
    </a>
  );
}
