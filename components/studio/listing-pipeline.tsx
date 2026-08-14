"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2 } from "lucide-react";
import { usePrefersReducedMotion } from "@/components/listing/wizard/use-prefers-reduced-motion";
import { LiveDot } from "@/components/ui/studio";
import { cn } from "@/lib/utils";

const STAGES = [
  {
    id: "photos",
    label: "Photos in",
    line: "Reading angles, labels, and packaging.",
  },
  {
    id: "draft",
    label: "Draft writing",
    line: "Title, category, and price fill from the photos.",
  },
  {
    id: "check",
    label: "You check",
    line: "Glance at title and price. Most of it is already done.",
  },
  {
    id: "live",
    label: "eBay live",
    line: "Offer goes to the connected store — unpublished, then live.",
  },
] as const;

const SAMPLE_TITLE = "Milwaukee M18 FUEL 1/2 in. Hammer Drill";
const SAMPLE_PHOTOS = [
  "/demo/m18-front.webp",
  "/demo/m18-label.webp",
  "/demo/m18-box.webp",
  "/demo/m18-angle.webp",
] as const;

function useTyped(text: string, on: boolean, reduce: boolean) {
  const [out, setOut] = useState(reduce || !on ? text : "");
  useEffect(() => {
    if (reduce) {
      setOut(text);
      return;
    }
    if (!on) {
      setOut("");
      return;
    }
    setOut("");
    let i = 0;
    const t = window.setInterval(() => {
      i += 1;
      setOut(text.slice(0, i));
      if (i >= text.length) window.clearInterval(t);
    }, 28);
    return () => window.clearInterval(t);
  }, [text, on, reduce]);
  return out;
}

export function ListingPipeline({
  storeName,
  compact = false,
}: {
  storeName?: string | null;
  compact?: boolean;
}) {
  const reduce = usePrefersReducedMotion();
  const [stage, setStage] = useState(0);
  const shop = storeName?.trim() || "your eBay store";
  const typing = useTyped(SAMPLE_TITLE, stage >= 1, reduce);
  const photosOn = stage >= 0;
  const draftOn = stage >= 1;
  const checksOn = stage >= 2;
  const liveOn = stage >= 3;

  useEffect(() => {
    if (reduce) {
      setStage(STAGES.length - 1);
      return;
    }
    const t = window.setInterval(
      () => setStage((s) => (s + 1) % STAGES.length),
      2400,
    );
    return () => window.clearInterval(t);
  }, [reduce]);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-[28px] border border-border/80 bg-surface shadow-[0_24px_60px_-48px_rgba(20,16,8,0.45)]",
        compact ? "p-4" : "p-5 sm:p-6",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          <LiveDot /> Listing pipeline
        </p>
        <p className="truncate text-[12px] text-muted-foreground">{shop}</p>
      </div>

      <div
        className={cn(
          "mt-4 grid gap-3",
          compact ? "md:grid-cols-3" : "lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)_minmax(0,0.9fr)]",
        )}
      >
        <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-muted/40 p-3">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            1 · Photos
          </p>
          <div className="relative mt-2 grid grid-cols-2 gap-1.5">
            {SAMPLE_PHOTOS.map((src, i) => (
              <motion.div
                key={src}
                initial={false}
                animate={{
                  opacity: photosOn ? 1 : 0.35,
                  y: photosOn ? 0 : 6,
                }}
                transition={{ delay: i * 0.12, duration: 0.35 }}
                className="relative aspect-square overflow-hidden rounded-lg bg-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </motion.div>
            ))}
            {stage === 0 && !reduce ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-6 h-10 bg-gradient-to-b from-brand/35 to-transparent [animation:higlou-scan_2s_ease-in-out_infinite]"
              />
            ) : null}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {stage === 0 ? "Scanning labels…" : "6 photos ready"}
          </p>
        </div>

        <div className="rounded-2xl border border-border/70 bg-background p-3">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            2 · Higlou draft
          </p>
          <div className="mt-2 min-h-[88px]">
            <p className="min-h-[40px] text-[13.5px] font-semibold tracking-tight">
              {draftOn ? typing : "Waiting on photos…"}
              {stage === 1 && typing.length < SAMPLE_TITLE.length ? (
                <span className="ml-0.5 inline-block h-3 w-px animate-pulse bg-foreground" />
              ) : null}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded-md px-2 py-0.5 text-[12px] font-semibold tabular-nums",
                  draftOn ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
                )}
              >
                {draftOn ? "$189.00" : "—"}
              </span>
              <span className="rounded-md bg-muted px-2 py-0.5 text-[11px]">
                {draftOn ? "Grinders · 50386" : "Category"}
              </span>
              <span className="rounded-md bg-muted px-2 py-0.5 text-[11px]">
                {draftOn ? "New" : "Condition"}
              </span>
            </div>
            <ul className="mt-3 space-y-1">
              {["Brand: Milwaukee", "MPN: 2804-20", "Voltage: 18 V"].map((row, i) => (
                <li
                  key={row}
                  className={cn(
                    "flex items-center gap-1.5 text-[11.5px]",
                    checksOn || (draftOn && i === 0)
                      ? "text-foreground"
                      : "text-muted-foreground/50",
                  )}
                >
                  {checksOn ? (
                    <Check className="size-3 text-success" strokeWidth={3} />
                  ) : draftOn && i === 0 ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <span className="size-3 rounded-full border border-border" />
                  )}
                  {row}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div
          className={cn(
            "rounded-2xl border p-3 transition",
            liveOn
              ? "border-success/40 bg-success-soft/40"
              : "border-border/70 bg-muted/30",
          )}
        >
          <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            3 · eBay
          </p>
          <p className="mt-2 truncate text-[13px] font-semibold">{shop}</p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                liveOn
                  ? "bg-success text-white"
                  : draftOn
                    ? "bg-amber-100 text-amber-950"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {liveOn ? "LIVE" : draftOn ? "DRAFT" : "WAITING"}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {liveOn ? "Offer published" : "Inventory offer"}
            </span>
          </div>
          <p className="mt-3 font-mono text-[11px] text-muted-foreground">
            {liveOn ? "itm · 135928401" : "offer · —"}
          </p>
        </div>
      </div>

      <ol className={cn("mt-4 grid grid-cols-4 gap-2", compact && "mt-3")}>
        {STAGES.map((s, i) => {
          const on = i === stage;
          const done = i < stage;
          return (
            <li key={s.id} className="min-w-0">
              <div className="h-1 overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="h-full bg-brand"
                  animate={{ width: done || on ? "100%" : "0%" }}
                  transition={{ duration: 0.4 }}
                />
              </div>
              <p
                className={cn(
                  "mt-1.5 truncate text-[11px] font-semibold",
                  on ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {s.label}
              </p>
              {!compact ? (
                <AnimatePresence mode="wait">
                  {on ? (
                    <motion.p
                      key={s.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="mt-0.5 hidden text-[11px] leading-snug text-muted-foreground sm:block"
                    >
                      {s.line}
                    </motion.p>
                  ) : null}
                </AnimatePresence>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
