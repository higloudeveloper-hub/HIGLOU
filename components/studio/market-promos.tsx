"use client";

import { useEffect } from "react";
import Link from "next/link";
import { READY_LISTINGS, type ReadyListing } from "@/components/studio/ready-catalog";
import { cn } from "@/lib/utils";

function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
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
          <p className="mt-0.5 text-[20px] font-medium tabular-nums tracking-tight text-[#141414]">
            {money(openSpread)}
          </p>
        </div>
        <p className="pb-0.5 text-right text-[12px] leading-snug text-[#707070]">
          {listings.length} lots
          <br />
          after supplier cost
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {listings.map((item, i) => {
          const profit = item.sell - item.buy;
          const margin = Math.round((profit / item.sell) * 100);
          const undercut = item.comps - item.sell;
          const active = activeIndex >= 0 && i === activeIndex % lots;
          return (
            <Link
              key={`${i}-${item.title}`}
              href="/listings/new"
              className={cn(
                "group block overflow-hidden rounded-[14px] bg-white ring-1 ring-[#e8e8e8] transition duration-200",
                active
                  ? "ring-[#141414]"
                  : "hover:ring-[#cfcfcf]",
              )}
            >
              <div
                data-ready-sku={i}
                className="relative aspect-[16/10] bg-white"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.photo}
                  alt=""
                  decoding="async"
                  loading={i < 2 ? "eager" : "lazy"}
                  className="absolute inset-0 size-full object-contain p-3"
                />
                <span className="absolute bottom-2 left-2 bg-white/95 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-[#141414] ring-1 ring-black/10">
                  {active ? "Listing this" : "In stock"}
                </span>
              </div>

              <div className="px-3 pb-3 pt-2.5">
                <p className="line-clamp-2 min-h-[36px] text-[13px] leading-snug font-medium tracking-tight text-[#191919]">
                  {item.title}
                </p>
                <p className="mt-1 truncate text-[11px] text-[#8a8a8a]">
                  {item.supplier} · {item.ships}
                </p>

                <div className="mt-2.5 border-t border-[#eee] pt-2.5">
                  <div className="flex items-baseline justify-between gap-2 text-[11px] tabular-nums">
                    <span className="text-[#8a8a8a]">Cost → list</span>
                    <span className="text-[#565959]">
                      {money(item.buy)}
                      <span className="mx-1 text-[#c5c5c5]">→</span>
                      {money(item.sell)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-2">
                    <span className="text-[12px] text-[#707070]">You keep</span>
                    <span className="text-[16px] font-medium tabular-nums tracking-tight text-[#141414]">
                      +{money(profit)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-[#8a8a8a]">
                    {margin}% after cost
                    {undercut > 0 ? ` · ${money(undercut)} under sold` : ""}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
