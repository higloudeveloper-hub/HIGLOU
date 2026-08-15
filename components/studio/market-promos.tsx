"use client";

import { useEffect } from "react";
import Link from "next/link";
import { READY_LISTINGS } from "@/components/studio/ready-catalog";
import { cn } from "@/lib/utils";

function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function MarketPromos({ activeIndex = -1 }: { activeIndex?: number }) {
  useEffect(() => {
    if (activeIndex < 0) return;
    document
      .querySelector(`[data-ready-sku="${activeIndex % READY_LISTINGS.length}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex]);

  return (
    <div className="grid grid-cols-2 gap-3">
      {READY_LISTINGS.map((item, i) => {
        const profit = item.sell - item.buy;
        const margin = Math.round((profit / item.sell) * 100);
        const active =
          activeIndex >= 0 && i === activeIndex % READY_LISTINGS.length;
        return (
          <Link
            key={item.title}
            href="/listings/new"
            data-ready-sku={i}
            className={cn(
              "group block overflow-hidden rounded-[20px] bg-white shadow-[0_1px_3px_rgba(15,17,17,0.08),0_8px_24px_-14px_rgba(15,17,17,0.18)] transition duration-200",
              active
                ? "ring-2 ring-[#141414]"
                : "hover:-translate-y-1 hover:shadow-[0_16px_36px_-16px_rgba(15,17,17,0.28)]",
            )}
          >
            <div className="relative aspect-[16/10] bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.photo}
                alt=""
                decoding="async"
                loading={i < 2 ? "eager" : "lazy"}
                className="absolute inset-0 size-full object-contain p-3"
              />
              <span className="absolute bottom-2 left-2 rounded-md bg-white px-2 py-0.5 text-[11px] font-semibold text-[#141414] shadow-sm ring-1 ring-black/10">
                {active ? "Listing this" : "Ready to list"}
              </span>
            </div>
            <div className="px-3.5 py-3">
              <p className="line-clamp-2 min-h-[40px] text-[15px] leading-snug font-bold tracking-tight text-[#191919]">
                {item.title}
              </p>
              <p className="mt-1 truncate text-[12px] text-[#707070]">
                {item.supplier} · {item.ships}
              </p>
              <div className="mt-2 grid grid-cols-3 gap-1 text-[11px] tabular-nums">
                <div>
                  <p className="text-[#8a8a8a]">Cost</p>
                  <p className="font-semibold text-[#191919]">{money(item.buy)}</p>
                </div>
                <div>
                  <p className="text-[#8a8a8a]">Sell</p>
                  <p className="font-semibold text-[#191919]">{money(item.sell)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[#8a8a8a]">{margin}% margin</p>
                  <p className="font-semibold text-[#141414]">+{money(profit)}</p>
                </div>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
