"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Camera, ShieldCheck, Sparkles, Store } from "lucide-react";
import { usePrefersReducedMotion } from "@/components/listing/wizard/use-prefers-reduced-motion";
import { LiveDot } from "@/components/ui/studio";
import { displayNameFromEbayUsername } from "@/lib/ebay/store-display-name";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: "connect", label: "Connect", hint: "Your eBay store", Icon: Store },
  { id: "photos", label: "Photos", hint: "You drop them in", Icon: Camera },
  { id: "draft", label: "Higlou writes", hint: "Title, price, specs", Icon: Sparkles },
  { id: "live", label: "Policies + live", hint: "Ready to sell", Icon: ShieldCheck },
] as const;

export function EbaySetupStory({
  connected,
  username,
  storeName,
}: {
  connected: boolean;
  username?: string | null;
  storeName?: string | null;
}) {
  const reduce = usePrefersReducedMotion();
  const [active, setActive] = useState(connected ? 3 : 0);
  const sign =
    storeName?.trim() ||
    (username ? displayNameFromEbayUsername(username) : "") ||
    (connected ? "Your eBay store" : "Connect eBay");

  useEffect(() => {
    if (reduce) return;
    const t = window.setInterval(
      () => setActive((n) => (n + 1) % STEPS.length),
      1800,
    );
    return () => window.clearInterval(t);
  }, [reduce]);

  return (
    <section className="overflow-hidden rounded-[32px] border border-border/70 bg-[linear-gradient(180deg,#1a1408_0%,#2a2110_55%,#17130b_100%)] text-[#f7f0e4] shadow-[0_30px_80px_-48px_rgba(20,16,8,0.7)]">
      <div className="relative px-5 pt-5 pb-4 sm:px-7">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 right-8 size-56 rounded-full bg-[radial-gradient(circle,rgba(255,199,44,0.28),transparent_68%)]"
        />
        <div className="relative flex items-center justify-between gap-3">
          <p className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-[#f7f0e4]/55 uppercase">
            <LiveDot /> How selling works
          </p>
          <p className="text-[11px] font-medium text-[#f7f0e4]/45">
            {connected ? "Store linked" : "Not connected yet"}
          </p>
        </div>

        <div className="relative mx-auto mt-5 h-[168px] max-w-[420px] sm:h-[188px]">
          <div className="absolute inset-x-8 bottom-0 h-3 rounded-full bg-black/30 blur-[2px]" />

          <motion.div
            aria-hidden
            className="absolute bottom-[52px] left-[8%] z-10 size-9 rounded-lg border border-white/15 bg-brand shadow-lg sm:left-[12%]"
            animate={
              reduce
                ? { x: 0, y: 0 }
                : { x: [0, 118, 118], y: [0, -18, 8], rotate: [0, -8, 6] }
            }
            transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
          >
            <span className="absolute inset-1 rounded-md bg-white/30" />
          </motion.div>

          <div className="absolute right-[8%] bottom-3 w-[58%] sm:right-[10%] sm:w-[54%]">
            <div className="mx-auto mb-1 w-[72%] rounded-md bg-brand px-2 py-1 text-center shadow-[0_8px_20px_-10px_rgba(255,199,44,0.8)]">
              <p className="truncate text-[10px] font-bold tracking-[0.14em] text-brand-foreground uppercase">
                {sign}
              </p>
            </div>
            <div
              className="h-4 overflow-hidden rounded-t-lg"
              style={{
                background:
                  "repeating-linear-gradient(90deg, #f4c928 0 10px, #1a1408 10px 20px)",
              }}
            />
            <div className="relative h-[92px] overflow-hidden rounded-b-2xl border border-white/10 bg-[#3a2e1a] sm:h-[104px]">
              <div className="absolute top-2 left-3 h-[54px] w-[38%] rounded-md border border-white/10 bg-[#1c160c]">
                <motion.div
                  className="absolute inset-1 rounded-sm bg-brand/25"
                  animate={reduce ? { opacity: 0.5 } : { opacity: [0.25, 0.7, 0.25] }}
                  transition={{ duration: 2.2, repeat: Infinity }}
                />
                <span className="absolute right-1.5 bottom-1.5 left-1.5 h-1.5 rounded-full bg-white/25" />
              </div>
              <div className="absolute top-2 right-3 h-[70px] w-[28%] rounded-t-md border border-white/10 bg-[#241c10]">
                <span className="absolute top-6 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-brand" />
              </div>
              {connected ? (
                <motion.span
                  className="absolute top-1.5 right-1.5 size-2 rounded-full bg-emerald-400"
                  animate={reduce ? {} : { opacity: [1, 0.35, 1] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                />
              ) : null}
            </div>
          </div>
        </div>

        <ol className="relative mt-5 grid grid-cols-4 gap-2">
          <span className="absolute top-[18px] right-6 left-6 hidden h-[2px] bg-white/10 sm:block">
            <motion.span
              className="block h-full origin-left bg-brand"
              animate={{
                scaleX: reduce ? 1 : (active + 1) / STEPS.length,
              }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            />
          </span>
          {STEPS.map((step, i) => {
            const Icon = step.Icon;
            const on = i === active || reduce;
            const done = connected || i < active;
            return (
              <li key={step.id} className="relative z-10 flex flex-col items-center text-center">
                <motion.span
                  animate={{ scale: on ? 1.08 : 1 }}
                  className={cn(
                    "grid size-9 place-items-center rounded-2xl",
                    on &&
                      "bg-brand text-brand-foreground shadow-[0_0_0_6px_rgba(255,199,44,0.18)]",
                    done && !on && "bg-white/15 text-[#f7f0e4]",
                    !on && !done && "bg-white/8 text-[#f7f0e4]/55",
                  )}
                >
                  <Icon className="size-4" strokeWidth={2.2} />
                </motion.span>
                <p className="mt-2 text-[11px] font-semibold sm:text-[12px]">
                  {step.label}
                </p>
                <p className="hidden text-[10px] text-[#f7f0e4]/45 sm:block">
                  {step.hint}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
