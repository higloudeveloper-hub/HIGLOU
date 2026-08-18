"use client";

import { ExternalLink } from "lucide-react";
import { amazonAsinFromListing, amazonListingUrl } from "@/lib/amazon/asin";
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
  const asin = amazonAsinFromListing({
    amazonAsin: listing.amazonAsin,
    sku: listing.sku,
    description: listing.descriptionHtml,
    itemSpecifics: listing.itemSpecifics,
  });
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-md border border-[#ccc] bg-white px-3 text-[13px] font-semibold text-[#141414] transition hover:border-[#141414]",
        className,
      )}
    >
      Open on Amazon
      <ExternalLink className="size-3.5" />
      {asin ? (
        <span className="hidden font-medium text-[#707070] sm:inline">{asin}</span>
      ) : null}
    </a>
  );
}
