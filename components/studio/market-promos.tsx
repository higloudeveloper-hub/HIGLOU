"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

const PROMOS = [
  {
    photo: "/demo/m18-front.webp",
    title: "Milwaukee M18 FUEL Hammer Drill",
    market: "eBay",
    sold: "2.4k sold / 30d",
    buy: 95,
    sell: 189,
  },
  {
    photo: "/landing/floodlight.png",
    title: "LED Flood Light 5000K",
    market: "Amazon",
    sold: "8.1k sold / 30d",
    buy: 22,
    sell: 65,
  },
  {
    photo: "/demo/kettle.jpg",
    title: "Electric Ceramic Kettle",
    market: "eBay",
    sold: "1.1k sold / 30d",
    buy: 12,
    sell: 28,
  },
  {
    photo: "/demo/sneakers.jpg",
    title: "Runner sneakers",
    market: "Shopify",
    sold: "640 sold / 30d",
    buy: 38,
    sell: 120,
  },
  {
    photo: "/demo/bedding.jpg",
    title: "Queen comforter set",
    market: "eBay",
    sold: "890 sold / 30d",
    buy: 29,
    sell: 89,
  },
  {
    photo: "/demo/m18-box.webp",
    title: "M18 kit, new in box",
    market: "Facebook",
    sold: "Hot in Marketplace",
    buy: 110,
    sell: 219,
  },
] as const;

export function MarketPromos() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {PROMOS.map((item, i) => {
        const profit = item.sell - item.buy;
        return (
          <Link
            key={item.title}
            href="/listings/new"
            className="group block overflow-hidden rounded-[20px] bg-white shadow-[0_1px_3px_rgba(15,17,17,0.08),0_8px_24px_-14px_rgba(15,17,17,0.18)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_16px_36px_-16px_rgba(15,17,17,0.28)]"
          >
            <div className="relative aspect-[16/10] bg-[#f3f3f3]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.photo}
                alt=""
                decoding="async"
                loading={i < 2 ? "eager" : "lazy"}
                className="absolute inset-0 size-full object-contain p-3"
              />
              <span className="absolute bottom-2 left-2 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-[#191919] shadow-sm">
                Hot on {item.market}
              </span>
            </div>
            <div className="px-3.5 py-3">
              <p className="line-clamp-2 min-h-[40px] text-[15px] leading-snug font-bold tracking-tight text-[#191919]">
                {item.title}
              </p>
              <p className="mt-1 truncate text-[12px] text-[#707070]">{item.sold}</p>
              <div className="mt-1.5 flex items-baseline justify-between gap-2">
                <p className="truncate text-[13px] text-[#707070]">
                  ${item.buy} in · ${item.sell} out
                </p>
                <p
                  className={cn(
                    "shrink-0 text-[15px] font-bold tabular-nums text-[#008060]",
                  )}
                >
                  +${profit}
                </p>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
