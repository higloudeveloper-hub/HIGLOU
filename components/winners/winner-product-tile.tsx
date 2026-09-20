"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { Check, ExternalLink, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type WinnerTileModel = {
  id: string;
  title: string;
  brand?: string;
  imageUrl?: string | null;
  playLabel: "Arbitraje" | "Amazon";
  buyLabel: string;
  sellLabel: string;
  buyPrice: number | null;
  sellPrice: number | null;
  keep: number | null;
  demand: number | null;
  showDemand: boolean;
  isNew?: boolean;
  selected?: boolean;
  amazonUrl?: string | null;
  ebayUrl?: string | null;
  meta?: string;
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

  return (
    <motion.article
      layout
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.28), ease: [0.22, 1, 0.36, 1] }}
      whileHover={reduce ? undefined : { y: -3 }}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-[0_1px_0_rgba(20,20,20,0.04)] transition-[border-color,box-shadow]",
        item.selected
          ? "border-[#141414] shadow-[0_8px_28px_rgba(20,20,20,0.08)]"
          : "border-[#ebe7e0] hover:border-[#cfc9bf] hover:shadow-[0_12px_32px_rgba(20,20,20,0.07)]",
        item.isNew && "ring-2 ring-[#f4c928]/55",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-1 flex-col text-left"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-[#f4f2ed]">
          {item.imageUrl ? (
            <Image
              src={item.imageUrl}
              alt=""
              fill
              className="object-contain p-4 transition duration-500 group-hover:scale-[1.03]"
              unoptimized
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[12px] text-[#a8a29a]">
              Sin foto
            </div>
          )}

          <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase backdrop-blur-sm",
                item.playLabel === "Arbitraje"
                  ? "bg-[#e8f5ee]/95 text-[#1a6b45]"
                  : "bg-[#fff3c4]/95 text-[#7a5c00]",
              )}
            >
              {item.playLabel}
            </span>
            {item.isNew ? (
              <span className="rounded-full bg-[#141414]/90 px-2 py-0.5 text-[10px] font-semibold text-[#f4c928] uppercase">
                Nueva
              </span>
            ) : null}
          </div>

          <div
            className={cn(
              "absolute right-2.5 bottom-2.5 rounded-xl px-2.5 py-1.5 shadow-sm backdrop-blur-md",
              signalGood ? "bg-[#1f7a4d]/95 text-white" : "bg-white/95 text-[#141414]",
            )}
          >
            {item.showDemand ? (
              <>
                <p className="font-display text-[20px] leading-none tabular-nums">
                  {Math.round(item.demand ?? 0)}
                </p>
                <p className="mt-0.5 text-[9px] font-semibold tracking-wider uppercase opacity-80">
                  Demand
                </p>
              </>
            ) : (
              <>
                <p className="font-display text-[20px] leading-none tabular-nums">
                  {item.keep != null ? signed(item.keep) : "—"}
                </p>
                <p className="mt-0.5 text-[9px] font-semibold tracking-wider uppercase opacity-80">
                  Keep
                </p>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2 px-3.5 pt-3 pb-2">
          <p className="line-clamp-2 min-h-[2.6em] text-[13px] leading-snug font-medium text-[#1a1a1a]">
            {item.title}
          </p>
          {item.brand || item.meta ? (
            <p className="truncate text-[11px] text-[#8a847c]">
              {[item.brand, item.meta].filter(Boolean).join(" · ")}
            </p>
          ) : null}

          <div className="mt-auto grid grid-cols-2 gap-2 border-t border-[#f0ebe3] pt-2.5">
            <div>
              <p className="text-[9px] font-semibold tracking-wider text-[#8a847c] uppercase">
                Compra · {item.buyLabel}
              </p>
              <p className="mt-0.5 text-[15px] font-semibold tabular-nums">
                {money(item.buyPrice)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-semibold tracking-wider text-[#8a847c] uppercase">
                Venta · {item.sellLabel}
              </p>
              <p className="mt-0.5 text-[15px] font-semibold tabular-nums">
                {money(item.sellPrice)}
              </p>
            </div>
          </div>
        </div>
      </button>

      <div className="flex items-center gap-1 border-t border-[#f0ebe3] px-2 py-1.5">
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
              ? "bg-[#141414] text-[#f4c928]"
              : "text-[#8a847c] hover:bg-[#f4f2ed] hover:text-[#141414]",
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
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-[#2162a1] hover:bg-[#f0f5fa]"
          >
            Amazon
            <ExternalLink className="size-3 opacity-60" />
          </a>
        ) : null}
        {item.ebayUrl ? (
          <a
            href={item.ebayUrl}
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
          disabled={locked}
          onClick={(e) => {
            e.stopPropagation();
            onSkip();
          }}
          className="ml-auto inline-flex size-8 items-center justify-center rounded-lg text-[#8a847c] hover:bg-[#f4f2ed] hover:text-[#141414] disabled:opacity-40"
          aria-label="Descartar"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </motion.article>
  );
}
