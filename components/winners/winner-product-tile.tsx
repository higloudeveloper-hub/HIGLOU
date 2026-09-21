"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import {
  BadgeCheck,
  Check,
  ExternalLink,
  Flame,
  Trash2,
  TrendingUp,
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
  /** Short status chip */
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

function signed(n: number) {
  const abs = money(Math.abs(n));
  return n >= 0 ? `+${abs}` : `−${abs.replace("-", "")}`;
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
  const signalGood = item.showDemand
    ? (item.demand ?? 0) >= 55
    : (item.keep ?? 0) >= 12;
  const priced = item.platforms.filter((p) => p.price != null).length;

  return (
    <motion.article
      layout
      initial={reduce ? false : { opacity: 0, y: 22, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.45,
        delay: Math.min(index * 0.05, 0.35),
        ease: EASE,
      }}
      whileHover={reduce ? undefined : { y: -4 }}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-[0_1px_0_rgba(20,20,20,0.04)] transition-[border-color,box-shadow]",
        item.selected
          ? "border-[#3665F3] shadow-[0_12px_36px_rgba(54,101,243,0.18)] ring-2 ring-[#3665F3]/25"
          : "border-[#e5e5e5] hover:border-[#c8c8c8] hover:shadow-[0_16px_40px_rgba(20,20,20,0.08)]",
        item.isNew && "ring-2 ring-[#f4c928]/60",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-1 flex-col text-left"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-[#f7f7f7]">
          {item.imageUrl ? (
            <Image
              src={item.imageUrl}
              alt=""
              fill
              className="object-contain p-4 transition duration-500 group-hover:scale-[1.04]"
              unoptimized
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[12px] text-[#a8a8a8]">
              Sin foto
            </div>
          )}

          {!reduce ? (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#3665F3]/50 to-transparent"
              animate={{ opacity: [0.2, 0.8, 0.2] }}
              transition={{ duration: 2.4, repeat: Infinity }}
            />
          ) : null}

          <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase backdrop-blur-sm",
                item.badge === "Hot"
                  ? "bg-[#ff6b35]/95 text-white"
                  : item.badge === "Tendencia"
                    ? "bg-[#3665F3]/95 text-white"
                    : "bg-[#1f7a4d]/95 text-white",
              )}
            >
              {item.badge === "Verificado" ? (
                <BadgeCheck className="size-3" />
              ) : item.badge === "Hot" ? (
                <Flame className="size-3" />
              ) : (
                <TrendingUp className="size-3" />
              )}
              {item.badge}
            </span>
            {item.isNew ? (
              <motion.span
                initial={reduce ? false : { scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="rounded-full bg-[#191919]/90 px-2 py-0.5 text-[10px] font-semibold text-[#f4c928] uppercase"
              >
                Nueva
              </motion.span>
            ) : null}
          </div>

          <div
            className={cn(
              "absolute right-2.5 bottom-2.5 rounded-xl px-2.5 py-1.5 shadow-sm backdrop-blur-md",
              signalGood
                ? "bg-[#1f7a4d]/95 text-white"
                : "bg-white/95 text-[#191919]",
            )}
          >
            {item.showDemand ? (
              <>
                <p className="text-[20px] leading-none font-semibold tabular-nums">
                  {Math.round(item.demand ?? 0)}
                </p>
                <p className="mt-0.5 text-[9px] font-semibold tracking-wider uppercase opacity-80">
                  Score
                </p>
              </>
            ) : (
              <>
                <p className="text-[20px] leading-none font-semibold tabular-nums">
                  {item.keep != null ? signed(item.keep) : "—"}
                </p>
                <p className="mt-0.5 text-[9px] font-semibold tracking-wider uppercase opacity-80">
                  Keep
                </p>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2.5 px-3.5 pt-3 pb-2">
          <p className="line-clamp-2 min-h-[2.6em] text-[13px] leading-snug font-semibold text-[#191919]">
            {item.title}
          </p>
          {item.brand || item.meta ? (
            <p className="truncate text-[11px] text-[#8a8a8a]">
              {[item.brand, item.meta].filter(Boolean).join(" · ")}
            </p>
          ) : null}

          {/* Multi-platform prices — the wow strip */}
          <div className="mt-auto rounded-xl border border-[#e5e5e5] bg-[#f7f7f7] p-1.5">
            <div className="mb-1 flex items-center justify-between px-1">
              <p className="text-[9px] font-bold tracking-[0.14em] text-[#8a8a8a] uppercase">
                Precios Higlou
              </p>
              <p className="text-[9px] font-semibold text-[#1f7a4d]">
                {priced}/4 live
              </p>
            </div>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
              {item.platforms.map((p, i) => (
                <motion.div
                  key={p.key}
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 + i * 0.04, ease: EASE }}
                  className={cn(
                    "rounded-lg bg-white px-1.5 py-1.5 text-center",
                    p.price != null && "ring-1 ring-[#1f7a4d]/15",
                  )}
                >
                  <p className="text-[8px] font-bold tracking-wide text-[#8a8a8a] uppercase">
                    {p.label}
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 text-[12px] font-bold tabular-nums",
                      p.price != null ? "text-[#191919]" : "text-[#c0c0c0]",
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

      <div className="flex items-center gap-1 border-t border-[#e5e5e5] px-2 py-1.5">
        <button
          type="button"
          disabled={locked}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-lg transition",
            item.selected
              ? "bg-[#3665F3] text-white"
              : "text-[#8a8a8a] hover:bg-[#f0f0f0] hover:text-[#191919]",
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
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-[#3665F3] hover:bg-[#eef2ff]"
          >
            Amz
            <ExternalLink className="size-3 opacity-60" />
          </a>
        ) : null}
        {item.ebayUrl ? (
          <a
            href={item.ebayUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-[#3665F3] hover:bg-[#eef2ff]"
          >
            eBay
            <ExternalLink className="size-3 opacity-60" />
          </a>
        ) : null}
        <button
          type="button"
          disabled={locked}
          onClick={(e) => {
            e.stopPropagation();
            onSkip();
          }}
          className="ml-auto inline-flex size-8 items-center justify-center rounded-lg text-[#8a8a8a] hover:bg-[#f0f0f0] hover:text-[#191919] disabled:opacity-40"
          aria-label="Descartar"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </motion.article>
  );
}
