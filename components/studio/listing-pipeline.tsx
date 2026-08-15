"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Globe, MousePointer2 } from "lucide-react";
import { usePrefersReducedMotion } from "@/components/listing/wizard/use-prefers-reduced-motion";
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
const PRICE = 189;

const STEPS = [
  { id: "photos", ms: 2800, x: 9, y: 8, click: true, caption: "Drop photos" },
  { id: "write", ms: 2600, x: 38, y: 8, click: false, caption: "Higlou writes the listing" },
  { id: "aim", ms: 900, x: 91, y: 8, click: false, caption: "Move to Publish" },
  { id: "publish", ms: 1100, x: 91, y: 8, click: true, caption: "Click Publish" },
  { id: "ebay", ms: 1200, x: 16, y: 38, click: true, caption: "Live on eBay" },
  { id: "amazon", ms: 1200, x: 50, y: 38, click: true, caption: "Then Amazon" },
  { id: "facebook", ms: 1200, x: 84, y: 38, click: true, caption: "Then Facebook" },
  { id: "shopify", ms: 1200, x: 24, y: 70, click: true, caption: "Then Shopify" },
  { id: "web", ms: 1200, x: 76, y: 70, click: true, caption: "Then your site" },
  { id: "sales", ms: 2200, x: 58, y: 93, click: false, caption: "Sales start climbing" },
  { id: "hold", ms: 2800, x: 58, y: 93, click: false, caption: "Two clicks. Five stores." },
] as const;

const SALES_DOLLARS = [0, 0, 0, 0, 189, 378, 567, 945, 1323, 1890, 2268] as const;
const SALES_LINE =
  "M0 36 C40 35 70 34 96 32 C130 29 150 24 176 18 C204 11 230 7 256 4 C284 1 304 1 320 1";

function salesProgress(beat: number) {
  if (beat < 4) return 0.06;
  if (beat <= 8) return 0.18 + (beat - 4) * 0.12;
  if (beat === 9) return 0.92;
  return 1;
}

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

