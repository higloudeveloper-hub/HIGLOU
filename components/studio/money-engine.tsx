"use client";

import { useEffect, useState } from "react";
import { Camera, DollarSign, Sparkles, Store } from "lucide-react";
import { motion } from "motion/react";
import { usePrefersReducedMotion } from "@/components/listing/wizard/use-prefers-reduced-motion";
import { LiveDot } from "@/components/ui/studio";
import { cn } from "@/lib/utils";

const NODES = [
  { id: "photos", label: "Photos in", hint: "You drop them", Icon: Camera },
  { id: "ai", label: "AI writes", hint: "Title, specs, price", Icon: Sparkles },
  { id: "live", label: "Goes live", hint: "eBay draft", Icon: Store },
  { id: "pay", label: "It can sell", hint: "You get paid", Icon: DollarSign },
] as const;

export function MoneyEngine({
  compact = false,
}: {
  compact?: boolean;
}) {
  const reduce = usePrefersReducedMotion();
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const t = window.setInterval(
      () => setActive((n) => (n + 1) % NODES.length),
      1600,
    );
    return () => window.clearInterval(t);
  }, [reduce]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-border/80 bg-foreground text-background shadow-[0_30px_80px_-48px_rgba(20,16,8,0.55)]",
        compact ? "px-4 py-4" : "px-5 py-6 sm:px-7 sm:py-8",
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-0 size-64 rounded-full bg-[radial-gradient(circle,rgba(255,199,44,0.28),transparent_68%)]"
      />
      <div className="relative flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-background/55 uppercase">
          <LiveDot />
          Listing engine
        </p>
        <p className="text-[11px] font-medium text-background/45">
          {NODES[active]?.label}
        </p>
      </div>

      <div className={cn("relative mt-6", compact && "mt-4")}>
        <div className="absolute top-[22px] right-8 left-8 hidden h-[2px] bg-background/15 sm:block">
          <motion.div
            className="h-full origin-left bg-brand"
            animate={
              reduce
                ? { scaleX: 1 }
                : { scaleX: (active + 1) / NODES.length }
            }
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
        <ol className="relative grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-2">
          {NODES.map((node, i) => {
            const Icon = node.Icon;
            const on = i === active || reduce;
            const done = i < active;
            return (
              <li key={node.id} className="flex flex-col items-center text-center">
                <motion.span
                  animate={{ scale: on ? 1.08 : 1 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className={cn(
                    "relative z-10 grid size-11 place-items-center rounded-2xl",
                    on &&
                      "bg-brand text-brand-foreground shadow-[0_0_0_6px_rgba(255,199,44,0.18)]",
                    done && !on && "bg-background/20 text-background",
                    !on && !done && "bg-background/10 text-background/70",
                  )}
                >
                  <Icon className="size-5" strokeWidth={2.2} />
                </motion.span>
                <p className="mt-2.5 text-[13px] font-semibold">{node.label}</p>
                {!compact ? (
                  <p className="mt-0.5 text-[11px] text-background/50">
                    {node.hint}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
