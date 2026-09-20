"use client";

import { motion, useReducedMotion } from "motion/react";
import { Banknote, ExternalLink, ShieldCheck, Store } from "lucide-react";
import type { MarketDropPublic } from "@/lib/market/from-opportunity";
import {
  hasArbitrageKeep,
  marketPlay,
  marketTilePricing,
  marketTrend,
} from "@/lib/market/route-intent";
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

function trendTone(level: ReturnType<typeof marketTrend>["level"]) {
  if (level === "hot") return "bg-[#c43c1a] text-white";
  if (level === "high") return "bg-[#1f7a4d] text-white";
  if (level === "rising") return "bg-[#2162a1] text-white";
  return "bg-[#ebe7e0] text-[#5a554e]";
}

function trendBar(level: ReturnType<typeof marketTrend>["level"]) {
  if (level === "hot") return "bg-[#c43c1a]";
  if (level === "high") return "bg-[#1f7a4d]";
  if (level === "rising") return "bg-[#2162a1]";
  return "bg-[#a8a29a]";
}

function playTone(play: ReturnType<typeof marketPlay>["play"]) {
  if (play === "sell_amazon") return "bg-[#fff3c4]/95 text-[#7a5c00]";
  if (play === "source_supply") return "bg-[#e8eef8]/95 text-[#2a4a7a]";
  return "bg-[#e8f5ee]/95 text-[#1a6b45]";
}

export function MarketProductTile({
  item,
  index,
  selected,
  busy,
  affBusy,
  onOpen,
  onClaim,
  onEarn,
}: {
  item: MarketDropPublic;
  index: number;
  selected?: boolean;
  busy?: boolean;
  affBusy?: boolean;
  onOpen: () => void;
  onClaim: () => void;
  onEarn?: () => void;
}) {
  const reduce = useReducedMotion();
  const play = marketPlay(item);
  const trend = marketTrend(item);
  const pricing = marketTilePricing(item);
  const showKeep = hasArbitrageKeep(item);
  const amazonHref = item.affiliateUrl || item.platformUrls?.amazon || null;
  const hasAffiliate = Boolean(item.affiliateUrl);
  const demand = item.demandScore ?? item.score ?? 0;

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
          <div className="absolute top-2.5 left-2.5 flex max-w-[70%] flex-wrap gap-1">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase backdrop-blur-sm",
                playTone(play.play),
              )}
            >
              {play.badge}
            </span>
          </div>
          <div className="absolute top-2.5 right-2.5">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase backdrop-blur-sm",
                trendTone(trend.level),
              )}
            >
              {trend.label}
            </span>
          </div>
          <div
            className={cn(
              "absolute right-2.5 bottom-2.5 rounded-xl px-2.5 py-1.5 shadow-sm backdrop-blur-md",
              showKeep || demand >= 55
                ? "bg-[#1f7a4d]/95 text-white"
                : "bg-white/95 text-[#141414]",
            )}
          >
            {showKeep && pricing.mode === "spread" ? (
              <>
                <p className="font-display text-[20px] leading-none tabular-nums">
                  {signed(pricing.keep)}
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
                  Score
                </p>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2.5 px-3.5 pt-3 pb-2.5">
          <div>
            <p className="line-clamp-2 min-h-[2.6em] text-[13px] leading-snug font-medium text-[#1a1a1a]">
              {item.title}
            </p>
            <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-[#8a847c]">
              <ShieldCheck className="size-3 shrink-0 text-[#1f7a4d]" />
              <span className="truncate">
                {[item.name, item.asin].filter(Boolean).join(" · ")} · analizado
              </span>
            </p>
            <p className="mt-0.5 truncate text-[11px] font-medium text-[#5a554e]">
              {play.hint}
            </p>
          </div>

          {/* Trend progress — verified Keepa velocity */}
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-[9px] font-semibold tracking-[0.12em] text-[#8a847c] uppercase">
                Tendencia
              </p>
              <p className="truncate text-[10px] text-[#6b6560]">{trend.detail}</p>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#efeae2]">
              <motion.div
                className={cn("h-full rounded-full", trendBar(trend.level))}
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${trend.progress}%` }}
                transition={{
                  duration: 0.7,
                  delay: Math.min(index * 0.04, 0.3),
                  ease: [0.22, 1, 0.36, 1],
                }}
              />
            </div>
          </div>

          {/* Pricing — never fake Compra = Venta */}
          <div className="mt-auto border-t border-[#f0ebe3] pt-2.5">
            {pricing.mode === "spread" ? (
              <div className="grid grid-cols-3 gap-1">
                <div>
                  <p className="text-[9px] font-semibold tracking-wider text-[#8a847c] uppercase">
                    Compra
                  </p>
                  <p className="mt-0.5 text-[15px] font-semibold tabular-nums">
                    {money(pricing.buy)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[9px] font-semibold tracking-wider text-[#8a847c] uppercase">
                    Venta
                  </p>
                  <p className="mt-0.5 text-[15px] font-semibold tabular-nums">
                    {money(pricing.sell)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-semibold tracking-wider text-[#1f7a4d] uppercase">
                    Keep
                  </p>
                  <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-[#1f7a4d]">
                    {signed(pricing.keep)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="text-[9px] font-semibold tracking-wider text-[#8a847c] uppercase">
                    {pricing.label}
                  </p>
                  <p className="mt-0.5 font-display text-[22px] leading-none tabular-nums">
                    {money(pricing.price)}
                  </p>
                </div>
                <p className="pb-0.5 text-right text-[10px] leading-snug text-[#8a847c]">
                  {play.play === "sell_amazon"
                    ? "Precio Buy Box · listar Amazon"
                    : "Precio verificado"}
                </p>
              </div>
            )}
          </div>
        </div>
      </button>

      <div className="flex items-center gap-1 border-t border-[#f0ebe3] px-2 py-1.5">
        {amazonHref ? (
          <a
            href={amazonHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-[#2162a1] hover:bg-[#f0f5fa]"
            title={hasAffiliate ? "Amazon con tu tag affiliate" : "Abrir Amazon"}
          >
            Amazon
            <ExternalLink className="size-3 opacity-60" />
          </a>
        ) : null}
        {item.platformUrls?.ebay && play.play !== "sell_amazon" ? (
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
        {onEarn && item.asin ? (
          <button
            type="button"
            disabled={affBusy}
            onClick={(e) => {
              e.stopPropagation();
              onEarn();
            }}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-[#1f7a4d] hover:bg-[#e8f5ee] disabled:opacity-40"
            title="Abrir + copiar link affiliate"
          >
            <Banknote className="size-3" />
            {affBusy ? "…" : "Ganar"}
          </button>
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
          {busy ? "…" : play.play === "sell_amazon" ? "Listar" : "Tienda"}
        </button>
      </div>
    </motion.article>
  );
}
