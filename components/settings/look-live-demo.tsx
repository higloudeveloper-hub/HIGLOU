"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { usePrefersReducedMotion } from "@/components/listing/wizard/use-prefers-reduced-motion";
import { LiveDot } from "@/components/ui/studio";
import { EbayLivePreview, useConnectedEbayStoreName } from "@/components/studio/ebay-live-preview";
import { cn } from "@/lib/utils";

const PHOTOS = [
  { src: "/demo/m18-front.webp", label: "Front" },
  { src: "/demo/m18-label.webp", label: "Label" },
  { src: "/demo/m18-box.webp", label: "Box" },
  { src: "/demo/m18-angle.webp", label: "Angle" },
] as const;

const TITLE = "Milwaukee M18 FUEL 1/2 in. Hammer Drill";

const BEATS = [
  { id: "photos", label: "Photos" },
  { id: "look", label: "Your look" },
  { id: "listing", label: "Listing" },
  { id: "live", label: "Live on eBay" },
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
    }, 24);
    return () => window.clearInterval(t);
  }, [text, on, reduce]);
  return out;
}

export function LookLiveDemo({
  storeName,
  slogan,
  headerBg,
  headerText,
  accent,
}: {
  storeName: string;
  slogan: string;
  headerBg: string;
  headerText: string;
  accent: string;
}) {
  const reduce = usePrefersReducedMotion();
  const [beat, setBeat] = useState(reduce ? 3 : 0);
  const shop = useConnectedEbayStoreName(storeName);
  const tagline =
    slogan.trim() || "Quality Products · Reliable Service · Shop With Confidence";
  const live = beat >= 3;
  const painting = beat >= 1;
  const listing = beat >= 2;
  const typing = useTyped(TITLE, listing && !live, reduce);

  useEffect(() => {
    if (reduce) return;
    const t = window.setInterval(() => setBeat((b) => (b + 1) % 4), 2600);
    return () => window.clearInterval(t);
  }, [reduce]);

  return (
    <section className="overflow-hidden rounded-[28px] border border-border/80 bg-foreground text-background shadow-[0_24px_60px_-36px_rgba(20,16,8,0.55)]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <p className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-background/50 uppercase">
          <LiveDot tone={live ? "success" : "brand"} />
          How your look lands on eBay
        </p>
        <div className="flex items-center gap-1.5">
          {BEATS.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setBeat(i)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-semibold transition",
                beat === i
                  ? "bg-brand text-brand-foreground"
                  : "bg-background/10 text-background/55 hover:bg-background/16",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-h-[320px] gap-0 sm:grid-cols-[minmax(0,1.05fr)_minmax(260px,0.95fr)]">
        <div className="relative p-4 sm:p-5">
          <AnimatePresence mode="wait">
            {beat === 0 ? (
              <motion.div
                key="photos"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35 }}
              >
                <p className="font-display text-[26px] leading-tight tracking-tight sm:text-[30px]">
                  Photos in.
                </p>
                <p className="mt-1 text-[13px] text-background/60">
                  Higlou reads the product, then paints your store on the listing.
                </p>
                <div className="relative mt-4 grid grid-cols-2 gap-1.5">
                  {PHOTOS.map((shot, i) => (
                    <motion.div
                      key={shot.src}
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.08, duration: 0.35 }}
                      className="relative aspect-[4/3] overflow-hidden rounded-xl bg-zinc-800"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={shot.src}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                      <span className="absolute bottom-1 left-1 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-medium text-white/90">
                        {shot.label}
                      </span>
                    </motion.div>
                  ))}
                  {!reduce ? (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 top-4 h-12 bg-gradient-to-b from-brand/45 to-transparent [animation:higlou-scan_2s_ease-in-out_infinite]"
                    />
                  ) : null}
                </div>
              </motion.div>
            ) : beat === 1 ? (
              <motion.div
                key="look"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35 }}
              >
                <p className="font-display text-[26px] leading-tight tracking-tight sm:text-[30px]">
                  Your header. Your colors.
                </p>
                <p className="mt-1 text-[13px] text-background/60">
                  This is the banner buyers see inside the eBay description.
                </p>
                <motion.div
                  layout
                  className="mt-4 overflow-hidden rounded-2xl px-4 py-7 text-center shadow-[0_16px_40px_-24px_rgba(0,0,0,0.55)]"
                  style={{ background: headerBg, color: headerText }}
                >
                  <motion.p
                    key={shop}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="font-display text-[22px] tracking-tight sm:text-[26px]"
                  >
                    {shop.toUpperCase()}
                  </motion.p>
                  <motion.span
                    className="mt-2 inline-block h-1 w-16 rounded-full"
                    style={{ background: accent }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.45, delay: 0.15 }}
                  />
                  <p className="mt-3 text-[11px] tracking-[0.08em] uppercase opacity-80">
                    {tagline}
                  </p>
                </motion.div>
              </motion.div>
            ) : (
              <motion.div
                key="listing"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35 }}
              >
                <p className="font-display text-[26px] leading-tight tracking-tight sm:text-[30px]">
                  {live ? "Live on eBay." : "The listing takes your look."}
                </p>
                <p className="mt-1 text-[13px] text-background/60">
                  {live
                    ? "Buyers open the product on eBay and see your store, not a generic template."
                    : "Title, price, and branded HTML assemble before publish."}
                </p>
                <div className="mt-4 overflow-hidden rounded-2xl bg-white text-zinc-950 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.5)]">
                  <div
                    className="px-4 py-5 text-center"
                    style={{ background: headerBg, color: headerText }}
                  >
                    <p className="font-display text-[18px] tracking-tight">
                      {shop.toUpperCase()}
                    </p>
                    <span
                      className="mt-1.5 inline-block h-0.5 w-12 rounded-full"
                      style={{ background: accent }}
                    />
                  </div>
                  <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={PHOTOS[0].src}
                      alt=""
                      className="aspect-square rounded-lg object-cover"
                    />
                    <div className="min-w-0">
                      <p className="line-clamp-2 min-h-[36px] text-[13px] font-semibold leading-snug">
                        {listing ? typing : "Waiting…"}
                        {beat === 2 &&
                        typing.length < TITLE.length &&
                        !reduce ? (
                          <span className="ml-0.5 inline-block h-3 w-px animate-pulse bg-zinc-950" />
                        ) : null}
                      </p>
                      <p className="mt-1 text-[18px] font-bold tabular-nums">
                        {listing ? "$189.00" : "—"}
                      </p>
                      <span
                        className="mt-2 inline-block rounded-full px-3 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase"
                        style={{
                          background: painting ? accent : "#e4e4e7",
                          color: painting ? headerText : "#71717a",
                        }}
                      >
                        Product details
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-4 h-1 overflow-hidden rounded-full bg-background/15">
            <motion.div
              className="h-full bg-brand"
              animate={{ width: `${((beat + 1) / BEATS.length) * 100}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        </div>

        <div className="border-t border-white/10 bg-zinc-950/40 p-4 sm:border-t-0 sm:border-l sm:p-5">
          <EbayLivePreview
            photoSrc={PHOTOS[0].src}
            title={TITLE}
            priceLabel="$189.00"
            storeName={shop}
            live={live}
          />
          <p className="mt-3 text-center text-[11px] text-background/45">
            {live
              ? `Published to ${shop}`
              : beat === 0
                ? "Waiting on photos…"
                : beat === 1
                  ? "Applying store branding…"
                  : "Uploading to eBay…"}
          </p>
        </div>
      </div>
    </section>
  );
}
