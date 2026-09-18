"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

/** Animated ask → list price collapse. */
export function PriceDrop({
  from,
  to,
  className,
  size = "lg",
}: {
  from: number;
  to: number;
  className?: string;
  size?: "sm" | "lg" | "hero";
}) {
  const reduce = useReducedMotion() ?? false;
  const [shown, setShown] = useState(reduce ? to : from);
  const [phase, setPhase] = useState<"from" | "to">(reduce ? "to" : "from");

  useEffect(() => {
    if (reduce) {
      setShown(to);
      setPhase("to");
      return;
    }
    setShown(from);
    setPhase("from");
    const start = window.setTimeout(() => {
      setPhase("to");
      const startVal = from;
      const endVal = to;
      const duration = 1100;
      const t0 = performance.now();
      let raf = 0;
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        setShown(Math.round(startVal + (endVal - startVal) * eased));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }, 420);
    return () => window.clearTimeout(start);
  }, [from, to, reduce]);

  const cut = from > to ? Math.round(((from - to) / from) * 100) : 0;
  const sizeCls =
    size === "hero"
      ? "text-[56px] sm:text-[72px] leading-none"
      : size === "lg"
        ? "text-[36px] sm:text-[44px] leading-none"
        : "text-[22px] leading-none";

  return (
    <div className={cn("relative", className)}>
      <motion.p
        key={phase}
        initial={reduce ? false : { y: phase === "to" ? -12 : 8, opacity: 0.5 }}
        animate={{ y: 0, opacity: 1 }}
        className={cn(
          "font-[family-name:var(--font-instrument-serif)] tabular-nums tracking-tight text-[#0c0c0c]",
          sizeCls,
        )}
      >
        {money(shown)}
      </motion.p>
      {cut > 0 ? (
        <motion.span
          initial={reduce ? false : { opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.7 }}
          className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.12em] text-[#e85d04] uppercase"
        >
          <span className="inline-block h-px w-6 bg-[#e85d04]" />
          −{cut}% vs ask
        </motion.span>
      ) : null}
    </div>
  );
}
