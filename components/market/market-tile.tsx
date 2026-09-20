"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  AmazonMark,
  EbayMark,
  HomeDepotMark,
  WalmartMark,
} from "@/components/brand/store-marks";
import type { MarketDropPublic } from "@/lib/market/from-opportunity";
import { marketSpread } from "@/lib/market/catalog";
import { cn } from "@/lib/utils";

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function signed(n: number) {
  const abs = money(Math.abs(n));
  return n >= 0 ? `+${abs}` : `−${abs}`;
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
  const isAmz = item.lane === "amazon";
  const keep = item.netProfit ?? marketSpread(item);
  const demand = item.demandScore ?? item.score ?? 0;
  const reduce = useReducedMotion() ?? false;
  const amazon = item.amazonPrice ?? (isAmz ? item.sell : item.buy);
  const ebay = item.ebayPrice ?? (item.lane === "arbitrage" ? item.sell : null);
  const walmart = item.walmartPrice;
  const homedepot = item.homedepotPrice;

  return (
    <motion.article
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 10) * 0.04, duration: 0.28 }}
      className={cn(
        "group flex flex-col bg-white text-left",
        selected
          ? "ring-2 ring-[#141414]"
          : "ring-1 ring-[#e5e1d8] hover:ring-[#141414]/45",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-h-0 flex-1 flex-col text-left"
      >
        <div className="relative aspect-[5/4] shrink-0 overflow-hidden bg-[#f4f1eb]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.photo}
            alt=""
            className="size-full object-contain p-3 transition duration-400 group-hover:scale-[1.03]"
            loading="lazy"
          />
          <span className="absolute top-2 left-2 bg-[#f4c928] px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-[#141414] uppercase">
            {isAmz
              ? "Sell Amazon"
              : item.lane === "retail"
                ? "Retail"
                : "Arbitrage"}
          </span>
          <span className="absolute top-2 right-2 bg-[#141414] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[#f4c928]">
            {isAmz ? `D${demand}` : signed(keep)}
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-2 px-3 pt-2.5 pb-3">
          <p className="line-clamp-2 min-h-[2.4rem] text-[13px] leading-snug text-[#141414]">
            {item.title}
          </p>

          {!isAmz && item.netProfit != null ? (
            <p className="font-display text-[22px] leading-none tabular-nums text-[#1f7a4d]">
              {signed(keep)}
              <span className="ml-1.5 text-[11px] font-sans font-semibold tracking-wide text-[#6b6560] uppercase">
                you keep
              </span>
            </p>
          ) : (
            <p className="font-display text-[22px] leading-none tabular-nums">
              {money(item.sell)}
            </p>
          )}

          {/* Prices per platform */}
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <div className="bg-[#f7f4ef] px-1.5 py-1.5">
              <div className="flex items-center gap-1">
                <AmazonMark className="h-2.5" />
                <p className="text-[8px] font-semibold tracking-wide text-[#8a847c] uppercase">
                  Amazon
                </p>
              </div>
              <p className="mt-0.5 text-[12px] font-semibold tabular-nums">
                {money(amazon)}
              </p>
            </div>
            <div className="bg-[#f7f4ef] px-1.5 py-1.5">
              <div className="flex items-center gap-1">
                <EbayMark className="h-2.5" />
                <p className="text-[8px] font-semibold tracking-wide text-[#8a847c] uppercase">
                  eBay
                </p>
              </div>
              <p className="mt-0.5 text-[12px] font-semibold tabular-nums">
                {money(ebay)}
              </p>
            </div>
            <div className="bg-[#f7f4ef] px-1.5 py-1.5">
              <div className="flex items-center gap-1">
                <WalmartMark className="h-2.5" />
                <p className="text-[8px] font-semibold tracking-wide text-[#8a847c] uppercase">
                  Walmart
                </p>
              </div>
              <p className="mt-0.5 text-[12px] font-semibold tabular-nums">
                {money(walmart)}
              </p>
            </div>
            <div className="bg-[#f7f4ef] px-1.5 py-1.5">
              <div className="flex items-center gap-1">
                <HomeDepotMark className="h-2.5" />
                <p className="text-[8px] font-semibold tracking-wide text-[#8a847c] uppercase">
                  HD
                </p>
              </div>
              <p className="mt-0.5 text-[12px] font-semibold tabular-nums">
                {money(homedepot)}
              </p>
            </div>
          </div>

          {item.bsrDrops90 != null ? (
            <p className="text-[11px] text-[#6b6560]">
              {item.bsrDrops90} Keepa drops / 90d
            </p>
          ) : null}
        </div>
      </button>

      <div className="mt-auto flex gap-1 border-t border-[#efeae2] p-2">
        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onClaim();
          }}
          className="h-8 flex-1 bg-[#141414] text-[11px] font-semibold text-white hover:bg-[#2a2a2a] disabled:opacity-50"
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
            className="h-8 px-2.5 text-[11px] font-semibold text-[#141414] ring-1 ring-[#d5d0c8] hover:ring-[#141414] disabled:opacity-50"
          >
            Earn
          </button>
        ) : null}
      </div>
    </motion.article>
  );
}
