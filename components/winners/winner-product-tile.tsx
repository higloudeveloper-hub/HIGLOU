"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import {
  BadgeCheck,
  Check,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type PlatformPriceCell = {
  key: string;
  label: string;
  price: number | null;
  url?: string | null;
};

export type WinnerTileModel = {
  id: string;
  title: string;
  brand?: string;
  imageUrl?: string | null;
  badge: "Verificado" | "Tendencia" | "Hot";
  platforms: PlatformPriceCell[];
  keep: number | null;
  demand: number | null;
  showDemand: boolean;
  isNew?: boolean;
  selected?: boolean;
  amazonUrl?: string | null;
  ebayUrl?: string | null;
  walmartUrl?: string | null;
  homedepotUrl?: string | null;
  meta?: string;
  bsrDrops?: number | null;
};

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

const EASE = [0.22, 1, 0.36, 1] as const;

export function WinnerProductTile({
  item,
  index,
  locked,
  onOpen,
  onToggleSelect,
  onSkip,
}: {
  item: WinnerTileModel;
  index: number;
  locked?: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
  onSkip: () => void;
}) {
  const reduce = useReducedMotion();
  const score = item.showDemand
    ? Math.round(item.demand ?? 0)
    : item.keep != null
      ? Math.round(item.keep)
      : null;
  const priced = item.platforms.filter((p) => p.price != null).length;

  return (
    <motion.article
      layout
      initial={reduce ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: Math.min(index * 0.06, 0.4),
        ease: EASE,
      }}
      whileHover={
        reduce
          ? undefined
          : {
              y: -5,
              transition: { type: "spring", stiffness: 400, damping: 28 },
            }
      }
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border bg-white",
        item.selected
          ? "border-[#3665F3] shadow-[0_0_0_1px_#3665F3]"
          : "border-[#e8e8e8] hover:border-[#d0d0d0] hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)]",
      )}
    >
      {/* Hover sheen */}
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
          {item.imageUrl ? (
            <motion.div
              className="absolute inset-0"
              whileHover={reduce ? undefined : { scale: 1.03 }}
              transition={{ duration: 0.45, ease: EASE }}
            >
              <Image
                src={item.imageUrl}
                alt=""
                fill
                className="object-contain p-5"
                unoptimized
              />
            </motion.div>
          ) : (
            <div className="flex h-full items-center justify-center text-[11px] text-[#b0b0b0]">
              Sin foto
            </div>
          )}

          {/* Verified chip — small, serious */}
          <div className="absolute top-2.5 left-2.5">
            <motion.span
              initial={reduce ? false : { opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.12 + index * 0.04, ease: EASE }}
              className="inline-flex items-center gap-1 rounded-md border border-[#e5e5e5] bg-white/95 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[#191919] shadow-sm backdrop-blur-sm"
            >
              <BadgeCheck className="size-3 text-[#3665F3]" strokeWidth={2.25} />
              {item.badge}
            </motion.span>
          </div>

          {/* Score — compact, not a giant green block */}
          {score != null ? (
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 + index * 0.04, ease: EASE }}
              className="absolute right-2.5 bottom-2.5 flex items-baseline gap-1 rounded-md border border-[#e5e5e5] bg-white/95 px-2 py-1 shadow-sm backdrop-blur-sm"
            >
              <span className="text-[11px] font-medium tracking-wide text-[#8a8a8a] uppercase">
                {item.showDemand ? "Score" : "Keep"}
              </span>
              <span className="text-[13px] font-semibold tabular-nums text-[#191919]">
                {item.showDemand ? score : money(score)}
              </span>
            </motion.div>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col gap-2.5 px-3 pt-3 pb-2.5">
          <div>
            <p className="line-clamp-2 min-h-[2.5em] text-[13px] leading-snug font-medium text-[#191919]">
              {item.title}
            </p>
            {item.brand || item.meta ? (
              <p className="mt-1 truncate text-[11px] text-[#8a8a8a]">
                {[item.brand, item.meta].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>

          {/* Platform prices — pro data table feel */}
          <div className="mt-auto overflow-hidden rounded-lg border border-[#ebebeb]">
            <div className="flex items-center justify-between border-b border-[#ebebeb] bg-[#fafafa] px-2 py-1">
              <span className="text-[9px] font-semibold tracking-[0.12em] text-[#8a8a8a] uppercase">
                Precios verificados
              </span>
              <span className="text-[9px] font-medium tabular-nums text-[#707070]">
                {priced} fuentes
              </span>
            </div>
            <div className="grid grid-cols-4 divide-x divide-[#ebebeb] bg-white">
              {item.platforms.map((p, i) => (
                <motion.div
                  key={p.key}
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 + i * 0.05, duration: 0.3 }}
                  className="px-1 py-2 text-center"
                >
                  <p className="text-[8px] font-semibold tracking-wide text-[#a0a0a0] uppercase">
                    {p.label}
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 text-[12px] font-semibold tabular-nums",
                      p.price != null ? "text-[#191919]" : "text-[#d0d0d0]",
                    )}
                  >
                    {money(p.price)}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </button>

      <div className="relative z-[1] flex items-center gap-0.5 border-t border-[#f0f0f0] px-1.5 py-1">
        <button
          type="button"
          disabled={locked}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-md transition",
            item.selected
              ? "bg-[#3665F3] text-white"
              : "text-[#a0a0a0] hover:bg-[#f5f5f5] hover:text-[#191919]",
          )}
          aria-label={item.selected ? "Quitar selección" : "Seleccionar"}
        >
          <Check className="size-3.5" strokeWidth={2.5} />
        </button>
        {item.amazonUrl ? (
          <a
            href={item.amazonUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-[#555] hover:bg-[#f5f5f5] hover:text-[#191919]"
          >
            Amazon
            <ExternalLink className="size-2.5 opacity-50" />
          </a>
        ) : null}
        {item.ebayUrl ? (
          <a
            href={item.ebayUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-[#555] hover:bg-[#f5f5f5] hover:text-[#191919]"
          >
            eBay
            <ExternalLink className="size-2.5 opacity-50" />
          </a>
        ) : null}
        <button
          type="button"
          disabled={locked}
          onClick={(e) => {
            e.stopPropagation();
            onSkip();
          }}
          className="ml-auto inline-flex size-8 items-center justify-center rounded-md text-[#a0a0a0] hover:bg-[#f5f5f5] hover:text-[#191919] disabled:opacity-40"
          aria-label="Descartar"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </motion.article>
  );
}
