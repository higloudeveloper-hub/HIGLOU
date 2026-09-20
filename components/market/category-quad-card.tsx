"use client";

import { ChevronRight } from "lucide-react";
import type { MarketDropPublic } from "@/lib/market/from-opportunity";
import { DealProductTile } from "@/components/market/deal-product-tile";
import { cn } from "@/lib/utils";

export function CategoryQuadCard({
  title,
  subtitle,
  items,
  busyId,
  selectedId,
  onSelect,
  onClaim,
  onOpenAll,
  className,
}: {
  title: string;
  subtitle?: string;
  items: MarketDropPublic[];
  busyId: string | null;
  selectedId: string | null;
  onSelect: (item: MarketDropPublic) => void;
  onClaim: (item: MarketDropPublic) => void;
  onOpenAll?: () => void;
  className?: string;
}) {
  const quad = items.slice(0, 4);
  while (quad.length < 4 && items.length > 0) {
    // pad visually only when we have fewer than 4 — leave empty slots blank
    break;
  }

  return (
    <section
      className={cn(
        "flex w-[300px] shrink-0 flex-col rounded-lg border border-[#d5d9d9] bg-white p-4 shadow-[0_1px_2px_rgba(15,17,17,0.06)] sm:w-[320px]",
        className,
      )}
    >
      <button
        type="button"
        onClick={onOpenAll}
        className="mb-3 flex items-start justify-between gap-2 text-left"
      >
        <div>
          <h2 className="text-[18px] leading-tight font-bold text-[#0f1111]">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-0.5 text-[12px] text-[#565959]">{subtitle}</p>
          ) : null}
        </div>
        <ChevronRight className="mt-1 size-5 shrink-0 text-[#0f1111]" />
      </button>

      <div className="grid grid-cols-2 gap-3">
        {quad.map((item) => (
          <DealProductTile
            key={item.id}
            item={item}
            variant="quad"
            selected={selectedId === item.id}
            busy={busyId === item.id}
            onSelect={() => onSelect(item)}
            onClaim={() => onClaim(item)}
          />
        ))}
        {quad.length === 0 ? (
          <p className="col-span-2 py-10 text-center text-[13px] text-[#565959]">
            No deals in this lane yet
          </p>
        ) : null}
      </div>
    </section>
  );
}
