"use client";

import type { MarketDropPublic } from "@/lib/market/from-opportunity";
import { marketSpread } from "@/lib/market/catalog";
import { AmazonPrice, dealOffPercent } from "@/components/market/amazon-price";
import { cn } from "@/lib/utils";

function dealLabel(item: MarketDropPublic): string {
  if (item.lane === "amazon") {
    if ((item.bsrDrops90 ?? 0) >= 25) return "Keepa demand hot";
    return "Keepa verified";
  }
  if (item.heat === "hot") return "Limited time deal";
  if (item.heat === "warm") return "Deal selling fast";
  return "Verified keep";
}

export function DealProductTile({
  item,
  variant = "carousel",
  selected,
  busy,
  onSelect,
  onClaim,
}: {
  item: MarketDropPublic;
  variant?: "carousel" | "quad";
  selected?: boolean;
  busy?: boolean;
  onSelect: () => void;
  onClaim: () => void;
}) {
  const keep = item.netProfit ?? marketSpread(item);
  const off = dealOffPercent(item.buy, item.sell, item.comps);
  const showKeep = item.lane !== "amazon" && keep > 0;
  const price = item.lane === "amazon" ? item.sell : item.sell;
  const list = item.comps > item.sell ? item.comps : null;

  return (
    <article
      className={cn(
        "group flex flex-col text-left",
        variant === "carousel" ? "w-[168px] shrink-0 sm:w-[180px]" : "min-w-0",
        selected && "ring-2 ring-[#2162a1] ring-offset-2",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex flex-col text-left"
      >
        <div
          className={cn(
            "relative overflow-hidden rounded-md bg-[#f7f8f8]",
            variant === "carousel" ? "aspect-square" : "aspect-square",
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.photo}
            alt=""
            className="size-full object-contain p-3 transition group-hover:scale-[1.03]"
            loading="lazy"
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {off != null && off > 0 ? (
            <span className="bg-[#cc0c39] px-1.5 py-0.5 text-[12px] font-bold text-white">
              {off}% off
            </span>
          ) : showKeep ? (
            <span className="bg-[#cc0c39] px-1.5 py-0.5 text-[12px] font-bold text-white">
              Keep ${Math.round(keep)}
            </span>
          ) : item.lane === "amazon" ? (
            <span className="bg-[#cc0c39] px-1.5 py-0.5 text-[12px] font-bold text-white">
              D{item.demandScore ?? item.score ?? 0}
            </span>
          ) : null}
          <span className="text-[12px] font-medium text-[#cc0c39]">
            {dealLabel(item)}
          </span>
        </div>

        <div className="mt-1 flex items-baseline gap-1.5">
          <AmazonPrice amount={price} size="md" />
          {list != null ? (
            <span className="text-[12px] text-[#565959] line-through tabular-nums">
              ${list.toFixed(2)}
            </span>
          ) : null}
        </div>

        {variant === "quad" ? (
          <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-[#0f1111]">
            {item.title}
          </p>
        ) : (
          <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-[#0f1111]">
            {item.title}
          </p>
        )}

        <p className="mt-1.5 text-[11px] leading-tight text-[#565959]">
          <span className="font-semibold text-[#0f1111]">Amz</span>{" "}
          {item.amazonPrice != null ? `$${Math.round(item.amazonPrice)}` : "—"}
          {" · "}
          <span className="font-semibold text-[#0f1111]">eBay</span>{" "}
          {item.ebayPrice != null ? `$${Math.round(item.ebayPrice)}` : "—"}
          {" · "}
          <span className="font-semibold text-[#0f1111]">Wmt</span>{" "}
          {item.walmartPrice != null ? `$${Math.round(item.walmartPrice)}` : "—"}
        </p>
      </button>

      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          onClaim();
        }}
        className="mt-2 h-8 w-full rounded-full bg-[#ffd814] text-[12px] font-semibold text-[#0f1111] hover:bg-[#f7ca00] disabled:opacity-50"
      >
        {busy ? "Adding…" : "Add to store"}
      </button>
    </article>
  );
}
