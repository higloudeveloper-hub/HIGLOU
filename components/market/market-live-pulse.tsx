"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const BEATS = [
  "Escaneando Keepa",
  "Verificando Buy Box",
  "Filtrando keep real",
  "Marcando winners",
] as const;

/** Soft live status — Home-style blue, no dark neon. */
export function MarketLivePulse({
  refreshing,
  floorCount,
  className,
}: {
  refreshing?: boolean;
  floorCount: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => {
      setBeat((n) => (n + 1) % BEATS.length);
    }, 2600);
    return () => window.clearInterval(id);
  }, [reduce]);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl bg-[#3665F3] px-4 py-2.5 text-white",
        className,
      )}
    >
      <span className="relative flex size-2">
        {!reduce ? (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-white/50" />
        ) : null}
        <span className="relative size-2 rounded-full bg-white" />
      </span>
      <p className="text-[11px] font-semibold tracking-[0.16em] uppercase">
        Live
      </p>
      <div className="min-w-0 flex-1">
        {reduce ? (
          <p className="truncate text-[13px] text-white/90">{BEATS[beat]}</p>
        ) : (
          <motion.p
            key={beat}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
            className="truncate text-[13px] text-white/90"
          >
            {BEATS[beat]}
          </motion.p>
        )}
      </div>
      <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white/90">
        {refreshing ? "Sync…" : `${floorCount} en floor`}
      </span>
    </div>
  );
}
