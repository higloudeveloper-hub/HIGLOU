"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { usePrefersReducedMotion } from "@/components/listing/wizard/use-prefers-reduced-motion";

const KEY = "higlou-entered-studio";

const BEATS = [
  {
    kicker: "Higlou",
    title: "This is a listing engine.",
    body: "You don’t sit down to write eBay listings. You feed it photos. It writes them. You publish. The item can sell.",
  },
  {
    kicker: "Four parts. Always.",
    title: "Photos → AI → check → live.",
    body: "Same path every time. Nothing extra. If you get lost, look at the numbers at the top: 1, 2, 3, 4.",
  },
  {
    kicker: "Your job",
    title: "Bring the product. Take the money.",
    body: "Higlou handles title, category, specifics, and the draft. You confirm what looks right, then send it to eBay.",
  },
] as const;

export function WelcomeGate({ children }: { children: React.ReactNode }) {
  const reduce = usePrefersReducedMotion();
  const [open, setOpen] = useState(false);
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(KEY) === "1") return;
    } catch {
      /* ignore */
    }
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open || reduce) return;
    if (beat >= BEATS.length - 1) return;
    const t = window.setTimeout(() => setBeat((n) => n + 1), 4200);
    return () => window.clearTimeout(t);
  }, [open, beat, reduce]);

  function finish() {
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  const last = beat === BEATS.length - 1;
  const current = BEATS[beat];

  return (
    <>
      {children}
      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-foreground px-6 text-background"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_50%_-10%,rgba(255,199,44,0.22),transparent_60%)]"
            />
            <div className="relative w-full max-w-lg">
              <p className="text-[11px] font-semibold tracking-[0.22em] text-brand uppercase">
                {current.kicker}
              </p>
              <AnimatePresence mode="wait">
                <motion.div
                  key={beat}
                  initial={reduce ? false : { opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0, y: -12 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                >
                  <h2 className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">
                    {current.title}
                  </h2>
                  <p className="mt-4 max-w-md text-[16px] leading-relaxed text-background/70">
                    {current.body}
                  </p>
                </motion.div>
              </AnimatePresence>

              <div className="mt-8 flex items-center gap-2">
                {BEATS.map((_, i) => (
                  <span
                    key={i}
                    className={
                      i === beat
                        ? "h-1.5 w-8 rounded-full bg-brand"
                        : "h-1.5 w-3 rounded-full bg-background/20"
                    }
                  />
                ))}
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => (last ? finish() : setBeat((n) => n + 1))}
                  className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand px-6 text-sm font-semibold text-brand-foreground"
                >
                  {last ? "Enter the studio" : "Next"}
                  <ArrowRight className="size-4" />
                </button>
                {!last ? (
                  <button
                    type="button"
                    onClick={finish}
                    className="text-sm text-background/50 hover:text-background"
                  >
                    Skip
                  </button>
                ) : null}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
