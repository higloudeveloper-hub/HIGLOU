"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  AmazonMark,
  EbayMark,
  FacebookFMark,
  ShopifyMark,
  SiteMark,
} from "@/components/brand/store-marks";
import { READY_LISTINGS, type ReadyListing } from "@/components/studio/ready-catalog";
import { cn } from "@/lib/utils";

function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function LiveOnMarks() {
  return (
    <div className="flex items-center gap-2" aria-label="Lists to five stores">
      <EbayMark className="h-3" />
      <AmazonMark className="h-2.5" />
      <FacebookFMark className="h-3.5" />
      <ShopifyMark className="h-3.5" />
      <SiteMark className="h-3.5" />
    </div>
  );
}

export function MarketPromos({
  activeIndex = -1,
  listings = READY_LISTINGS,
}: {
  activeIndex?: number;
  listings?: readonly ReadyListing[];
}) {
  const lots = listings.length || 1;
  const openSpread = listings.reduce((sum, item) => sum + (item.sell - item.buy), 0);

  useEffect(() => {
    if (activeIndex < 0) return;
    document
      .querySelector(`[data-ready-sku="${activeIndex % lots}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex, lots]);

  return (
    <div>
      <div className="mb-3 flex items-end justify-between border-b border-[#e8e8e8] pb-3">
        <div>
          <p className="text-[11px] font-medium tracking-[0.14em] text-[#8a8a8a] uppercase">
            Open spread
          </p>
          <p className="mt-0.5 text-[22px] font-medium tabular-nums tracking-tight text-[#141414]">
            {money(openSpread)}
          </p>
        </div>
        <p className="pb-0.5 text-right text-[12px] leading-snug text-[#707070]">
          {listings.length} ready
          <br />
          after supplier cost
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {listings.map((item, i) => {
          const profit = item.sell - item.buy;
          const margin = Math.round((profit / item.sell) * 100);
          const undercut = item.comps - item.sell;
          const active = activeIndex >= 0 && i === activeIndex % lots;
          return (
            <Link
              key={`${i}-${item.title}`}
              href="/listings/new"
              data-ready-sku={i}
              className={cn(
                "group block bg-white ring-1 ring-[#e8e8e8] transition duration-200",
                active ? "ring-[#141414]" : "hover:ring-[#cfcfcf]",
              )}
            >
              <div className="grid grid-cols-[132px_minmax(0,1fr)] sm:grid-cols-[156px_minmax(0,1fr)]">
                <div className="relative aspect-square bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.photo}
                    alt=""
                    decoding="async"
                    loading={i < 2 ? "eager" : "lazy"}
                    className="absolute inset-0 size-full object-contain p-3"
                  />
                </div>

                <div className="flex min-w-0 flex-col justify-between border-l border-[#f0f0f0] px-3 py-2.5 sm:px-3.5">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-[#8a8a8a]">
                        In stock · {item.supplier}
                      </p>
                      {active ? (
                        <span className="text-[11px] font-medium text-[#3665F3]">
                          Listing this
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[14px] leading-snug font-medium tracking-tight text-[#191919]">
                      {item.title}
                    </p>
                    <p className="mt-1 text-[11px] text-[#8a8a8a]">{item.ships}</p>
                  </div>

                  <div className="mt-2.5">
                    <LiveOnMarks />
                    <div className="mt-2 flex items-baseline justify-between gap-2 text-[12px] tabular-nums">
                      <span className="text-[#8a8a8a]">
                        {money(item.buy)}
                        <span className="mx-1 text-[#c5c5c5]">→</span>
                        {money(item.sell)}
                      </span>
                      <span className="text-[15px] font-medium tracking-tight text-[#141414]">
                        You keep +{money(profit)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-[#8a8a8a]">
                      {margin}% after cost
                      {undercut > 0 ? ` · ${money(undercut)} under sold` : ""}
                    </p>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
