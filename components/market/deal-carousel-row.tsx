"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { MarketDropPublic } from "@/lib/market/from-opportunity";
import { DealProductTile } from "@/components/market/deal-product-tile";

export function DealCarouselRow({
  title,
  items,
  busyId,
  selectedId,
  onSelect,
  onClaim,
  onOpenAll,
}: {
  title: string;
  items: MarketDropPublic[];
  busyId: string | null;
  selectedId: string | null;
  onSelect: (item: MarketDropPublic) => void;
  onClaim: (item: MarketDropPublic) => void;
  onOpenAll?: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: -1 | 1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(560, el.clientWidth * 0.85), behavior: "smooth" });
  };

  if (!items.length) return null;

  return (
    <section className="relative rounded-lg border border-[#d5d9d9] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(15,17,17,0.06)] sm:px-5">
      <button
        type="button"
        onClick={onOpenAll}
        className="mb-3 flex items-center gap-1 text-left"
      >
        <h2 className="text-[21px] font-bold text-[#0f1111]">{title}</h2>
        <ChevronRight className="size-5 text-[#0f1111]" />
      </button>

      <div className="relative">
        <button
          type="button"
          aria-label="Scroll left"
          onClick={() => scrollBy(-1)}
          className="absolute top-1/2 left-0 z-[1] hidden size-10 -translate-y-1/2 items-center justify-center rounded-md border border-[#d5d9d9] bg-white shadow-md hover:bg-[#f7f8f8] md:inline-flex"
        >
          <ChevronLeft className="size-5" />
        </button>
        <div
          ref={scroller}
          className="flex gap-4 overflow-x-auto scroll-smooth pb-1 [-ms-overflow-style:none] [scrollbar-width:none] md:px-8 [&::-webkit-scrollbar]:hidden"
        >
          {items.map((item) => (
            <DealProductTile
              key={item.id}
              item={item}
              variant="carousel"
              selected={selectedId === item.id}
              busy={busyId === item.id}
              onSelect={() => onSelect(item)}
              onClaim={() => onClaim(item)}
            />
          ))}
        </div>
        <button
          type="button"
          aria-label="Scroll right"
          onClick={() => scrollBy(1)}
          className="absolute top-1/2 right-0 z-[1] hidden size-10 -translate-y-1/2 items-center justify-center rounded-md border border-[#d5d9d9] bg-white shadow-md hover:bg-[#f7f8f8] md:inline-flex"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
    </section>
  );
}
