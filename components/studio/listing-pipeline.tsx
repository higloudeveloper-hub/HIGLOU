"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Globe, MousePointer2, Search, ShoppingCart, Star } from "lucide-react";
import { usePrefersReducedMotion } from "@/components/listing/wizard/use-prefers-reduced-motion";
import {
  EbayLivePreview,
  EbayWordmark,
  useConnectedEbayStoreName,
} from "@/components/studio/ebay-live-preview";
import { cn } from "@/lib/utils";

const CATALOG = [
  {
    name: "Watch",
    title: "Automatic Stainless Chronograph — Unworn",
    description: "Unworn steel chronograph. Black sunburst dial, oyster bracelet, box ready.",
    price: 1895,
    comps: 2290,
    photos: [
      "/demo/wow-watch.webp",
      "/demo/wow-watch-dial.webp",
      "/demo/wow-watch-side.webp",
    ],
  },
  {
    name: "Headphones",
    title: "Wireless Noise Cancelling Headphones",
    description: "Wireless ANC, 30-hour battery, champagne metal yoke, unmarked.",
    price: 349,
    comps: 429,
    photos: ["/demo/wow-headphones.webp", "/demo/wow-headphones-side.webp", "/demo/wow-headphones-cup.webp"],
  },
  {
    name: "Sneakers",
    title: "Premium Leather Court Sneakers — White",
    description: "Full-grain leather court sneaker. Clean white, unworn pair.",
    price: 220,
    comps: 279,
    photos: ["/demo/wow-sneakers.webp", "/demo/wow-sneakers-pair.webp", "/demo/wow-sneakers-top.webp"],
  },
  {
    name: "Gold",
    title: "14K Gold Cuban Link Bracelet",
    description: "Solid 14K yellow gold Cuban link. Stamped, heavy, ready to ship.",
    price: 2450,
    comps: 2890,
    photos: ["/demo/wow-gold.webp", "/demo/wow-gold-line.webp", "/demo/wow-gold-links.webp"],
  },
  {
    name: "Camera",
    title: "Full-Frame Mirrorless Camera + 50mm",
    description: "Full-frame body with 50mm prime. Low shutter, clean sensor.",
    price: 1799,
    comps: 2199,
    photos: ["/demo/wow-camera.webp", "/demo/wow-camera-back.webp", "/demo/wow-camera-lens.webp"],
  },
] as const;

