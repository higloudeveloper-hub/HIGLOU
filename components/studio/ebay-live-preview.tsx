"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export function EbayLivePreview({
  photoSrc,
  title,
  priceLabel,
  storeName,
  live,
  compact = false,
}: {
  photoSrc: string;
  title: string;
  priceLabel: string;
  storeName: string;
  live: boolean;
  compact?: boolean;
}) {
  const shop = storeName.trim() || "your eBay store";

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-[0_12px_32px_-18px_rgba(0,0,0,0.5)] ring-1 ring-black/10">
      <div className="flex items-center justify-between bg-[#191919] px-3 py-1.5">
        <span className="text-[12px] font-bold tracking-tight text-white">
          e<span className="text-[#e53238]">Bay</span>
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] uppercase",
            live ? "bg-success text-white" : "bg-white/15 text-white/70",
          )}
        >
          {live ? "Published" : "Uploading…"}
        </span>
      </div>
      <div className={cn("relative bg-[#f2f2f2]", compact ? "aspect-[16/10]" : "aspect-[16/9]")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoSrc}
          alt=""
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition duration-500",
            live ? "opacity-100" : "opacity-40 grayscale",
          )}
        />
        {live ? (
          <motion.span
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="absolute top-2 left-2 rounded-full bg-brand px-2.5 py-1 text-[11px] font-semibold text-brand-foreground shadow-sm"
          >
            Live on eBay
          </motion.span>
        ) : null}
      </div>
      <div className={cn("p-3", !compact && "sm:p-4")}>
        <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-zinc-950">
          {live ? title : "Your listing appears on eBay here"}
        </p>
        <p className="mt-1 text-[20px] font-bold tabular-nums text-zinc-950">
          {live ? priceLabel : "—"}
        </p>
        <p className="text-[11px] text-zinc-500">
          {live ? "Buy It Now · New · Free returns" : "Waiting for publish"}
        </p>
        <div
          className={cn(
            "mt-2.5 rounded-full py-2 text-center text-[12px] font-semibold",
            live ? "bg-[#0064d2] text-white" : "bg-zinc-200 text-zinc-500",
          )}
        >
          {live ? "Buy It Now" : "Goes live next"}
        </div>
        <p className="mt-2 truncate text-[11px] text-zinc-500">
          Sold by {shop}
          {live ? " · itm 135928401" : ""}
        </p>
      </div>
    </div>
  );
}
