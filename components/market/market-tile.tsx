"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  AmazonMark,
  EbayMark,
  FacebookFMark,
  HomeDepotMark,
  ShopifyMark,
  WalmartMark,
} from "@/components/brand/store-marks";
import type { MarketDropPublic } from "@/lib/market/from-opportunity";
import { marketSpread } from "@/lib/market/catalog";
import { cn } from "@/lib/utils";

function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function RevenueFloat({
  amount,
  delay = 0,
}: {
  amount: number;
  delay?: number;
}) {
  const reduce = useReducedMotion() ?? false;
  return (
    <motion.div
      className="pointer-events-none absolute top-2 right-2 z-[2]"
      initial={reduce ? false : { opacity: 0, y: 10, scale: 0.9 }}
      animate={
        reduce
          ? { opacity: 1 }
          : {
              opacity: [0, 1, 1, 0.85],
              y: [10, 0, -4, -8],
              scale: [0.9, 1.05, 1, 1],
            }
      }
      transition={{
        duration: 2.4,
        delay,
        repeat: reduce ? 0 : Infinity,
        repeatDelay: 1.6,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <div className="rounded-sm bg-[#0c0c0c] px-2 py-1 shadow-[0_8px_24px_rgba(12,12,12,0.25)]">
        <p className="text-[9px] font-semibold tracking-[0.14em] text-[#9ca3af] uppercase">
          You keep
        </p>
        <p className="font-[family-name:var(--font-instrument-serif)] text-[18px] leading-none tabular-nums text-[#3dd68c]">
          +{money(amount)}
        </p>
      </div>
    </motion.div>
  );
}

function StoreLane() {
  return (
    <div
      className="flex flex-wrap items-center gap-2 opacity-80"
      aria-label="Sell on Amazon, eBay, Walmart, Home Depot, Shopify, Facebook"
    >
      <AmazonMark className="h-3" />
      <EbayMark className="h-2.5" />
      <WalmartMark className="h-2.5" />
      <HomeDepotMark className="h-3" />
      <ShopifyMark className="h-3" />
      <FacebookFMark className="h-3.5" />
    </div>
  );
}

export function MarketTile({
  item,
  selected,
  busy,
  index,
  onSelect,
  onClaim,
  onEarn,
}: {
  item: MarketDropPublic;
  selected: boolean;
  busy: boolean;
  index: number;
  onSelect: () => void;
  onClaim: () => void;
  onEarn?: () => void;
}) {
  const keep = item.netProfit ?? marketSpread(item);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    /* remount float stagger via index */
  }, [item.id]);

  return (
    <article
      className={cn(
        "group relative flex flex-col bg-white text-left transition",
        selected
          ? "ring-2 ring-[#0c0c0c]"
          : "ring-1 ring-[#e5e5e5] hover:ring-[#0c0c0c]/35",
      )}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        onClick={onSelect}
        className="relative block w-full text-left"
      >
        <div className="relative aspect-square bg-[#f7f7f7]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.photo}
            alt=""
            className="size-full object-contain p-3 transition duration-500 group-hover:scale-[1.03]"
            loading="lazy"
          />
          <RevenueFloat amount={keep} delay={(index % 6) * 0.18} />
          {item.real ? (
            <span className="absolute top-2 left-2 z-[1] bg-[#3665F3] px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white uppercase">
              Winner
            </span>
          ) : null}
        </div>
        <div className="space-y-2 border-t border-[#f0f0f0] px-3 pt-3 pb-2">
          <p className="line-clamp-2 min-h-[2.5rem] text-[13px] leading-snug text-[#0c0c0c]">
            {item.title}
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-[18px] font-semibold tabular-nums text-[#0c0c0c]">
              {money(item.sell)}
            </span>
            <span className="text-[12px] text-[#9ca3af] line-through tabular-nums">
              {money(item.comps)}
            </span>
          </div>
          <p className="text-[11px] text-[#565959]">
            Est. cost {money(item.buy)} · {item.ships}
          </p>
          <StoreLane />
        </div>
      </button>
      <div className="mt-auto flex gap-1.5 border-t border-[#f0f0f0] p-2.5">
        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onClaim();
          }}
          className={cn(
            "h-9 flex-1 text-[11px] font-semibold tracking-wide uppercase transition",
            hover || selected
              ? "bg-[#0c0c0c] text-white"
              : "bg-[#f5f5f5] text-[#0c0c0c] hover:bg-[#0c0c0c] hover:text-white",
          )}
        >
          {busy ? "Adding…" : "Add to store"}
        </button>
        {item.asin && onEarn ? (
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onEarn();
            }}
            className="h-9 px-3 text-[11px] font-semibold tracking-wide text-[#0c0c0c] uppercase ring-1 ring-[#e5e5e5] hover:ring-[#0c0c0c] disabled:opacity-50"
          >
            Earn
          </button>
        ) : null}
      </div>
    </article>
  );
}