const STEPS = [
  { id: "grab", ms: 1400, x: 14, y: 74, click: true, label: "Grab one photo" },
  { id: "drag", ms: 2100, x: 9, y: 11, click: false, label: "Drop on listing" },
  { id: "drop", ms: 1100, x: 9, y: 11, click: true, label: "Photo in" },
  { id: "photos", ms: 2400, x: 22, y: 8, click: false, label: "Higlou adds shots" },
  { id: "title", ms: 2400, x: 40, y: 8, click: false, label: "Title writes itself" },
  { id: "desc", ms: 2000, x: 40, y: 8, click: false, label: "Description" },
  { id: "compare", ms: 1800, x: 40, y: 8, click: false, label: "Priced vs sold comps" },
  { id: "fillEbay", ms: 1200, x: 16, y: 38, click: false, label: "eBay" },
  { id: "fillAmazon", ms: 1100, x: 50, y: 38, click: false, label: "Amazon" },
  { id: "fillFacebook", ms: 1100, x: 84, y: 38, click: false, label: "Facebook" },
  { id: "fillShopify", ms: 1100, x: 24, y: 70, click: false, label: "Shopify" },
  { id: "fillWeb", ms: 1200, x: 76, y: 70, click: false, label: "Your site" },
  { id: "ready", ms: 1100, x: 91, y: 8, click: false, label: "Publish" },
  { id: "publish", ms: 1800, x: 91, y: 8, click: true, label: "Publishing" },
  { id: "ebayLive", ms: 1200, x: 16, y: 38, click: false, label: "Live on eBay" },
  { id: "amazonLive", ms: 1100, x: 50, y: 38, click: false, label: "Live on Amazon" },
  { id: "facebookLive", ms: 1100, x: 84, y: 38, click: false, label: "Live on Facebook" },
  { id: "shopifyLive", ms: 1100, x: 24, y: 70, click: false, label: "Live on Shopify" },
  { id: "webLive", ms: 1200, x: 76, y: 70, click: false, label: "Live on your site" },
  { id: "sales", ms: 2600, x: 88, y: 93, click: false, label: "Revenue" },
  { id: "hold", ms: 2200, x: 88, y: 93, click: false, label: "Next product" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

function stepIndex(id: StepId) {
  return STEPS.findIndex((s) => s.id === id);
}

const CURSOR_OFF: ReadonlySet<string> = new Set([
  "drag",
  "fillEbay",
  "fillAmazon",
  "fillFacebook",
  "fillShopify",
  "fillWeb",
  "ebayLive",
  "amazonLive",
  "facebookLive",
  "shopifyLive",
  "webLive",
]);

function ordersAt(beat: number) {
  const sales = stepIndex("sales");
  if (beat < sales) return 0;
  if (beat === sales) return 4;
  return 9;
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
    }, 32);
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
    const dur = 980;
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
    const dur = 920;
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
  clickKey,
  label,
}: {
  x: number;
  y: number;
  click: boolean;
  visible: boolean;
  clickKey: string;
  label: string;
}) {
  const flip = x > 70;
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
            animate={{ scale: 2.4, opacity: 0 }}
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
      <AnimatePresence mode="wait">
        <motion.span
          key={clickKey}
          initial={{ opacity: 0, y: 6, x: flip ? 8 : -8 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
          className={cn(
            "absolute top-7 whitespace-nowrap rounded-md bg-[#141414] px-2 py-1 text-[12px] font-medium text-white shadow-[0_8px_20px_-10px_rgba(0,0,0,0.45)]",
            flip ? "right-1" : "left-5",
          )}
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </motion.div>
  );
}

function DragGhost({
  src,
  x,
  y,
  phase,
}: {
  src: string;
  x: number;
  y: number;
  phase: "grab" | "drag" | "drop" | "gone";
}) {
  const holding = phase === "grab" || phase === "drag";
  return (
    <motion.div
      className="pointer-events-none absolute z-30"
      initial={false}
      animate={{
        left: `${x}%`,
        top: `${y}%`,
        opacity: phase === "gone" ? 0 : 1,
        scale: phase === "drop" ? 0.16 : phase === "grab" ? 1 : 1.08,
        rotate: phase === "grab" ? -4 : phase === "drag" ? -12 : 0,
      }}
      transition={{
        type: "spring",
        stiffness: phase === "drag" ? 78 : 150,
        damping: phase === "drag" ? 14 : 18,
      }}
    >
      <div
        className={cn(
          "relative overflow-hidden bg-white",
          holding
            ? "-translate-x-1/2 -translate-y-[108%] h-[148px] w-[118px] rounded-[4px] p-1.5 pb-7 shadow-[0_28px_50px_-18px_rgba(0,0,0,0.45)] ring-1 ring-black/10 sm:h-[168px] sm:w-[132px]"
            : "-translate-x-1/2 -translate-y-1/2 size-12 rounded-md shadow-[0_10px_24px_-12px_rgba(0,0,0,0.4)] ring-1 ring-black/10",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="size-full object-contain" />
      </div>
    </motion.div>
  );
}

function ChannelShell({
  live,
  filled,
  focused,
  className,
  children,
}: {
  live: boolean;
  filled?: boolean;
  focused?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const on = live || filled;
  return (
    <motion.div
      initial={false}
      animate={{
        opacity: on ? 1 : focused ? 0.7 : 0.28,
        filter: on ? "saturate(1)" : "saturate(0.35)",
        y: on ? 0 : 8,
      }}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
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
            initial={{ opacity: 0.45 }}
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

function LivePhoto({ src, className }: { src: string; className?: string }) {
  return (
    <div className={cn("relative min-h-0 flex-1 overflow-hidden bg-white", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <motion.img
        key={src}
        src={src}
        alt=""
        initial={{ y: -44, opacity: 0, scale: 0.9 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 22 }}
        className="absolute inset-0 size-full object-contain p-2"
      />
    </div>
  );
}

function Stamp({
  delay,
  children,
  className,
}: {
  delay: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function AmazonStorefront({
  src,
  title,
  price,
}: {
  src: string;
  title: string;
  price: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex shrink-0 items-center gap-2 bg-[#131921] px-2 py-1.5">
        <AmazonMark className="text-[13px] text-white" />
        <div className="flex min-w-0 flex-1 overflow-hidden rounded-sm">
          <span className="min-w-0 flex-1 truncate bg-white px-2 py-1 text-[10px] text-[#888]">
            Search Amazon
          </span>
          <span className="grid w-7 shrink-0 place-items-center bg-[#FEBD69] text-[#131921]">
            <Search className="size-3" strokeWidth={2.4} />
          </span>
        </div>
        <ShoppingCart className="size-3.5 shrink-0 text-white" />
      </div>
      <LivePhoto src={src} />
      <div className="shrink-0 px-2.5 pb-2.5 pt-1">
        <Stamp delay={0.12}>
          <p className="line-clamp-2 text-[11px] leading-snug text-[#0F1111]">{title}</p>
          <p className="mt-0.5 flex items-center gap-0.5 text-[10px] text-[#007185]">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="size-2.5 fill-[#DE7921] text-[#DE7921]" />
            ))}
            <span className="ml-1">1,284</span>
          </p>
        </Stamp>
        <Stamp delay={0.22}>
          <p className="text-[20px] font-semibold tabular-nums text-[#0F1111]">{price}</p>
          <p className="text-[10px] font-semibold text-[#C45500]">FREE delivery Tomorrow</p>
          <p className="text-[10px] font-medium text-[#007600]">In Stock</p>
        </Stamp>
        <Stamp delay={0.34} className="mt-1.5 grid gap-1">
          <p className="grid h-7 place-items-center rounded-full bg-[#FFD814] text-[11px] font-semibold text-[#0F1111]">
            Add to Cart
          </p>
          <p className="grid h-7 place-items-center rounded-full bg-[#FFA41C] text-[11px] font-semibold text-[#0F1111]">
            Buy Now
          </p>
        </Stamp>
      </div>
    </div>
  );
}

function FacebookStorefront({
  src,
  title,
  price,
  seller,
}: {
  src: string;
  title: string;
  price: string;
  seller: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex shrink-0 items-center justify-between border-b border-[#E4E6EB] px-2.5 py-2">
        <span className="text-[13px] font-bold tracking-tight text-[#0866FF]">
          marketplace
        </span>
        <Search className="size-3.5 text-[#050505]" />
      </div>
      <Stamp delay={0.06} className="flex shrink-0 items-center gap-2 px-2.5 py-1.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#E4E6EB] text-[10px] font-bold text-[#050505]">
          {seller.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[12px] font-semibold text-[#050505]">{seller}</p>
          <p className="text-[10px] text-[#65676B]">Listed just now · Nearby</p>
        </div>
      </Stamp>
      <LivePhoto src={src} className="bg-[#F0F2F5]" />
      <div className="shrink-0 px-2.5 py-2">
        <Stamp delay={0.2}>
          <p className="text-[20px] font-bold tabular-nums text-[#050505]">{price}</p>
          <p className="line-clamp-1 text-[12px] text-[#050505]">{title}</p>
        </Stamp>
        <Stamp delay={0.34} className="mt-1.5">
          <p className="grid h-8 place-items-center rounded-md bg-[#E7F3FF] text-[12px] font-semibold text-[#0866FF]">
            Message
          </p>
        </Stamp>
      </div>
    </div>
  );
}

function ShopifyStorefront({
  src,
  title,
  price,
}: {
  src: string;
  title: string;
  price: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <p className="shrink-0 bg-[#121212] py-1 text-center text-[10px] font-medium tracking-wide text-white">
        Free shipping over $50
      </p>
      <div className="flex shrink-0 items-center justify-between border-b border-[#e5e5e5] px-3 py-2">
        <span className="text-[13px] font-semibold tracking-tight">Your store</span>
        <ShoppingCart className="size-3.5" />
      </div>
      <LivePhoto src={src} />
      <div className="shrink-0 px-3 pb-3 pt-1.5">
        <Stamp delay={0.14}>
          <p className="text-[10px] font-medium tracking-[0.14em] text-[#6a6a6a]">
            HIGLOU
          </p>
          <p className="line-clamp-2 text-[13px] font-medium tracking-tight">{title}</p>
          <p className="mt-1 text-[16px] tabular-nums">{price}</p>
        </Stamp>
        <Stamp delay={0.32} className="mt-2 grid gap-1">
          <p className="grid h-8 place-items-center rounded-md bg-[#121212] text-[12px] font-semibold text-white">
            Add to cart
          </p>
          <p className="grid h-8 place-items-center rounded-md bg-[#008060] text-[12px] font-semibold text-white">
            Buy it now
          </p>
        </Stamp>
      </div>
    </div>
  );
}

function SiteStorefront({
  src,
  title,
  price,
  slug,
}: {
  src: string;
  title: string;
  price: string;
  slug: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-[#e5e5e5] bg-[#f3f3f3] px-2 py-1.5">
        <span className="size-1.5 rounded-full bg-[#FF5F57]" />
        <span className="size-1.5 rounded-full bg-[#FEBC2E]" />
        <span className="size-1.5 rounded-full bg-[#28C840]" />
        <span className="ml-1 flex min-w-0 flex-1 items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] text-[#707070]">
          <Globe className="size-3 shrink-0" />
          <motion.span
            key={slug}
            initial={{ opacity: 0.35 }}
            animate={{ opacity: 1 }}
            className="truncate"
          >
            yoursite.com/products/{slug}
          </motion.span>
        </span>
      </div>
      <div className="flex shrink-0 items-center justify-between border-b border-[#eee] px-3 py-2">
        <span className="text-[13px] font-semibold tracking-tight">HIGLOU</span>
        <span className="text-[11px] text-[#707070]">Shop · About · Cart</span>
      </div>
      <LivePhoto src={src} />
      <div className="shrink-0 px-3 pb-3 pt-1.5">
        <Stamp delay={0.14}>
          <p className="text-[11px] text-[#707070]">Home / Shop / {title}</p>
          <p className="mt-0.5 line-clamp-2 text-[14px] font-semibold tracking-tight">{title}</p>
          <p className="mt-1 text-[18px] font-semibold tabular-nums">{price}</p>
        </Stamp>
        <Stamp delay={0.32} className="mt-2">
          <p className="grid h-9 place-items-center rounded-md bg-[#141414] text-[12px] font-semibold text-white">
            Add to bag
          </p>
        </Stamp>
      </div>
    </div>
  );
}

const HOUR_BARS = [11, 17, 13, 21, 16, 28, 24, 36, 31, 44, 40, 52, 58, 72];

function moneyLabel(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function SalesStrip({
  dollars,
  sold,
  reduce,
}: {
  dollars: number;
  sold: number;
  reduce: boolean;
}) {
  const lit =
    reduce && sold > 0
      ? HOUR_BARS.length
      : sold === 0
        ? 0
        : Math.max(2, Math.round((sold / 10) * HOUR_BARS.length));

  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-t border-[#e5e5e5] bg-white px-3 sm:gap-4 sm:px-4">
      <div className="w-[72px] shrink-0 sm:w-[84px]">
        <p className="text-[10px] font-medium tracking-[0.14em] text-[#8a8a8a] uppercase">
          Today
        </p>
        <p className="text-[12px] tabular-nums text-[#565959]">
          {sold} {sold === 1 ? "order" : "orders"}
        </p>
      </div>

      <div className="flex h-8 min-w-0 flex-1 items-end gap-[3px]" aria-hidden>
        {HOUR_BARS.map((h, i) => (
          <div
            key={i}
            className="relative h-full min-w-0 flex-1 overflow-hidden rounded-[1px] bg-[#f0f0f0]"
          >
            <motion.div
              className="absolute inset-x-0 bottom-0 bg-[#141414]"
              initial={false}
              animate={{ height: i < lit ? `${h}%` : "0%" }}
              transition={{
                duration: reduce ? 0 : 0.4,
                ease: [0.22, 1, 0.36, 1],
              }}
            />
          </div>
        ))}
      </div>

      <div className="w-[96px] shrink-0 text-right sm:w-[112px]">
        <p className="text-[16px] font-semibold tabular-nums tracking-tight text-[#141414]">
          {moneyLabel(dollars)}
        </p>
        <p className="text-[11px] text-[#8a8a8a]">revenue</p>
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
  const [sku, setSku] = useState(0);
  const [filled, setFilled] = useState(reduce ? 4 : 0);
  const shop = useConnectedEbayStoreName(storeName);
  const catalog =
    photos && photos.length > 0
      ? [
          {
            name: "Your listing",
            title: "Your listing",
            description: "Higlou writes the description from your photo.",
            price: 189,
            comps: 240,
            photos: photos.slice(0, 4),
          },
        ]
      : CATALOG;
  const item = catalog[sku % catalog.length] ?? CATALOG[0];
  const shots = [...item.photos];
  const cover = shots[0] || CATALOG[0].photos[0];
  const slug = item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const sold = ordersAt(beat);
  const money = sold * item.price;
  const step = STEPS[beat] ?? STEPS[0];
  const at = (id: StepId) => beat >= stepIndex(id);
  const is = (id: StepId) => step.id === id;
  const typing = useTyped(item.title, at("title"), reduce);
  const descTyping = useTyped(item.description, at("desc"), reduce);
  const price = useCountUp(item.price, at("compare"), reduce);
  const sales = useCountToward(money, reduce);

  const photoIn = at("drop");
  const dragging = beat <= stepIndex("drag");
  const photosOn = at("photos");
  const draftOn = at("title");
  const descOn = at("desc");
  const priceOn = at("compare");
  const ebayIn = at("fillEbay");
  const amazonIn = at("fillAmazon");
  const facebookIn = at("fillFacebook");
  const shopifyIn = at("fillShopify");
  const webIn = at("fillWeb");
  const readyOn = at("ready");
  const publishing = is("publish");
  const ebayLive = at("ebayLive");
  const amazonLive = at("amazonLive");
  const facebookLive = at("facebookLive");
  const shopifyLive = at("shopifyLive");
  const webLive = at("webLive");
  const liveOn = at("ebayLive");
  const allLive = at("webLive");
  const dragPhase =
    is("grab") ? "grab" : is("drag") ? "drag" : is("drop") ? "drop" : "gone";
  const priceLabel = `$${item.price.toFixed(2)}`;
  const compsLabel = `$${item.comps.toLocaleString("en-US")}`;

  useEffect(() => {
    if (reduce) {
      setBeat(STEPS.length - 1);
      return;
    }
    let i = 0;
    let id = 0;
    const loop = () => {
      id = window.setTimeout(() => {
        i += 1;
        if (i >= STEPS.length) {
          i = 0;
          setSku((n) => n + 1);
        }
        setBeat(i);
        loop();
      }, STEPS[i].ms);
    };
    loop();
    return () => window.clearTimeout(id);
  }, [reduce]);

  useEffect(() => {
    if (reduce) {
      setFilled(shots.length);
      return;
    }
    if (!photoIn) {
      setFilled(0);
      return;
    }
    if (!photosOn) {
      setFilled(1);
      return;
    }
    setFilled(1);
    let n = 1;
    const t = window.setInterval(() => {
      n += 1;
      setFilled(Math.min(shots.length, n));
      if (n >= shots.length) window.clearInterval(t);
    }, 560);
    return () => window.clearInterval(t);
  }, [photoIn, photosOn, reduce, shots.length]);

  return (
    <section
      className={cn(
        "relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white",
        compact && "rounded-2xl border border-[#e5e5e5]",
        className,
      )}
    >
      {!reduce ? (
        <>
          {beat <= stepIndex("drop") ? (
            <DragGhost src={cover} x={step.x} y={step.y} phase={dragPhase} />
          ) : null}
          <GuideCursor
            x={is("photos") ? 8 + Math.max(0, filled - 1) * 5.2 : step.x}
            y={step.y}
            click={step.click || (is("photos") && filled > 1)}
            visible={!CURSOR_OFF.has(step.id)}
            label={
              is("photos")
                ? `${filled} of ${shots.length} photos`
                : at("sales")
                  ? moneyLabel(sales)
                  : step.label
            }
            clickKey={`${step.id}-${sku}-${is("photos") ? filled : beat}`}
          />
        </>
      ) : null}

      <div
        className={cn(
          "flex shrink-0 items-center gap-3 border-b bg-white px-3 py-2.5 sm:px-4",
          readyOn && !liveOn ? "border-[#141414]" : "border-[#e5e5e5]",
        )}
      >
        <div className="relative flex shrink-0 items-center gap-1">
          {dragging ? (
            shots.map((_, i) => (
              <motion.div
                key={`slot-${i}`}
                initial={false}
                animate={
                  i === 0
                    ? {
                        scale: is("drag") ? [1, 1.12, 1] : [1, 1.05, 1],
                        borderColor: is("drag") ? "rgba(20,20,20,1)" : "rgba(20,20,20,0.7)",
                      }
                    : { scale: 1 }
                }
                transition={i === 0 ? { duration: is("drag") ? 0.7 : 1.1, repeat: Infinity } : undefined}
                className={cn(
                  "size-11 rounded-md sm:size-12",
                  i === 0
                    ? "border-2 border-dashed border-[#141414] bg-[#f7f7f7]"
                    : "border border-dashed border-[#d8d8d8] bg-[#fafafa]",
                )}
              />
            ))
          ) : (
            shots.map((src, i) => (
              <motion.div
                key={`${sku}-${src}`}
                initial={i === 0 ? false : { opacity: 0, scale: 0.45, x: -18 }}
                animate={{
                  opacity: i < filled ? 1 : photoIn ? 0.2 : 0,
                  y: i < filled ? 0 : 6,
                  scale: i < filled ? 1 : 0.92,
                  x: i < filled ? 0 : -8,
                }}
                transition={{ type: "spring", stiffness: 420, damping: 20 }}
                className={cn(
                  "relative size-11 overflow-hidden rounded-md bg-[#f7f7f7] sm:size-12",
                  i === filled - 1 && photosOn && filled < shots.length
                    ? "ring-1 ring-[#141414]"
                    : i < filled
                      ? "ring-1 ring-[#e5e5e5]"
                      : null,
                )}
              >
                {i < filled ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt=""
                      className="absolute inset-0 size-full object-contain p-0.5"
                    />
                  </>
                ) : null}
              </motion.div>
            ))
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold tracking-tight text-[#191919] sm:text-[15px]">
            {draftOn
              ? typing
              : photosOn
                ? "Higlou pulls more shots from that photo…"
                : photoIn
                  ? "One photo in. Watch this."
                  : "Drop one photo. Higlou writes the rest."}
            {is("title") && typing.length < item.title.length ? (
              <span className="ml-0.5 inline-block h-3 w-px animate-pulse bg-[#191919]" />
            ) : null}
          </p>
          {descOn ? (
            <p className="mt-0.5 truncate text-[12px] text-[#707070]">
              {descTyping}
              {is("desc") && descTyping.length < item.description.length ? (
                <span className="ml-0.5 inline-block h-3 w-px animate-pulse bg-[#707070]" />
              ) : null}
            </p>
          ) : null}
          <p className="mt-0.5 text-[12px] text-[#707070]">
            {priceOn ? (
              <motion.span
                key="price"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-1.5 font-semibold tabular-nums text-[#191919]"
              >
                <span className="font-medium text-[#9b9b9b] line-through">{compsLabel}</span>
                <span>${price.toFixed(2)}</span>
                <span className="font-medium text-[#707070]">under sold comps</span>
              </motion.span>
            ) : photosOn ? (
              `${filled} of ${shots.length} photos`
            ) : photoIn ? (
              "One photo. Higlou does the rest."
            ) : (
              "Grab one photo. Drop it on the listing."
            )}
            {draftOn && !descOn ? " · writing the title…" : null}
            {descOn && !priceOn ? " · writing the description…" : null}
            {priceOn && !ebayIn ? " · priced" : null}
            {ebayIn && !readyOn ? " · filling stores…" : null}
            {readyOn && !publishing && !liveOn ? " · all stores ready" : null}
            {publishing ? " · publishing…" : null}
            {liveOn && !allLive ? " · going live, store by store" : null}
            {allLive ? " · live on 5 stores" : null}
          </p>
        </div>
        <div
          className={cn(
            "relative h-10 w-[122px] shrink-0 overflow-hidden rounded-md text-[13px] font-semibold tracking-[-0.01em]",
            readyOn || publishing || liveOn ? "bg-[#ececec] text-white" : "bg-[#ececec] text-[#9b9b9b]",
          )}
        >
          <motion.div
            className="absolute inset-x-0 bottom-0 bg-[#141414]"
            initial={false}
            animate={{
              height: allLive ? "100%" : publishing || liveOn ? "85%" : "0%",
            }}
            transition={{ duration: publishing ? 1.4 : 0.45, ease: [0.22, 1, 0.36, 1] }}
          />
          <span
            className={cn(
              "relative z-10 grid h-full place-items-center",
              publishing || liveOn ? "text-white" : readyOn ? "text-[#141414]" : "text-[#9b9b9b]",
            )}
          >
            {publishing ? "Publishing" : liveOn ? "Live" : "Publish"}
          </span>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div className="grid h-full min-h-0 grid-cols-6 grid-rows-2 divide-x divide-y divide-[#e5e5e5]">
        <ChannelShell live={ebayLive} filled={ebayIn} focused={is("fillEbay") || is("ebayLive")} className="col-span-2">
          {ebayIn ? (
            <EbayLivePreview
              key={`ebay-${cover}`}
              photoSrc={cover}
              title={item.title}
              priceLabel={priceLabel}
              storeName={shop}
              live
              compact
              fill
              className="h-full min-h-0 rounded-none shadow-none ring-0"
            />
          ) : (
            <>
              <div className="flex shrink-0 items-center justify-between border-b border-[#eee] px-3 py-2">
                <EbayWordmark className="text-[16px]" />
                <LivePill on={false} label="Live" />
              </div>
              <div className="min-h-0 flex-1 bg-[#f7f7f7]" />
              <div className="shrink-0 px-3 py-2">
                <p className="text-[16px] font-semibold tabular-nums">—</p>
                <p className="truncate text-[12px] text-[#707070]">eBay store</p>
              </div>
            </>
          )}
        </ChannelShell>

        <ChannelShell live={amazonLive} filled={amazonIn} focused={is("fillAmazon") || is("amazonLive")} className="col-span-2">
          {amazonIn ? (
            <AmazonStorefront key={`amz-${cover}`} src={cover} title={item.title} price={priceLabel} />
          ) : (
            <>
              <div className="flex shrink-0 items-center justify-between bg-[#232F3E] px-3 py-2">
                <AmazonMark className="text-[15px] text-white" />
                <LivePill on={false} label="Listed" />
              </div>
              <div className="min-h-0 flex-1 bg-[#f7f7f7]" />
              <div className="shrink-0 px-3 py-2">
                <p className="text-[16px] font-semibold text-[#B12704]">—</p>
                <p className="truncate text-[12px] text-[#707070]">Amazon</p>
              </div>
            </>
          )}
        </ChannelShell>

        <ChannelShell live={facebookLive} filled={facebookIn} focused={is("fillFacebook") || is("facebookLive")} className="col-span-2">
          {facebookIn ? (
            <FacebookStorefront
              key={`fb-${cover}`}
              src={cover}
              title={item.title}
              price={priceLabel}
              seller={shop}
            />
          ) : (
            <>
              <div className="flex shrink-0 items-center justify-between border-b border-[#eee] px-3 py-2">
                <span className="text-[13px] font-bold text-[#1877F2]">
                  facebook <span className="font-semibold text-[#65676B]">Marketplace</span>
                </span>
                <LivePill on={false} label="Posted" />
              </div>
              <div className="min-h-0 flex-1 bg-[#f7f7f7]" />
              <div className="shrink-0 px-3 py-2">
                <p className="text-[16px] font-semibold">—</p>
                <p className="truncate text-[12px] text-[#707070]">Facebook Marketplace</p>
              </div>
            </>
          )}
        </ChannelShell>

        <ChannelShell live={shopifyLive} filled={shopifyIn} focused={is("fillShopify") || is("shopifyLive")} className="col-span-3">
          {shopifyIn ? (
            <ShopifyStorefront key={`shop-${cover}`} src={cover} title={item.title} price={priceLabel} />
          ) : (
            <>
              <div className="flex shrink-0 items-center justify-between bg-[#212326] px-3 py-2">
                <ShopifyMark />
                <LivePill on={false} label="On store" />
              </div>
              <div className="min-h-0 flex-1 bg-[#f7f7f7]" />
              <div className="shrink-0 px-3 py-2">
                <p className="text-[16px] font-semibold tabular-nums">—</p>
                <p className="mt-1.5 grid h-8 place-items-center rounded-md bg-[#eee] text-[12px] font-semibold text-[#bbb]">
                  Add to cart
                </p>
              </div>
            </>
          )}
        </ChannelShell>

        <ChannelShell live={webLive} filled={webIn} focused={is("fillWeb") || is("webLive")} className="col-span-3">
          {webIn ? (
            <SiteStorefront
              key={`web-${cover}`}
              src={cover}
              title={item.title}
              price={priceLabel}
              slug={slug}
            />
          ) : (
            <>
              <div className="flex shrink-0 items-center gap-1.5 border-b border-[#eee] bg-[#f7f7f7] px-3 py-2">
                <span className="size-1.5 rounded-full bg-[#FF5F57]" />
                <span className="size-1.5 rounded-full bg-[#FEBC2E]" />
                <span className="size-1.5 rounded-full bg-[#28C840]" />
                <span className="ml-1 flex min-w-0 flex-1 items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] text-[#707070]">
                  <Globe className="size-3 shrink-0" />
                  <span className="truncate">yoursite.com/products</span>
                </span>
                <LivePill on={false} label="On site" />
              </div>
              <div className="min-h-0 flex-1 bg-[#f7f7f7]" />
              <div className="shrink-0 px-3 py-2">
                <p className="text-[16px] font-semibold tabular-nums">—</p>
                <p className="truncate text-[12px] text-[#707070]">Your website</p>
              </div>
            </>
          )}
        </ChannelShell>
        </div>
      </div>

      <SalesStrip
        dollars={sales}
        sold={sold}
        reduce={reduce}
      />
    </section>
  );
}
