"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Globe, Loader2 } from "lucide-react";
import { usePrefersReducedMotion } from "@/components/listing/wizard/use-prefers-reduced-motion";
import { LiveDot } from "@/components/ui/studio";
import {
  EbayWordmark,
  useConnectedEbayStoreName,
} from "@/components/studio/ebay-live-preview";
import { cn } from "@/lib/utils";

const SAMPLE_TITLE = "Milwaukee M18 FUEL 1/2 in. Hammer Drill";
const SAMPLE_PHOTOS = [
  "/demo/m18-front.webp",
  "/demo/m18-label.webp",
  "/demo/m18-box.webp",
  "/demo/m18-angle.webp",
] as const;

const BEATS = [
  { id: "photos", ms: 1800 },
  { id: "draft", ms: 2200 },
  { id: "click", ms: 1000 },
  { id: "ebay", ms: 720 },
  { id: "amazon", ms: 720 },
  { id: "facebook", ms: 720 },
  { id: "web", ms: 720 },
  { id: "hold", ms: 2400 },
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
    }, 22);
    return () => window.clearInterval(t);
  }, [text, on, reduce]);
  return out;
}

function AmazonMark({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-block font-semibold tracking-tight", className)}>
      amazon
      <span
        aria-hidden
        className="absolute right-0 -bottom-1 left-[18%] h-[5px] rounded-full"
        style={{
          background:
            "radial-gradient(120% 120% at 50% -20%, transparent 42%, #FF9900 43%, #FF9900 70%, transparent 71%)",
        }}
      />
    </span>
  );
}

function ChannelShell({
  live,
  children,
}: {
  live: boolean;
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={false}
      animate={{
        opacity: live ? 1 : 0.38,
        y: live ? 0 : 10,
        scale: live ? 1 : 0.98,
      }}
      transition={{ type: "spring", stiffness: 280, damping: 24 }}
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-xl bg-white ring-1",
        live
          ? "shadow-[0_12px_28px_-18px_rgba(0,0,0,0.45)] ring-black/10"
          : "ring-[#e5e5e5]",
      )}
    >
      {children}
    </motion.div>
  );
}

