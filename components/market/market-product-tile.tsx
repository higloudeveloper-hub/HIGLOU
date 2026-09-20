"use client";

import { motion, useReducedMotion } from "motion/react";
import { ExternalLink, Store } from "lucide-react";
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
  return n >= 0 ? `+${abs}` : `−${abs.replace("-", "")}`;
}

function laneLabel(lane: MarketDropPublic["lane"]) {
  if (lane === "amazon") return "Amazon";
  if (lane === "retail") return "Retail";
  return "Arbitraje";
}

export function MarketProductTile({
  item,
  index,
  selected,
  busy,
  onOpen,
  onClaim,
}: {
  item: MarketDropPublic;
  index: number;
  selected?: boolean;
  busy?: boolean;
  onOpen: () => void;
  onClaim: () => void;
}) {
  const reduce = useReducedMotion();
  const keep = item.netProfit ?? marketSpread(item);
  const showKeep = item.lane !== "amazon" && keep > 0;
  const demand = item.demandScore ?? item.score ?? 0;
  const signalGood = showKeep ? keep >= 12 : demand >= 55;

  return (
    <motion.article
      layout
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.35,
        delay: Math.min(index * 0.035, 0.28),
        ease: [0.22, 1, 0.36, 1],
      }}
      whileHover={reduce ? undefined : { y: -3 }}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-[0_1px_0_rgba(20,20,20,0.04)] transition-[border-color,box-shadow]",
        selected
          ? "border-[#141414] shadow-[0_8px_28px_rgba(20,20,20,0.08)]"
          : "border-[#ebe7e0] hover:border-[#cfc9bf] hover:shadow-[0_12px_32px_rgba(20,20,20,0.07)]",
      )}
    >
      <button type="button" onClick={onOpen} className="flex flex-1 flex-col text-left">
        <div className="relative aspect-[4/3] overflow-hidden bg-[#f4f2ed]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.photo}
            alt=""
            className="size-full object-contain p-4 transition duration-500 group-hover:scale-[1.03]"
            loading="lazy"
          />
          <div className="absolute top-2.5 left-2.5">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase backdrop-blur-sm",
                item.lane === "arbitrage"
                  ? "bg-[#e8f5ee]/95 text-[#1a6b45]"
                  : item.lane === "amazon"
                    ? "bg-[#fff3c4]/95 text-[#7a5c00]"
                    : "bg-[#e8eef8]/95 text-[#2a4a7a]",
              )}
            >
              {laneLabel(item.lane)}
            </span>
          </div>
          <div
            className={cn(
              "absolute right-2.5 bottom-2.5 rounded-xl px-2.5 py-1.5 shadow-sm backdrop-blur-md",
              signalGood ? "bg-[#1f7a4d]/95 text-white" : "bg-white/95 text-[#141414]",
            )}
          >
            {showKeep ? (
              <>
                <p className="font-display text-[20px] leading-none tabular-nums">
                  {signed(keep)}
                </p>
                <p className="mt-0.5 text-[9px] font-semibold tracking-wider uppercase opacity-80">
                  Keep
                </p>
              </>
            ) : (
              <>
                <p className="font-display text-[20px] leading-none tabular-nums">
                  {Math.round(demand)}
                </p>
                <p className="mt-0.5 text-[9px] font-semibold tracking-wider uppercase opacity-80">
                  Demand
                </p>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2 px-3.5 pt-3 pb-2">
          <p className="line-clamp-2 min-h-[2.6em] text-[13px] leading-snug font-medium text-[#1a1a1a]">
            {item.title}
          </p>
          <p className="truncate text-[11px] text-[#8a847c]">
            {[item.name, item.asin, item.ships].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-auto grid grid-cols-2 gap-2 border-t border-[#f0ebe3] pt-2.5">
            <div>
              <p className="text-[9px] font-semibold tracking-wider text-[#8a847c] uppercase">
                Compra
              </p>
              <p className="mt-0.5 text-[15px] font-semibold tabular-nums">
                {money(item.buy)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-semibold tracking-wider text-[#8a847c] uppercase">
                Venta
              </p>
              <p className="mt-0.5 text-[15px] font-semibold tabular-nums">
                {money(item.sell)}
              </p>
            </div>
          </div>
        </div>
      </button>

      <div className="flex items-center gap-1 border-t border-[#f0ebe3] px-2 py-1.5">
        {item.platformUrls?.amazon ? (
          <a
            href={item.platformUrls.amazon}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-[#2162a1] hover:bg-[#f0f5fa]"
          >
            Amazon
            <ExternalLink className="size-3 opacity-60" />
          </a>
        ) : null}
        {item.platformUrls?.ebay ? (
          <a
            href={item.platformUrls.ebay}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-[#2162a1] hover:bg-[#f0f5fa]"
          >
            eBay
            <ExternalLink className="size-3 opacity-60" />
          </a>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onClaim();
          }}
          className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg bg-[#f4c928] px-2.5 text-[11px] font-semibold text-[#141414] hover:bg-[#efbf1a] disabled:opacity-40"
        >
          <Store className="size-3" />
          {busy ? "…" : "Tienda"}
        </button>
      </div>
    </motion.article>
  );
}