function useCountUp(target: number, on: boolean, reduce: boolean) {
  const [n, setN] = useState(reduce && on ? target : 0);
  useEffect(() => {
    if (!on) {
      setN(0);
      return;
    }
    if (reduce) {
      setN(target);
      return;
    }
    setN(0);
    const start = performance.now();
    const dur = 720;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      setN(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, on, reduce]);
  return n;
}

function useCountToward(target: number, reduce: boolean) {
  const [n, setN] = useState(reduce ? target : 0);
  const current = useRef(reduce ? target : 0);

  useEffect(() => {
    if (reduce) {
      current.current = target;
      setN(target);
      return;
    }
    const from = current.current;
    const start = performance.now();
    const dur = 620;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const val = Math.round(from + (target - from) * (1 - (1 - t) ** 3));
      current.current = val;
      setN(val);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduce]);

  return n;
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

function ShopifyMark() {
  return (
    <span className="inline-flex items-center gap-1.5 text-white">
      <svg viewBox="0 0 20 20" className="size-4" aria-hidden>
        <path
          fill="#95BF47"
          d="M5.4 6.4 6.5 17.2c.08.7.68 1.2 1.38 1.2h6.04c.7 0 1.3-.5 1.38-1.2l1.1-10.8H5.4Z"
        />
        <path
          fill="none"
          stroke="#95BF47"
          strokeWidth="1.5"
          d="M7.4 6.4V5.2a2.6 2.6 0 0 1 5.2 0v1.2"
        />
      </svg>
      <span className="text-[14px] font-semibold tracking-tight">Shopify</span>
    </span>
  );
}

function GuideCursor({
  x,
  y,
  click,
  visible,
  label,
  clickKey,
}: {
  x: number;
  y: number;
  click: boolean;
  visible: boolean;
  label: string;
  clickKey: string;
}) {
  return (
    <motion.div
      className="pointer-events-none absolute z-30"
      initial={false}
      animate={{
        left: `${x}%`,
        top: `${y}%`,
        opacity: visible ? 1 : 0,
      }}
      transition={{ type: "spring", stiffness: 170, damping: 22 }}
    >
      <motion.div
        key={clickKey}
        initial={false}
        animate={click ? { scale: [1, 0.78, 1] } : { scale: 1 }}
        transition={{ duration: 0.38, times: [0, 0.35, 1] }}
        className="relative -translate-x-0.5 -translate-y-0.5"
      >
        {click ? (
          <motion.span
            initial={{ scale: 0.3, opacity: 0.45 }}
            animate={{ scale: 2.1, opacity: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            className="absolute top-0 left-0 size-7 rounded-full border-2 border-[#141414]"
          />
        ) : null}
        <MousePointer2
          className="size-6 text-[#141414] drop-shadow-[0_2px_6px_rgba(0,0,0,0.28)]"
          fill="white"
          strokeWidth={1.75}
        />
      </motion.div>
      <span className="mt-1 ml-5 inline-block whitespace-nowrap rounded-md bg-[#141414] px-2 py-0.5 text-[11px] font-medium text-white shadow-sm">
        {label}
      </span>
    </motion.div>
  );
}

function ChannelShell({
  live,
  focused,
  className,
  children,
}: {
  live: boolean;
  focused?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={false}
      animate={{
        opacity: live ? 1 : focused ? 0.72 : 0.34,
        filter: live ? "saturate(1)" : "saturate(0.45)",
      }}
      transition={{ type: "spring", stiffness: 220, damping: 28 }}
      className={cn(
        "relative flex min-h-0 flex-col overflow-hidden bg-white",
        focused && "z-10 ring-2 ring-inset ring-[#141414]/25",
        className,
      )}
    >
      {children}
      <AnimatePresence>
        {live ? (
          <motion.span
            key="flash"
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.65, ease: "easeOut" }}
            className="pointer-events-none absolute inset-0 bg-white"
          />
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

function ProductShot({
  live,
  src,
}: {
  live: boolean;
  src: string;
}) {
  return (
    <div className="relative min-h-0 flex-1 bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <motion.img
        src={src}
        alt=""
        initial={false}
        animate={{ opacity: live ? 1 : 0.1, scale: live ? 1 : 0.97 }}
        transition={{ duration: 0.4 }}
        className="absolute inset-0 size-full object-contain p-3"
      />
    </div>
  );
}

function LivePill({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide",
        on ? "bg-emerald-50 text-emerald-800" : "bg-[#f3f3f3] text-[#9b9b9b]",
      )}
    >
      {on ? <Check className="size-2.5" strokeWidth={3} /> : null}
      {on ? label : "Queued"}
    </span>
  );
}

function SalesStrip({
  beat,
  dollars,
  reduce,
  caption,
}: {
  beat: number;
  dollars: number;
  reduce: boolean;
  caption: string;
}) {
  const progress = reduce ? 1 : salesProgress(beat);
  const click1 = beat >= 1;
  const click2 = beat >= 3;
  const climbing = beat >= 4;

  return (
    <div className="flex h-[52px] shrink-0 items-center gap-3 border-t border-[#e5e5e5] bg-white px-3 sm:gap-4 sm:px-4">
      <div className="flex shrink-0 items-center gap-1.5">
        <span
          className={cn(
            "grid size-5 place-items-center rounded text-[10px] font-semibold",
            click1 ? "bg-[#141414] text-white" : "bg-[#eee] text-[#bbb]",
          )}
        >
          1
        </span>
        <span className="text-[11px] text-[#ccc]">→</span>
        <span
          className={cn(
            "grid size-5 place-items-center rounded text-[10px] font-semibold",
            click2 ? "bg-[#141414] text-white" : "bg-[#eee] text-[#bbb]",
          )}
        >
          2
        </span>
      </div>

      <svg
        viewBox="0 0 320 40"
        className="h-8 min-w-0 flex-1"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path d={`${SALES_LINE} L320 40 L0 40 Z`} fill="#008060" opacity={0.08} />
        <motion.path
          d={SALES_LINE}
          fill="none"
          stroke="#141414"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: progress }}
          transition={{ duration: reduce ? 0 : 0.85, ease: "easeOut" }}
        />
      </svg>

      <div className="hidden min-w-0 shrink-0 sm:block">
        <p className="text-[12px] font-medium tracking-tight text-[#565959]">
          {caption}
        </p>
      </div>

      <div className="w-[92px] shrink-0 text-right sm:w-[108px]">
        <p className="text-[15px] font-semibold tabular-nums tracking-tight text-[#141414]">
          ${dollars.toLocaleString("en-US")}
        </p>
        <p className="text-[11px] text-[#707070]">
          {climbing ? "sales up" : "after publish"}
        </p>
      </div>
    </div>
  );
}

export function ListingPipeline({
  storeName,
  compact = false,
  className,
  photos,
}: {
  storeName?: string | null;
  compact?: boolean;
  className?: string;
  photos?: string[] | null;
}) {
  const reduce = usePrefersReducedMotion();
  const [beat, setBeat] = useState(0);
  const [photoN, setPhotoN] = useState(reduce ? 4 : 0);
  const shop = useConnectedEbayStoreName(storeName);
  const typing = useTyped(SAMPLE_TITLE, beat >= 1, reduce);
  const price = useCountUp(PRICE, beat >= 1, reduce);
  const sales = useCountToward(
    SALES_DOLLARS[Math.min(beat, SALES_DOLLARS.length - 1)] ?? 0,
    reduce,
  );
  const shots =
    photos && photos.length > 0 ? photos.slice(0, 4) : [...SAMPLE_PHOTOS];
  const cover = shots[0] || SAMPLE_PHOTOS[0];
  const step = STEPS[beat] ?? STEPS[0];

  const draftOn = beat >= 1;
  const clickOn = beat >= 3;
  const ebayOn = beat >= 4;
  const amazonOn = beat >= 5;
  const facebookOn = beat >= 6;
  const shopifyOn = beat >= 7;
  const webOn = beat >= 8;
  const allLive = beat >= 9;
  const shownPhotos = beat === 0 ? photoN : shots.length;

  const cursorX =
    beat === 0 ? 6 + Math.max(0, photoN - 1) * 4.2 : step.x;

  useEffect(() => {
    if (reduce) {
      setBeat(STEPS.length - 1);
      setPhotoN(4);
      return;
    }
    let i = 0;
    let id = 0;
    const loop = () => {
      id = window.setTimeout(() => {
        i = (i + 1) % STEPS.length;
        setBeat(i);
        loop();
      }, STEPS[i].ms);
    };
    loop();
    return () => window.clearTimeout(id);
  }, [reduce]);

  useEffect(() => {
    if (reduce || beat !== 0) {
      if (beat !== 0) setPhotoN(shots.length);
      return;
    }
    setPhotoN(0);
    let n = 0;
    const t = window.setInterval(() => {
      n += 1;
      setPhotoN(Math.min(shots.length, n));
      if (n >= shots.length) window.clearInterval(t);
    }, 580);
    return () => window.clearInterval(t);
  }, [beat, reduce, shots.length]);

  return (
    <section
      className={cn(
        "relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white",
        compact && "rounded-2xl border border-[#e5e5e5]",
        className,
      )}
    >
      {!reduce ? (
        <GuideCursor
          x={cursorX}
          y={step.y}
          click={step.click}
          visible
          label={step.caption}
          clickKey={`${step.id}-${beat === 0 ? photoN : beat}`}
        />
      ) : null}

      <div className="flex shrink-0 items-center gap-3 border-b border-[#e5e5e5] bg-white px-3 py-2.5 sm:px-4">
        <div className="relative flex shrink-0 items-center gap-1">
          {shots.map((src, i) => (
            <motion.div
              key={src}
              initial={false}
              animate={{
                opacity: i < shownPhotos ? 1 : 0.22,
                y: i < shownPhotos ? 0 : 8,
                scale: i < shownPhotos ? 1 : 0.94,
              }}
              transition={{ type: "spring", stiffness: 320, damping: 24 }}
              className="relative size-11 overflow-hidden rounded-md bg-[#f7f7f7] sm:size-12"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="absolute inset-0 size-full object-contain p-0.5" />
            </motion.div>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold tracking-tight text-[#191919] sm:text-[15px]">
            {draftOn ? typing : "Drop photos. Higlou writes the rest."}
            {beat === 1 && typing.length < SAMPLE_TITLE.length ? (
              <span className="ml-0.5 inline-block h-3 w-px animate-pulse bg-[#191919]" />
            ) : null}
          </p>
          <p className="mt-0.5 text-[12px] text-[#707070]">
            {draftOn ? (
              <span className="font-semibold tabular-nums text-[#191919]">
                ${price.toFixed(2)}
              </span>
            ) : (
              step.caption
            )}
            {draftOn && beat < 3 ? " · writing…" : null}
            {clickOn ? " · eBay · Amazon · Facebook · Shopify · site" : null}
          </p>
        </div>
        <motion.div
          initial={false}
          animate={
            beat === 3
              ? { scale: [1, 0.9, 1], boxShadow: "0 0 0 8px rgba(20,20,20,0.1)" }
              : { scale: 1, boxShadow: "0 0 0 0px rgba(20,20,20,0)" }
          }
          transition={{ duration: 0.42 }}
          className={cn(
            "inline-flex h-10 shrink-0 items-center rounded-md px-4 text-[13px] font-semibold tracking-[-0.01em]",
            clickOn ? "bg-[#141414] text-white" : "bg-[#ececec] text-[#9b9b9b]",
          )}
        >
          {beat === 3 ? "Publishing" : allLive || webOn ? "Live" : "Publish"}
        </motion.div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-6 grid-rows-2 divide-x divide-y divide-[#e5e5e5]">
        <ChannelShell live={ebayOn} focused={beat === 4} className="col-span-2">
          <div className="flex shrink-0 items-center justify-between border-b border-[#eee] px-3 py-2">
            <EbayWordmark className="text-[16px]" />
            <LivePill on={ebayOn} label="Live" />
          </div>
          <ProductShot live={ebayOn} src={cover} />
          <div className="shrink-0 px-3 py-2">
            <p className="text-[16px] font-semibold tabular-nums">
              {ebayOn ? "$189.00" : "—"}
            </p>
            <p className="truncate text-[12px] text-[#707070]">
              {ebayOn ? `Buy It Now · ${shop}` : "eBay store"}
            </p>
          </div>
        </ChannelShell>

        <ChannelShell live={amazonOn} focused={beat === 5} className="col-span-2">
          <div className="flex shrink-0 items-center justify-between bg-[#232F3E] px-3 py-2">
            <AmazonMark className="text-[15px] text-white" />
            <LivePill on={amazonOn} label="Listed" />
          </div>
          <ProductShot live={amazonOn} src={cover} />
          <div className="shrink-0 px-3 py-2">
            <p className="text-[16px] font-semibold text-[#B12704]">
              {amazonOn ? "$189.00" : "—"}
            </p>
            <p className="truncate text-[12px] text-[#707070]">Amazon · Add to Cart</p>
          </div>
        </ChannelShell>

        <ChannelShell live={facebookOn} focused={beat === 6} className="col-span-2">
          <div className="flex shrink-0 items-center justify-between border-b border-[#eee] px-3 py-2">
            <span className="text-[13px] font-bold text-[#1877F2]">
              facebook <span className="font-semibold text-[#65676B]">Marketplace</span>
            </span>
            <LivePill on={facebookOn} label="Posted" />
          </div>
          <ProductShot live={facebookOn} src={cover} />
          <div className="shrink-0 px-3 py-2">
            <p className="text-[16px] font-semibold">{facebookOn ? "$189" : "—"}</p>
            <p className="truncate text-[12px] text-[#707070]">
              {facebookOn ? "Listed just now" : "Facebook Marketplace"}
            </p>
          </div>
        </ChannelShell>

        <ChannelShell live={shopifyOn} focused={beat === 7} className="col-span-3">
          <div className="flex shrink-0 items-center justify-between bg-[#212326] px-3 py-2">
            <ShopifyMark />
            <LivePill on={shopifyOn} label="On store" />
          </div>
          <ProductShot live={shopifyOn} src={cover} />
          <div className="shrink-0 px-3 py-2">
            <p className="text-[16px] font-semibold tabular-nums">
              {shopifyOn ? "$189.00" : "—"}
            </p>
            <p
              className={cn(
                "mt-1.5 grid h-8 place-items-center rounded-md text-[12px] font-semibold",
                shopifyOn ? "bg-[#008060] text-white" : "bg-[#eee] text-[#bbb]",
              )}
            >
              Add to cart
            </p>
          </div>
        </ChannelShell>

        <ChannelShell live={webOn} focused={beat === 8} className="col-span-3">
          <div className="flex shrink-0 items-center gap-1.5 border-b border-[#eee] bg-[#f7f7f7] px-3 py-2">
            <span className="size-1.5 rounded-full bg-[#FF5F57]" />
            <span className="size-1.5 rounded-full bg-[#FEBC2E]" />
            <span className="size-1.5 rounded-full bg-[#28C840]" />
            <span className="ml-1 flex min-w-0 flex-1 items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] text-[#707070]">
              <Globe className="size-3 shrink-0" />
              <span className="truncate">yoursite.com</span>
            </span>
            <LivePill on={webOn} label="On site" />
          </div>
          <ProductShot live={webOn} src={cover} />
          <div className="shrink-0 px-3 py-2">
            <p className="text-[16px] font-semibold tabular-nums">
              {webOn ? "$189.00" : "—"}
            </p>
            <p className="truncate text-[12px] text-[#707070]">Your website</p>
          </div>
        </ChannelShell>
      </div>

      <SalesStrip
        beat={beat}
        dollars={sales}
        reduce={reduce}
        caption={step.caption}
      />
    </section>
  );
}
