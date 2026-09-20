"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  AmazonMark,
  EbayMark,
  HomeDepotMark,
  WalmartMark,
} from "@/components/brand/store-marks";
import { PriceDrop } from "@/components/market/price-drop";
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

function signed(n: number) {
  const abs = money(Math.abs(n));
  return n >= 0 ? `+${abs}` : `−${abs}`;
}

function KeepFloat({
  amount,
  delay = 0,
  label = "You keep",
}: {
  amount: number | string;
  delay?: number;
  label?: string;
}) {
  const reduce = useReducedMotion() ?? false;
  return (
    <motion.div
      className="pointer-events-none absolute top-2.5 right-2.5 z-[2]"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={
        reduce
          ? { opacity: 1 }
          : { opacity: [0, 1, 1, 0.9], y: [8, 0, -2, 0] }
      }
      transition={{
        duration: 2.2,
        delay,
        repeat: reduce ? 0 : Infinity,
        repeatDelay: 2.4,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <div className="bg-[#141414] px-2 py-1.5 shadow-[0_10px_28px_rgba(20,20,20,0.28)]">
        <p className="text-[9px] font-semibold tracking-[0.14em] text-white/55 uppercase">
          {label}
        </p>
        <p className="font-display text-[18px] leading-none tabular-nums text-[#f4c928]">
          {typeof amount === "number" ? signed(amount) : amount}
        </p>
      </div>
    </motion.div>
  );
}

function LaneBadge({ lane }: { lane: MarketDropPublic["lane"] }) {
  const text =
    lane === "amazon"
      ? "Sell on Amazon"
      : lane === "retail"
        ? "Retail route"
        : "Amazon → eBay";
  return (
    <span className="absolute top-2.5 left-2.5 z-[1] bg-[#f4c928] px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-[#141414] uppercase">
      {text}
    </span>
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
  const isAmz = item.lane === "amazon";
  const keep = item.netProfit ?? marketSpread(item);
  const demand = item.demandScore ?? item.score ?? 0;
  const reduce = useReducedMotion() ?? false;
  const cut =
    !isAmz && item.comps > item.sell
      ? Math.round(((item.comps - item.sell) / item.comps) * 100)
      : 0;

  return (
    <motion.article
      layout
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.05, duration: 0.35 }}
      className={cn(
        "group relative flex flex-col overflow-hidden bg-white text-left",
        selected
          ? "ring-2 ring-[#141414]"
          : "ring-1 ring-[#e8e4dc] hover:ring-[#141414]/40",
      )}
    >
      <button type="button" onClick={onSelect} className="block w-full text-left">
        <div className="relative aspect-square overflow-hidden bg-[#f3f0ea]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.photo}
            alt=""
            className="size-full object-contain p-4 transition duration-500 group-hover:scale-[1.04]"
            loading="lazy"
          />
          <LaneBadge lane={item.lane} />
          {isAmz ? (
            <KeepFloat
              amount={`D${demand}`}
              delay={(index % 5) * 0.15}
              label="Keepa demand"
            />
          ) : (
            <KeepFloat amount={keep} delay={(index % 5) * 0.15} />
          )}
        </div>

        <div className="space-y-2.5 border-t border-[#efeae2] px-3 pt-3 pb-3">
          <p className="line-clamp-2 min-h-[2.6rem] text-[13px] font-medium leading-snug text-[#141414]">
            {item.title}
          </p>

          {isAmz ? (
            <div>
              <p className="font-display text-[26px] leading-none tabular-nums">
                {money(item.sell)}
              </p>
              <p className="mt-1 text-[11px] text-[#6b6560]">
                Amazon buy box
                {item.bsrDrops90 != null
                  ? ` · ${item.bsrDrops90} drops/90d`
                  : ""}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-end gap-2">
                <PriceDrop from={item.comps} to={item.sell} size="sm" />
                {cut > 0 ? (
                  <span className="mb-0.5 text-[11px] font-semibold text-[#c45c26]">
                    −{cut}% vs comps
                  </span>
                ) : null}
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-center">
                <div className="bg-[#f7f4ef] px-1 py-1.5">
                  <p className="text-[9px] font-semibold tracking-wide text-[#8a847c] uppercase">
                    Buy
                  </p>
                  <p className="text-[12px] font-semibold tabular-nums">
                    {money(item.buy)}
                  </p>
                </div>
                <div className="bg-[#f7f4ef] px-1 py-1.5">
                  <p className="text-[9px] font-semibold tracking-wide text-[#8a847c] uppercase">
                    Sell
                  </p>
                  <p className="text-[12px] font-semibold tabular-nums">
                    {money(item.sell)}
                  </p>
                </div>
                <div className="bg-[#141414] px-1 py-1.5 text-white">
                  <p className="text-[9px] font-semibold tracking-wide text-[#f4c928]/80 uppercase">
                    Keep
                  </p>
                  <p className="text-[12px] font-semibold tabular-nums text-[#f4c928]">
                    {signed(keep)}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 opacity-70">
            <AmazonMark className="h-2.5" />
            <EbayMark className="h-2" />
            <WalmartMark className="h-2" />
            <HomeDepotMark className="h-2.5" />
          </div>
        </div>
      </button>

      <div className="mt-auto flex gap-1.5 border-t border-[#efeae2] p-2.5">
        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onClaim();
          }}
          className="h-9 flex-1 bg-[#141414] text-[11px] font-semibold tracking-wide text-white uppercase transition hover:bg-[#2a2a2a] disabled:opacity-50"
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
            className="h-9 px-3 text-[11px] font-semibold tracking-wide text-[#141414] uppercase ring-1 ring-[#d5d0c8] hover:ring-[#141414] disabled:opacity-50"
          >
            Earn
          </button>
        ) : null}
      </div>
    </motion.article>
  );
}
