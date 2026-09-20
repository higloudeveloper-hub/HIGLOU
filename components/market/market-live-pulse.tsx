"use client";

import { motion, useReducedMotion } from "motion/react";
import { Activity, Radar } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const BEATS = [
  "Escaneando Keepa en vivo",
  "Verificando BSR y Buy Box",
  "Filtrando margen real",
  "Marcando winners verificados",
  "Buscando demanda en Amazon",
] as const;

/**
 * Credible live-machine pulse — soft status, not neon spam.
 * Communicates Higlou is actively hunting opportunities.
 */
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
    }, 2800);
    return () => window.clearInterval(id);
  }, [reduce]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-[#ebe7e0] bg-[#141414] text-white",
        className,
      )}
    >
      {!reduce ? (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/8 to-transparent"
          animate={{ left: ["-30%", "120%"] }}
          transition={{ duration: 3.6, repeat: Infinity, ease: "linear" }}
        />
      ) : null}
      <div className="relative flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2.5">
            {!reduce ? (
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#f4c928]/50" />
            ) : null}
            <span className="relative inline-flex size-2.5 rounded-full bg-[#f4c928]" />
          </span>
          <Radar className="size-3.5 text-[#f4c928]" />
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[#f4c928] uppercase">
            Opportunity machine
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <AnimateBeat key={beat} text={BEATS[beat]!} reduce={Boolean(reduce)} />
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white/80">
          <Activity className="size-3 text-[#7ddea8]" />
          {refreshing ? "Sync…" : `${floorCount} verificados`}
        </div>
      </div>
    </div>
  );
}

function AnimateBeat({
  text,
  reduce,
}: {
  text: string;
  reduce: boolean;
}) {
  if (reduce) {
    return <p className="truncate text-[13px] text-white/90">{text}</p>;
  }
  return (
    <motion.p
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="truncate text-[13px] text-white/90"
    >
      {text}
      <span className="ml-1 text-white/40">· datos reales Keepa</span>
    </motion.p>
  );
}