function ProductShot({ live, className }: { live: boolean; className?: string }) {
  return (
    <div className={cn("relative bg-white", className)}>
      <AnimatePresence mode="wait">
        {live ? (
          <motion.img
            key="in"
            src={SAMPLE_PHOTOS[0]}
            alt=""
            initial={{ y: 18, opacity: 0, scale: 0.92 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 340, damping: 26 }}
            className="absolute inset-0 size-full object-contain p-2"
          />
        ) : (
          <motion.div
            key="wait"
            className="absolute inset-0 grid place-items-center bg-[#f7f7f7] text-[10px] font-medium text-[#9b9b9b]"
          >
            Waiting…
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LivePill({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
        on ? "bg-emerald-50 text-emerald-800" : "bg-[#f0f0f0] text-[#9b9b9b]",
      )}
    >
      {on ? <Check className="size-2.5" strokeWidth={3} /> : null}
      {on ? label : "Queued"}
    </span>
  );
}

export function ListingPipeline({
  storeName,
  compact = false,
}: {
  storeName?: string | null;
  compact?: boolean;
}) {
  const reduce = usePrefersReducedMotion();
  const [beat, setBeat] = useState(0);
  const shop = useConnectedEbayStoreName(storeName);
  const typing = useTyped(SAMPLE_TITLE, beat >= 1, reduce);

  const photosOn = beat >= 0;
  const draftOn = beat >= 1;
  const clickOn = beat >= 2;
  const ebayOn = beat >= 3;
  const amazonOn = beat >= 4;
  const facebookOn = beat >= 5;
  const webOn = beat >= 6;
  const allLive = beat >= 7;

  useEffect(() => {
    if (reduce) {
      setBeat(BEATS.length - 1);
      return;
    }
    let i = 0;
    let id = 0;
    const loop = () => {
      id = window.setTimeout(() => {
        i = (i + 1) % BEATS.length;
        setBeat(i);
        loop();
      }, BEATS[i].ms);
    };
    loop();
    return () => window.clearTimeout(id);
  }, [reduce]);

  return (
    <section
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden",
        compact
          ? "rounded-[24px] border border-[#e5e5e5] bg-white p-3.5"
          : "h-full bg-white p-4 sm:p-5",
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-[#707070] uppercase">
          <LiveDot /> One click · every store
        </p>
        <p className="truncate text-[12px] text-[#707070]">
          {allLive ? "Live everywhere" : shop}
        </p>
      </div>

      <div
        className={cn(
          "mt-3 grid min-h-0 flex-1 gap-3",
          compact
            ? "grid-cols-1"
            : "lg:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.3fr)]",
        )}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <div className="relative overflow-hidden rounded-xl border border-[#e5e5e5] bg-[#f7f7f7] p-2.5">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-[#707070] uppercase">
              Photos in
            </p>
            <div className="relative mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-2">
              {SAMPLE_PHOTOS.map((src, i) => (
                <motion.div
                  key={src}
                  initial={false}
                  animate={{
                    opacity: photosOn ? 1 : 0.3,
                    y: photosOn ? 0 : 8,
                  }}
                  transition={{ delay: i * 0.08, duration: 0.35 }}
                  className="relative aspect-square overflow-hidden rounded-lg bg-white"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt=""
                    className="absolute inset-0 size-full object-contain p-1"
                  />
                </motion.div>
              ))}
              {beat === 0 && !reduce ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-8 h-10 bg-gradient-to-b from-[#3665F3]/25 to-transparent [animation:higlou-scan_2s_ease-in-out_infinite]"
                />
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-[#e5e5e5] bg-white p-3">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-[#707070] uppercase">
              Higlou writes
            </p>
            <p className="mt-2 min-h-[40px] text-[13.5px] font-semibold tracking-tight text-[#191919]">
              {draftOn ? typing : "Waiting on photos…"}
              {beat === 1 && typing.length < SAMPLE_TITLE.length ? (
                <span className="ml-0.5 inline-block h-3 w-px animate-pulse bg-[#191919]" />
              ) : null}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  "rounded-md px-2 py-0.5 text-[12px] font-semibold tabular-nums",
                  draftOn
                    ? "bg-[#191919] text-white"
                    : "bg-[#f0f0f0] text-[#9b9b9b]",
                )}
              >
                {draftOn ? "$189.00" : "—"}
              </span>
              <span className="rounded-md bg-[#f0f0f0] px-2 py-0.5 text-[11px] text-[#565959]">
                {draftOn ? "Power Tools" : "Category"}
              </span>
            </div>
            <motion.button
              type="button"
              tabIndex={-1}
              initial={false}
              animate={
                beat === 2
                  ? { scale: [1, 0.94, 1], boxShadow: "0 0 0 8px rgba(54,101,243,0.18)" }
                  : { scale: 1, boxShadow: "0 0 0 0px rgba(54,101,243,0)" }
              }
              transition={{ duration: 0.45 }}
              className={cn(
                "mt-3 inline-flex h-10 w-full items-center justify-center rounded-full text-[13px] font-semibold",
                clickOn
                  ? "bg-[#3665F3] text-white"
                  : "bg-[#e8e8e8] text-[#9b9b9b]",
              )}
            >
              {beat === 2 ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="size-3.5 animate-spin" />
                  Publishing once…
                </span>
              ) : allLive || webOn ? (
                "Published everywhere"
              ) : (
                "Publish once"
              )}
            </motion.button>
            <p className="mt-1.5 text-center text-[11px] text-[#707070]">
              One click → eBay, Amazon, Facebook, your site
            </p>
          </div>
        </div>

        <div
          className={cn(
            "grid min-h-0 gap-2",
            compact ? "grid-cols-2" : "grid-cols-2 lg:h-full lg:grid-rows-2",
          )}
        >
          <ChannelShell live={ebayOn}>
            <div className="flex items-center justify-between border-b border-[#eee] px-2.5 py-1.5">
              <EbayWordmark className="text-[13px]" />
              <LivePill on={ebayOn} label="Live" />
            </div>
            <ProductShot
              live={ebayOn}
              className={compact ? "h-[92px]" : "min-h-[150px] flex-1"}
            />
            <div className="px-2.5 py-2">
              <p className="line-clamp-2 text-[11px] leading-snug font-medium text-[#191919]">
                {SAMPLE_TITLE}
              </p>
              <p className="mt-1 text-[13px] font-semibold tabular-nums">
                {ebayOn ? "$189.00" : "—"}
              </p>
              <p className="mt-0.5 text-[10px] text-[#707070]">
                {ebayOn ? `Buy It Now · ${shop}` : "Your eBay store"}
              </p>
            </div>
          </ChannelShell>

          <ChannelShell live={amazonOn}>
            <div className="flex items-center justify-between bg-[#232F3E] px-2.5 py-1.5">
              <AmazonMark className="text-[13px] text-white" />
              <LivePill on={amazonOn} label="Listed" />
            </div>
            <ProductShot
              live={amazonOn}
              className={compact ? "h-[92px]" : "min-h-[150px] flex-1"}
            />
            <div className="px-2.5 py-2">
              <p className="line-clamp-2 text-[11px] leading-snug font-medium text-[#0F1111]">
                {SAMPLE_TITLE}
              </p>
              <p className="mt-1 text-[13px] font-semibold text-[#B12704]">
                {amazonOn ? "$189.00" : "—"}
              </p>
              <div
                className={cn(
                  "mt-1.5 h-6 rounded-full text-center text-[10px] font-semibold leading-6",
                  amazonOn
                    ? "bg-[#FFD814] text-[#0F1111]"
                    : "bg-[#eee] text-[#9b9b9b]",
                )}
              >
                Add to Cart
              </div>
            </div>
          </ChannelShell>

          <ChannelShell live={facebookOn}>
            <div className="flex items-center justify-between border-b border-[#eee] px-2.5 py-1.5">
              <span className="text-[12px] font-bold text-[#1877F2]">
                facebook <span className="font-semibold text-[#65676B]">Marketplace</span>
              </span>
              <LivePill on={facebookOn} label="Posted" />
            </div>
            <ProductShot
              live={facebookOn}
              className={compact ? "h-[92px]" : "min-h-[150px] flex-1"}
            />
            <div className="px-2.5 py-2">
              <p className="text-[13px] font-semibold text-[#050505]">
                {facebookOn ? "$189" : "—"}
              </p>
              <p className="line-clamp-2 text-[11px] text-[#65676B]">{SAMPLE_TITLE}</p>
              <p className="mt-1 text-[10px] text-[#65676B]">
                {facebookOn ? "Listed just now · Local" : "In your Marketplace"}
              </p>
            </div>
          </ChannelShell>

          <ChannelShell live={webOn}>
            <div className="flex items-center gap-1.5 border-b border-[#eee] bg-[#f7f7f7] px-2.5 py-1.5">
              <span className="size-1.5 rounded-full bg-[#FF5F57]" />
              <span className="size-1.5 rounded-full bg-[#FEBC2E]" />
              <span className="size-1.5 rounded-full bg-[#28C840]" />
              <span className="ml-1 flex min-w-0 flex-1 items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] text-[#707070]">
                <Globe className="size-2.5 shrink-0" />
                <span className="truncate">yoursite.com / drill</span>
              </span>
              <LivePill on={webOn} label="On site" />
            </div>
            <ProductShot
              live={webOn}
              className={compact ? "h-[92px]" : "min-h-[150px] flex-1"}
            />
            <div className="px-2.5 py-2">
              <p className="line-clamp-2 text-[12px] font-semibold text-[#191919]">
                {SAMPLE_TITLE}
              </p>
              <p className="mt-1 text-[12px] font-semibold tabular-nums">
                {webOn ? "$189.00" : "—"}
              </p>
              <p className="mt-0.5 text-[10px] text-[#707070]">
                Same photos, title, and price — your website
              </p>
            </div>
          </ChannelShell>
        </div>
      </div>
    </section>
  );
}
