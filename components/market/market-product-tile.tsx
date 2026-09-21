"use client";

import { motion, useReducedMotion } from "motion/react";
import { BadgeCheck, Banknote, ExternalLink, Store } from "lucide-react";
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

const EASE = [0.22, 1, 0.36, 1] as const;

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
  const scoreValue =
    showKeep && pricing.mode === "spread"
      ? signed(pricing.keep)
      : String(Math.round(demand));
  const scoreLabel =
    showKeep && pricing.mode === "spread" ? "Keep" : "Score";

  return (
    <motion.article
      layout
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.35,
        delay: Math.min(index * 0.035, 0.28),
        ease: EASE,
      }}
      whileHover={
        reduce
          ? undefined
          : {
              y: -4,
              transition: { type: "spring", stiffness: 400, damping: 28 },
            }
      }
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border bg-white",
        selected
          ? "border-[#3665F3] shadow-[0_0_0_1px_#3665F3]"
          : "border-[#e8e8e8] hover:border-[#d0d0d0] hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)]",
      )}
    >
      {!reduce ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-br from-white/0 via-white/40 to-white/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ mixBlendMode: "overlay" }}
        />
      ) : null}

      <button
        type="button"
        onClick={onOpen}
        className="relative z-[1] flex flex-1 flex-col text-left"
      >
        {/* Image — pure white, no cream */}
        <div className="relative aspect-[5/4] overflow-hidden border-b border-[#f0f0f0] bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.photo}
            alt=""
            className="size-full object-contain p-5 transition duration-500 group-hover:scale-[1.03]"
            loading="lazy"
          />

          <div className="absolute top-2.5 left-2.5 flex max-w-[72%] flex-wrap gap-1">
            <span className="inline-flex items-center gap-1 rounded-md border border-[#e5e5e5] bg-white/95 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[#191919] shadow-sm backdrop-blur-sm">
              <BadgeCheck className="size-3 text-[#3665F3]" strokeWidth={2.25} />
              {play.badge}
            </span>
          </div>

          {trend.level === "hot" ? (
            <div className="absolute top-2.5 right-2.5">
              <span className="rounded-md border border-[#e5e5e5] bg-[#191919] px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase shadow-sm">
                Hot
              </span>
            </div>
          ) : null}

          {/* Score — compact neutral chip, never green blob */}
          <div className="absolute right-2.5 bottom-2.5 flex items-baseline gap-1 rounded-md border border-[#e5e5e5] bg-white/95 px-2 py-1 shadow-sm backdrop-blur-sm">
            <span className="text-[11px] font-medium tracking-wide text-[#8a8a8a] uppercase">
              {scoreLabel}
            </span>
            <span className="text-[13px] font-semibold tabular-nums text-[#191919]">
              {scoreValue}
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2.5 px-3 pt-3 pb-2.5">
          <div>
            <p className="line-clamp-2 min-h-[2.5em] text-[13px] leading-snug font-medium text-[#191919]">
              {item.title}
            </p>
            <p className="mt-1 truncate text-[11px] text-[#8a8a8a]">
              {[item.name, item.asin].filter(Boolean).join(" · ")}
              {item.asin || item.name ? " · " : ""}
              analizado
            </p>
          </div>

          {/* Trend — thin black bar, no green */}
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-[9px] font-semibold tracking-[0.12em] text-[#8a8a8a] uppercase">
                Tendencia
              </p>
              <p className="truncate text-[10px] text-[#707070]">{trend.detail}</p>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-[#f0f0f0]">
              <motion.div
                className="h-full rounded-full bg-[#191919]"
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${trend.progress}%` }}
                transition={{
                  duration: 0.7,
                  delay: Math.min(index * 0.04, 0.3),
                  ease: EASE,
                }}
              />
            </div>
          </div>

          {/* Pricing table */}
          <div className="mt-auto overflow-hidden rounded-lg border border-[#ebebeb]">
            {pricing.mode === "spread" ? (
              <div className="grid grid-cols-3 divide-x divide-[#ebebeb] bg-white">
                <div className="px-2 py-2">
                  <p className="text-[8px] font-semibold tracking-wide text-[#a0a0a0] uppercase">
                    Compra
                  </p>
                  <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-[#191919]">
                    {money(pricing.buy)}
                  </p>
                </div>
                <div className="px-2 py-2 text-center">
                  <p className="text-[8px] font-semibold tracking-wide text-[#a0a0a0] uppercase">
                    Venta
                  </p>
                  <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-[#191919]">
                    {money(pricing.sell)}
                  </p>
                </div>
                <div className="px-2 py-2 text-right">
                  <p className="text-[8px] font-semibold tracking-wide text-[#a0a0a0] uppercase">
                    Keep
                  </p>
                  <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-[#191919]">
                    {signed(pricing.keep)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-end justify-between gap-2 bg-white px-2.5 py-2.5">
                <div>
                  <p className="text-[8px] font-semibold tracking-wide text-[#a0a0a0] uppercase">
                    {pricing.label}
                  </p>
                  <p className="mt-0.5 text-[18px] font-semibold leading-none tabular-nums text-[#191919]">
                    {money(pricing.price)}
                  </p>
                </div>
                <p className="pb-0.5 text-right text-[10px] leading-snug text-[#8a8a8a]">
                  {play.play === "sell_amazon"
                    ? "Buy Box · listar Amazon"
                    : "Precio verificado"}
                </p>
              </div>
            )}
          </div>
        </div>
      </button>

      <div className="relative z-[1] flex items-center gap-0.5 border-t border-[#f0f0f0] px-1.5 py-1">
        {amazonHref ? (
          <a
            href={amazonHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-[#555] hover:bg-[#f5f5f5] hover:text-[#191919]"
            title={hasAffiliate ? "Amazon con tu tag affiliate" : "Abrir Amazon"}
          >
            Amazon
            <ExternalLink className="size-2.5 opacity-50" />
          </a>
        ) : null}
        {item.platformUrls?.ebay && play.play !== "sell_amazon" ? (
          <a
            href={item.platformUrls.ebay}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-[#555] hover:bg-[#f5f5f5] hover:text-[#191919]"
          >
            eBay
            <ExternalLink className="size-2.5 opacity-50" />
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
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-[#555] hover:bg-[#f5f5f5] hover:text-[#191919] disabled:opacity-40"
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
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md bg-[#3665F3] px-2.5 text-[11px] font-semibold text-white hover:bg-[#2f5ae0] disabled:opacity-40"
        >
          <Store className="size-3" />
          {busy ? "…" : play.play === "sell_amazon" ? "Listar" : "Tienda"}
        </button>
      </div>
    </motion.article>
  );
}
