"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Globe, MapPin, MousePointer2, Search, ShoppingCart } from "lucide-react";
import { usePrefersReducedMotion } from "@/components/listing/wizard/use-prefers-reduced-motion";
import {
  EbayLivePreview,
  useConnectedEbayStoreName,
} from "@/components/studio/ebay-live-preview";
import {
  AmazonMark,
  EbayMark,
  FacebookFMark,
  FacebookMark,
  ShopifyMark,
  SiteMark,
} from "@/components/brand/store-marks";
import { cn } from "@/lib/utils";
import { AdminLivePanel } from "@/components/studio/admin-live-panel";
import { DropStage } from "@/components/studio/drop-stage";
import { STORY_CATALOG, type StoryItem } from "@/components/studio/ready-catalog";

const CATALOG = STORY_CATALOG;

const EASE = [0.22, 1, 0.36, 1] as const;
const GRAVITY = [0.55, 0.05, 0.9, 0.22] as const;

const STEPS = [
  { id: "grab", ms: 1400, x: 14, y: 74, click: true, label: "Grab one photo" },
  { id: "drag", ms: 1450, x: 9, y: 11, click: false, label: "Drop on listing" },
  { id: "drop", ms: 820, x: 9, y: 11, click: true, label: "Photo in" },
  { id: "photos", ms: 1000, x: 22, y: 8, click: false, label: "Higlou adds shots" },
  { id: "title", ms: 1100, x: 40, y: 8, click: false, label: "Title writes itself" },
  { id: "desc", ms: 850, x: 40, y: 8, click: false, label: "Description" },
  { id: "compare", ms: 900, x: 40, y: 8, click: false, label: "Priced vs sold comps" },
  { id: "ready", ms: 1450, x: 91, y: 8, click: false, label: "Publish" },
  { id: "publish", ms: 1350, x: 50, y: 48, click: true, label: "Publishing" },
  { id: "dispatch", ms: 3000, x: 50, y: 48, click: false, label: "Sending" },
  { id: "sales", ms: 3400, x: 88, y: 93, click: false, label: "Revenue" },
  { id: "hold", ms: 1900, x: 88, y: 93, click: false, label: "Next product" },
] as const;

const DROP_STEPS = [
  { id: "grab", ms: 1200, x: 50, y: 78, click: true, label: "Grab one photo" },
  { id: "drag", ms: 1400, x: 50, y: 42, click: false, label: "Drop on listing" },
  { id: "drop", ms: 900, x: 50, y: 42, click: true, label: "Photo in" },
  { id: "hold", ms: 1400, x: 50, y: 42, click: false, label: "Your turn" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

function stepIndex(id: StepId) {
  return STEPS.findIndex((s) => s.id === id);
}

const FALL_TO = [
  { x: 16, y: 38, name: "eBay" },
  { x: 50, y: 38, name: "Amazon" },
  { x: 84, y: 38, name: "Facebook" },
  { x: 24, y: 70, name: "Shopify" },
  { x: 76, y: 70, name: "Your site" },
] as const;

const SALE_TICKET = [
  "eBay",
  "Amazon",
  "eBay",
  "Shopify",
  "Amazon",
  "Facebook",
  "eBay",
  "Shopify",
  "Amazon",
] as const;

const CURSOR_OFF: ReadonlySet<string> = new Set([
  "drag",
  "photos",
  "title",
  "desc",
  "compare",
  "dispatch",
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
    }, 18);
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
    const dur = 380;
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
    const dur = 540;
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

function StoreTargets({ compact = false }: { compact?: boolean }) {
  const stores = [
    { key: "ebay", node: <EbayMark className="h-[18px]" /> },
    { key: "amazon", node: <AmazonMark className="h-4" /> },
    { key: "facebook", node: <FacebookMark className="h-4" /> },
    { key: "shopify", node: <ShopifyMark className="h-5" /> },
    { key: "site", node: <SiteMark className="h-5" /> },
  ] as const;

  return (
    <div
      className={cn(
        "shrink-0 border-t border-[#e5e5e5] bg-white px-4",
        compact ? "py-2" : "py-3",
      )}
    >
      {compact ? null : (
        <p className="mb-2.5 text-center text-[11px] font-medium tracking-[0.16em] text-[#8a8a8a] uppercase">
          Publishes to five stores
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {stores.map((store) => (
          <div
            key={store.key}
            className={cn(
              "flex items-center justify-center rounded-lg bg-white px-3 ring-1 ring-[#e5e5e5]",
              compact ? "h-9 min-w-[96px]" : "h-11 min-w-[108px]",
            )}
          >
            {store.node}
          </div>
        ))}
      </div>
    </div>
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
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
    >
      <motion.div
        key={clickKey}
        initial={false}
        animate={click ? { scale: [1, 0.9, 1] } : { scale: 1 }}
        transition={{ duration: 0.28, times: [0, 0.4, 1] }}
        className="relative -translate-x-0.5 -translate-y-0.5"
      >
        <MousePointer2
          className="size-5 text-[#141414]"
          fill="white"
          strokeWidth={1.6}
        />
      </motion.div>
      <AnimatePresence mode="wait">
        {label ? (
          <motion.span
            key={clickKey}
            initial={{ opacity: 0, y: 6, x: flip ? 8 : -8 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "absolute top-6 max-w-[200px] bg-[#141414] px-2 py-1 text-[11px] font-medium text-white",
              flip ? "right-1" : "left-5",
            )}
          >
            {label}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

function storyCaption(
  id: string,
  ctx: {
    filled: number;
    shots: number;
    dropMode: boolean;
    freezeDrop: boolean;
    fileDrag?: boolean;
  },
): { headline: string; sub: string } {
  if (ctx.freezeDrop) {
    return {
      headline: "Photo in.",
      sub: "Continue when you’re ready. Higlou writes the listing from here.",
    };
  }
  if (ctx.fileDrag) {
    return {
      headline: "Drop it on the first slot.",
      sub: "One photo starts the listing. Higlou does the rest.",
    };
  }
  if (ctx.dropMode) {
    if (id === "grab") {
      return { headline: "Grab one photo.", sub: "This is how every listing starts." };
    }
    if (id === "drag") {
      return { headline: "Drop it on the first slot.", sub: "One photo. That’s the whole move." };
    }
    if (id === "drop") {
      return { headline: "That’s the move.", sub: "Now drop yours the same way." };
    }
    return { headline: "Your turn.", sub: "Drop one photo to start your listing." };
  }
  switch (id) {
    case "grab":
      return { headline: "One photo.", sub: "That’s the whole start." };
    case "drag":
      return { headline: "Drop it.", sub: "On the first slot." };
    case "drop":
      return { headline: "", sub: "" };
    case "photos":
    case "title":
    case "desc":
    case "compare":
      return { headline: "", sub: "" };
    case "ready":
      return { headline: "One click.", sub: "Publish once. All five go live." };
    case "publish":
      return { headline: "One listing.", sub: "Photos, title, price — together." };
    case "dispatch":
      return { headline: "", sub: "" };
    case "sales":
      return { headline: "Sold.", sub: "The wallet moves in real time." };
    case "hold":
      return { headline: "", sub: "" };
    default:
      return { headline: "Watch this.", sub: "One photo becomes five live storefronts." };
  }
}

function YourTurn({ onReplay }: { onReplay: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
        className="pointer-events-auto w-full max-w-[380px] bg-white px-8 py-8 text-center ring-1 ring-[#e5e5e5]"
      >
        <p className="text-[11px] font-medium tracking-[0.18em] text-[#8a8a8a] uppercase">
          Your turn
        </p>
        <p className="mt-3 text-[28px] font-medium tracking-tight text-[#141414] leading-[1.05]">
          List one of yours.
        </p>
        <p className="mt-2 text-[14px] leading-relaxed text-[#707070]">
          One photo. Higlou writes the listing. Five stores go live.
        </p>
        <Link
          href="/listings/new"
          className="mt-7 grid h-11 place-items-center bg-[#141414] text-[14px] font-medium text-white"
        >
          Start a listing
        </Link>
        <button
          type="button"
          onClick={onReplay}
          className="mt-3 text-[13px] text-[#8a8a8a] transition hover:text-[#141414]"
        >
          Watch again
        </button>
      </motion.div>
    </div>
  );
}

function CenterLine({
  headline,
  sub,
  mark,
  stepKey,
  compact,
}: {
  headline: string;
  sub: string;
  mark?: ReactNode;
  stepKey: string;
  compact?: boolean;
}) {
  const stamp = Boolean(mark);
  const empty = !stamp && !headline;
  if (empty) return null;

  return (
    <div
      className={cn(
        "pointer-events-none absolute z-[36] flex justify-center px-6",
        "inset-0 items-center",
      )}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={stepKey}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "relative max-w-[320px] text-center sm:max-w-[360px]",
            stamp ? "" : "bg-white px-5 py-3 ring-1 ring-[#e5e5e5]",
          )}
        >
          {mark ? (
            <div className="mb-2 flex justify-center">
              {mark}
            </div>
          ) : (
            <p
              className={cn(
                "font-medium tracking-tight text-[#141414] leading-[1.08]",
                compact ? "text-[22px]" : "text-[26px] sm:text-[34px]",
              )}
            >
              {headline}
            </p>
          )}
          <p
            className={cn(
              "font-medium text-[#565959]",
              mark ? "mt-1" : "mt-1.5",
              compact ? "text-[13px]" : "text-[14px] sm:text-[16px]",
            )}
          >
            {sub}
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
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
        scale: phase === "drop" ? 0.2 : 1,
        rotate: 0,
      }}
      transition={{
        duration: phase === "drag" ? 1.05 : 0.55,
        ease: EASE,
      }}
    >
      <div
        className={cn(
          "relative overflow-hidden bg-white",
          holding
            ? "-translate-x-1/2 -translate-y-[108%] h-[140px] w-[112px] rounded-[2px] p-1.5 pb-6 ring-1 ring-[#e5e5e5] sm:h-[156px] sm:w-[124px]"
            : "-translate-x-1/2 -translate-y-1/2 size-11 rounded-sm ring-1 ring-[#e5e5e5]",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="size-full object-contain" />
      </div>
    </motion.div>
  );
}

function CompressBundle({
  src,
  extras,
  packed = false,
}: {
  src: string;
  extras: string[];
  packed?: boolean;
}) {
  return (
    <motion.div
      className="pointer-events-none absolute z-30"
      initial={{ left: "14%", top: "10%", scale: 0.4, opacity: 0, x: "-50%", y: "-50%" }}
      animate={
        packed
          ? { left: "50%", top: "48%", scale: 0.82, opacity: 0.28 }
          : { left: "50%", top: "48%", scale: 1, opacity: 1 }
      }
      transition={{ duration: 0.58, ease: EASE }}
    >
      {extras.slice(1, 3).map((shot, i) => (
        <motion.div
          key={shot}
          className="absolute overflow-hidden rounded-[2px] bg-white p-1 pb-4 ring-1 ring-[#e8e8e8]"
          initial={{
            left: i === 0 ? -52 : 64,
            top: 28,
            opacity: 0,
          }}
          animate={{
            left: packed ? 8 : (i + 1) * 7,
            top: packed ? 6 : (i + 1) * -6,
            opacity: packed ? 0 : 1,
          }}
          transition={{ duration: 0.55, ease: EASE, delay: packed ? 0 : 0.08 + i * 0.07 }}
          style={{ width: 118, height: 144 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot} alt="" className="size-full object-contain" />
        </motion.div>
      ))}
      <div className="relative h-[164px] w-[132px] overflow-hidden rounded-[2px] bg-white p-2 pb-6 ring-1 ring-[#e5e5e5]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="size-full object-contain" />
      </div>
    </motion.div>
  );
}

function FallPacket({
  src,
  toX,
  toY,
  delay,
  hopKey,
}: {
  src: string;
  toX: number;
  toY: number;
  delay: number;
  hopKey: string;
}) {
  const midX = 50 + (toX - 50) * 0.58;
  const midY = 48 + (toY - 48) * 0.4;

  return (
    <motion.div
      key={hopKey}
      className="pointer-events-none absolute z-40"
      initial={{
        left: "50%",
        top: "48%",
        opacity: 0,
        x: "-50%",
        y: "-50%",
        scale: 0.4,
      }}
      animate={{
        left: ["50%", `${midX}%`, `${toX}%`],
        top: ["48%", `${midY}%`, `${toY}%`],
        opacity: [0, 1, 1, 0],
        scale: [0.4, 0.96, 0.2],
      }}
      transition={{
        delay,
        duration: 1,
        times: [0, 0.36, 1],
        ease: [EASE, GRAVITY],
        opacity: { delay, duration: 1, times: [0, 0.07, 0.86, 1] },
      }}
    >
      <div className="h-[142px] w-[114px] overflow-hidden rounded-[2px] bg-white p-1 pb-4 ring-1 ring-[#e5e5e5]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="size-full object-contain" />
      </div>
    </motion.div>
  );
}

function ChannelShell({
  dim,
  className,
  children,
}: {
  live?: boolean;
  filled?: boolean;
  focused?: boolean;
  dim?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: dim ? 0.34 : 1 }}
      transition={{ duration: 0.38, ease: EASE }}
      className={cn(
        "relative flex h-full min-h-0 flex-col overflow-hidden bg-white",
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

function WaitingStore({
  header,
  mark,
}: {
  header: ReactNode;
  mark: ReactNode;
}) {
  return (
    <div className="grid h-full min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] bg-white">
      {header}
      <div className="grid min-h-0 place-items-center px-4">
        {mark}
      </div>
    </div>
  );
}

function WaitingEbay() {
  return (
    <WaitingStore
      mark={<EbayMark className="h-10 sm:h-12" />}
      header={
        <div className="flex shrink-0 items-center gap-1.5 border-b border-[#e5e5e5] bg-white px-2 py-1">
          <EbayMark className="h-4" />
          <div className="flex min-w-0 flex-1 overflow-hidden rounded-sm border border-[#ccc]">
            <span className="min-w-0 flex-1 truncate bg-white px-2 py-0.5 text-[10px] text-[#707070]">
              Search for anything
            </span>
            <span className="grid w-7 shrink-0 place-items-center bg-[#3665F3] text-white">
              <Search className="size-3" strokeWidth={2.4} />
            </span>
          </div>
        </div>
      }
    />
  );
}

function WaitingAmazon() {
  return (
    <WaitingStore
      mark={<AmazonMark className="h-8 sm:h-10" />}
      header={
        <div className="flex shrink-0 items-center gap-1.5 bg-[#131921] px-2 py-1">
          <AmazonMark invert className="h-4" />
          <div className="flex min-w-0 flex-1 overflow-hidden rounded-sm">
            <span className="min-w-0 flex-1 truncate bg-white px-2 py-0.5 text-[10px] text-[#888]">
              Search Amazon
            </span>
            <span className="grid w-7 shrink-0 place-items-center bg-[#FEBD69] text-[#131921]">
              <Search className="size-3" strokeWidth={2.4} />
            </span>
          </div>
        </div>
      }
    />
  );
}

function WaitingFacebook() {
  return (
    <WaitingStore
      mark={<FacebookMark className="h-7 sm:h-8" />}
      header={
        <div className="flex shrink-0 items-center gap-2 border-b border-[#E4E6EB] bg-white px-2 py-1.5">
          <FacebookFMark className="h-5" />
          <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-[#050505]">
            Marketplace
          </span>
        </div>
      }
    />
  );
}

function WaitingShopify() {
  return (
    <WaitingStore
      mark={<ShopifyMark className="h-8 sm:h-10" />}
      header={
        <div className="flex shrink-0 items-center justify-between border-b border-[#e5e5e5] bg-white px-3 py-1.5">
          <ShopifyMark className="h-5" />
          <Search className="size-3.5 text-[#6b6b6b]" strokeWidth={1.8} />
        </div>
      }
    />
  );
}

function WaitingSite() {
  return (
    <WaitingStore
      mark={<SiteMark className="h-10 sm:h-12" />}
      header={
        <div>
          <div className="flex items-center gap-1.5 border-b border-[#e5e5e5] bg-[#f3f3f3] px-2 py-1">
            <span className="size-1.5 rounded-full bg-[#FF5F57]" />
            <span className="size-1.5 rounded-full bg-[#FEBC2E]" />
            <span className="size-1.5 rounded-full bg-[#28C840]" />
            <span className="ml-1 flex min-w-0 flex-1 items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] text-[#707070]">
              <Globe className="size-3 shrink-0" />
              <span className="truncate">yoursite.com</span>
            </span>
          </div>
          <div className="flex items-center justify-between border-b border-[#eee] px-3 py-1 text-[11px] text-[#707070]">
            <span className="font-medium text-[#141414]">Shop</span>
            <span>About</span>
            <span>Bag</span>
          </div>
        </div>
      }
    />
  );
}

function LivePhoto({
  src,
  className,
  mark,
}: {
  src: string;
  className?: string;
  mark?: ReactNode;
}) {
  return (
    <div className={cn("relative h-full min-h-0 overflow-hidden bg-white", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <motion.img
        key={src}
        src={src}
        alt=""
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="absolute inset-0 size-full object-contain p-1.5"
      />
      {mark ? (
        <div className="pointer-events-none absolute bottom-1.5 left-1.5">
          {mark}
        </div>
      ) : null}
    </div>
  );
}

function moneyParts(price: string) {
  const raw = price.replace(/[^0-9.]/g, "");
  const [dollars, cents = "00"] = raw.split(".");
  return { dollars, cents: (cents + "00").slice(0, 2) };
}

function AmazonStorefront({
  src,
  title,
  price,
  listPrice,
}: {
  src: string;
  title: string;
  price: string;
  listPrice?: string;
}) {
  const { dollars, cents } = moneyParts(price);
  return (
    <div className="grid h-full min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] bg-white">
      <div className="flex shrink-0 items-center gap-1.5 bg-[#131921] px-2 py-1">
        <AmazonMark invert className="h-5" />
        <div className="flex min-w-0 flex-1 overflow-hidden rounded-sm">
          <span className="hidden shrink-0 bg-[#232F3E] px-1.5 py-0.5 text-[9px] text-white/80 sm:block">
            All
          </span>
          <span className="min-w-0 flex-1 truncate bg-white px-2 py-0.5 text-[10px] text-[#888]">
            Search Amazon
          </span>
          <span className="grid w-7 shrink-0 place-items-center bg-[#FEBD69] text-[#131921]">
            <Search className="size-3" strokeWidth={2.4} />
          </span>
        </div>
        <ShoppingCart className="size-3.5 shrink-0 text-white" />
      </div>
      <LivePhoto src={src} mark={<AmazonMark className="h-4" />} />
      <div className="shrink-0 px-2 pb-2 pt-1">
        <p className="line-clamp-1 text-[11px] leading-snug text-[#0F1111]">{title}</p>
        <div className="mt-0.5 flex items-start text-[#0F1111]">
          <span className="mt-[3px] text-[11px] leading-none">$</span>
          <span className="text-[22px] font-medium leading-none tabular-nums">{dollars}</span>
          <span className="mt-[3px] text-[11px] leading-none tabular-nums">{cents}</span>
        </div>
        {listPrice ? (
          <p className="text-[10px] text-[#565959]">
            List: <span className="line-through">{listPrice}</span>
          </p>
        ) : null}
        <p className="mt-1.5 grid h-7 place-items-center rounded-full bg-[#FFD814] text-[10px] font-semibold text-[#0F1111]">
          Add to Cart
        </p>
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
    <div className="grid h-full min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] bg-white">
      <div className="flex shrink-0 items-center gap-2 border-b border-[#E4E6EB] bg-white px-2 py-1.5">
        <FacebookMark className="h-3.5" />
        <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-[#050505]">
          Marketplace
        </span>
        <span className="truncate text-[11px] text-[#65676B]">{seller}</span>
      </div>
      <LivePhoto
        src={src}
        className="bg-[#F0F2F5]"
        mark={<FacebookFMark className="h-5" />}
      />
      <div className="shrink-0 bg-white px-2.5 py-1.5">
        <p className="text-[17px] font-bold tabular-nums leading-none text-[#050505]">{price}</p>
        <p className="mt-1 line-clamp-1 text-[12px] font-medium text-[#050505]">{title}</p>
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[#65676B]">
          <MapPin className="size-3 shrink-0" strokeWidth={2} />
          Listed just now · Ships to you
        </p>
        <p className="mt-1 grid h-7 place-items-center rounded-md bg-[#E7F3FF] text-[12px] font-semibold text-[#1877F2]">
          Message
        </p>
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
    <div className="grid h-full min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] bg-white">
      <div className="flex shrink-0 items-center justify-between border-b border-[#e5e5e5] bg-white px-3 py-1.5">
        <ShopifyMark className="h-6" />
        <div className="flex items-center gap-2 text-[11px] text-[#6b6b6b]">
          <Search className="size-3.5" strokeWidth={1.8} />
          <span className="relative">
            <ShoppingCart className="size-3.5 text-[#141414]" />
            <span className="absolute -top-1 -right-1 grid size-3 place-items-center rounded-full bg-[#141414] text-[8px] text-white">
              1
            </span>
          </span>
        </div>
      </div>
      <LivePhoto src={src} mark={<ShopifyMark className="h-5" />} />
      <div className="shrink-0 px-3 pb-2 pt-1.5">
        <p className="line-clamp-1 text-[13px] font-medium tracking-tight text-[#121212]">{title}</p>
        <p className="mt-0.5 text-[16px] tabular-nums text-[#121212]">{price}</p>
        <p className="mt-1.5 grid h-7 place-items-center rounded-sm bg-[#121212] text-[10px] font-semibold text-white">
          Add to cart
        </p>
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
    <div className="grid h-full min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)_auto] bg-white">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-[#e5e5e5] bg-[#f3f3f3] px-2 py-1">
        <span className="size-1.5 rounded-full bg-[#FF5F57]" />
        <span className="size-1.5 rounded-full bg-[#FEBC2E]" />
        <span className="size-1.5 rounded-full bg-[#28C840]" />
        <SiteMark className="h-3.5 shrink-0" />
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
      <div className="flex shrink-0 items-center justify-between border-b border-[#eee] px-3 py-1 text-[11px] tracking-wide text-[#707070]">
        <span className="font-medium text-[#141414]">Shop</span>
        <span>About</span>
        <span>Bag (1)</span>
      </div>
      <LivePhoto src={src} mark={<SiteMark className="h-5" />} />
      <div className="shrink-0 px-3 pb-2 pt-1.5">
        <p className="line-clamp-1 text-[13px] font-medium tracking-tight text-[#141414]">{title}</p>
        <p className="mt-0.5 text-[16px] font-medium tabular-nums">{price}</p>
        <p className="mt-1.5 grid h-7 place-items-center bg-[#141414] text-[11px] font-medium text-white">
          Add to bag
        </p>
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
  unit,
  reduce,
}: {
  dollars: number;
  sold: number;
  unit: number;
  reduce: boolean;
}) {
  const lit =
    reduce && sold > 0
      ? HOUR_BARS.length
      : sold === 0
        ? 0
        : Math.max(2, Math.round((sold / 10) * HOUR_BARS.length));
  const ticket = sold > 0 ? SALE_TICKET[Math.min(sold - 1, SALE_TICKET.length - 1)] : null;

  return (
    <div className="flex h-16 shrink-0 items-center gap-3 border-t border-[#e5e5e5] bg-white px-3 sm:gap-4 sm:px-4">
      <div className="w-[108px] shrink-0 sm:w-[128px]">
        <p className="text-[10px] font-medium tracking-[0.14em] text-[#8a8a8a] uppercase">
          Today
        </p>
        <AnimatePresence mode="wait">
          <motion.p
            key={ticket ?? "idle"}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="truncate text-[12px] tabular-nums text-[#565959]"
          >
            {ticket
              ? `Sold on ${ticket} · ${moneyLabel(unit)}`
              : "No sales yet"}
          </motion.p>
        </AnimatePresence>
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
  mode = "story",
  catalogItems,
  onWallet,
  onStory,
  onRest,
  showRestCta = false,
}: {
  storeName?: string | null;
  compact?: boolean;
  className?: string;
  photos?: string[] | null;
  mode?: "story" | "drop";
  catalogItems?: StoryItem[];
  onWallet?: (available: number) => void;
  onStory?: (story: {
    sku: number;
    phase: "grab" | "drag" | "drop" | "gone";
    cover: string;
  }) => void;
  onRest?: (resting: boolean) => void;
  showRestCta?: boolean;
}) {
  const reduce = usePrefersReducedMotion();
  const dropMode = mode === "drop";
  const hasUserPhotos = Boolean(photos && photos.length > 0);
  const freezeDrop = dropMode && hasUserPhotos;
  const timeline = dropMode ? DROP_STEPS : STEPS;
  const [beat, setBeat] = useState(0);
  const [sku, setSku] = useState(0);
  const [fileDrag, setFileDrag] = useState(false);
  const [filled, setFilled] = useState(0);
  const [landed, setLanded] = useState(0);
  const [resting, setResting] = useState(false);
  const [runId, setRunId] = useState(0);
  const skuRef = useRef(0);
  const shop = useConnectedEbayStoreName(storeName);
  const storyCatalog =
    catalogItems && catalogItems.length > 0 ? catalogItems : CATALOG;
  const catalog =
    hasUserPhotos
      ? [
          {
            name: "Your listing",
            title: "Your listing",
            description: "Higlou writes the description from your photo.",
            price: 189,
            comps: 240,
            photos: (photos ?? []).slice(0, 4),
          },
        ]
      : storyCatalog;
  const item = catalog[sku % catalog.length] ?? storyCatalog[0] ?? CATALOG[0];
  const playCount = Math.min(2, Math.max(1, catalog.length));
  skuRef.current = sku;
  const shots = [...item.photos];
  const cover = shots[0] || storyCatalog[0]?.photos[0] || CATALOG[0].photos[0];
  const slug = item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const sold = dropMode ? 0 : ordersAt(beat);
  const money = sold * item.price;
  const step = timeline[Math.min(beat, timeline.length - 1)] ?? timeline[0];
  const at = (id: StepId) => {
    const i = timeline.findIndex((s) => s.id === id);
    return i >= 0 && beat >= i;
  };
  const is = (id: StepId) => step.id === id;
  const typing = useTyped(item.title, at("photos"), reduce);
  const descTyping = useTyped(item.description, at("title"), reduce);
  const price = useCountUp(item.price, at("desc"), reduce);
  const sales = useCountToward(money, reduce);
  const walletRef = useRef(0);
  const prevSales = useRef(0);
  const fileDragRef = useRef(false);
  fileDragRef.current = fileDrag;

  useEffect(() => {
    const delta = sales - prevSales.current;
    prevSales.current = sales;
    if (delta <= 0) return;
    walletRef.current += delta;
    onWallet?.(walletRef.current);
  }, [sales, onWallet]);

  const photoIn = freezeDrop || at("drop");
  const dragging = !freezeDrop && beat <= timeline.findIndex((s) => s.id === "drag");
  const photosOn = at("photos");
  const draftOn = at("photos");
  const descOn = at("title");
  const priceOn = at("desc");
  const ebayIn = landed >= 1;
  const amazonIn = landed >= 2;
  const facebookIn = landed >= 3;
  const shopifyIn = landed >= 4;
  const webIn = landed >= 5;
  const readyOn = at("ready");
  const packing = is("publish");
  const dispatching = is("dispatch");
  const publishing = packing || dispatching;
  const liveOn = at("dispatch");
  const allLive = landed >= 5;
  const dragPhase =
    is("grab") ? "grab" : is("drag") ? "drag" : is("drop") ? "drop" : "gone";
  const priceLabel = `$${item.price.toFixed(2)}`;
  const compsLabel = `$${item.comps.toLocaleString("en-US")}`;
  const caption = storyCaption(step.id, {
    filled,
    shots: shots.length,
    dropMode,
    freezeDrop,
    fileDrag,
  });
  const showCenter =
    !dropMode &&
    (step.id === "grab" || step.id === "ready" || step.id === "publish");
  const showAdmin = !dropMode && (at("sales") || resting);

  useEffect(() => {
    if (dropMode) {
      onStory?.({ sku: 0, phase: "gone", cover });
      return;
    }
    onStory?.({
      sku: sku % catalog.length,
      phase: resting ? "gone" : dragPhase,
      cover,
    });
  }, [dropMode, sku, dragPhase, cover, onStory, catalog.length, resting]);

  useEffect(() => {
    if (dropMode) return;
    onRest?.(resting);
  }, [dropMode, resting, onRest]);

  useEffect(() => {
    if (!dropMode || freezeDrop) {
      setFileDrag(false);
      return;
    }
    const isFile = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const onEnter = (e: DragEvent) => {
      if (isFile(e)) setFileDrag(true);
    };
    const onEnd = () => setFileDrag(false);
    const onWindowLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) setFileDrag(false);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("drop", onEnd);
    window.addEventListener("dragend", onEnd);
    window.addEventListener("dragleave", onWindowLeave);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("drop", onEnd);
      window.removeEventListener("dragend", onEnd);
      window.removeEventListener("dragleave", onWindowLeave);
    };
  }, [dropMode, freezeDrop]);

  useEffect(() => {
    if (freezeDrop) {
      setBeat(timeline.length - 1);
      return;
    }
    if (reduce) {
      setBeat(dropMode ? timeline.length - 1 : stepIndex("sales"));
      if (!dropMode) {
        setLanded(5);
        setResting(true);
      }
      return;
    }
    if (!dropMode && resting) return;
    let i = 0;
    let id = 0;
    const finishStory = () => {
      setBeat(stepIndex("sales"));
      setLanded(5);
      setResting(true);
    };
    const loop = () => {
      id = window.setTimeout(() => {
        if (fileDragRef.current) {
          loop();
          return;
        }
        i += 1;
        if (!dropMode && skuRef.current + 1 >= playCount && i >= stepIndex("hold")) {
          finishStory();
          return;
        }
        if (i >= timeline.length) {
          i = 0;
          setSku((n) => n + 1);
        }
        setBeat(i);
        loop();
      }, fileDragRef.current ? 120 : timeline[Math.min(i, timeline.length - 1)].ms);
    };
    loop();
    return () => window.clearTimeout(id);
  }, [reduce, dropMode, freezeDrop, timeline, resting, runId, playCount]);

  useEffect(() => {
    if (reduce || freezeDrop || resting) {
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
    }, 150);
    return () => window.clearInterval(t);
  }, [photoIn, photosOn, reduce, freezeDrop, shots.length, resting]);

  useEffect(() => {
    if (dropMode) return;
    if (reduce || resting) {
      setLanded(5);
      return;
    }
    if (step.id === "dispatch") {
      setLanded(0);
      const times = [1000, 1300, 1600, 1900, 2200];
      const timers = times.map((ms, i) =>
        window.setTimeout(() => setLanded(i + 1), ms),
      );
      return () => timers.forEach((id) => window.clearTimeout(id));
    }
    if (step.id === "sales" || step.id === "hold") {
      setLanded(5);
      return;
    }
    setLanded(0);
  }, [dropMode, reduce, step.id, sku, resting]);

  const replayStory = () => {
    setSku(0);
    setBeat(0);
    setLanded(0);
    setFilled(0);
    setResting(false);
    setRunId((n) => n + 1);
  };

  return (
    <section
      className={cn(
        "relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white",
        compact && "rounded-2xl border border-[#e5e5e5]",
        className,
      )}
    >
      {!reduce && !freezeDrop && !fileDrag ? (
        <>
          {dropMode && beat <= timeline.findIndex((s) => s.id === "drop") ? (
            <DragGhost src={cover} x={step.x} y={step.y} phase={dragPhase} />
          ) : null}
          {!dropMode && (packing || dispatching) ? (
            <CompressBundle src={cover} extras={shots} packed={dispatching} />
          ) : null}
          {!dropMode && dispatching
            ? FALL_TO.map((store, i) => (
                <FallPacket
                  key={`${sku}-fall-${store.name}`}
                  src={cover}
                  toX={store.x}
                  toY={store.y}
                  delay={i * 0.3}
                  hopKey={`${sku}-fall-${store.name}`}
                />
              ))
            : null}
          <GuideCursor
            x={step.x}
            y={step.y}
            click={step.click}
            visible={
              !resting &&
              !CURSOR_OFF.has(step.id) &&
              !(dropMode && is("hold")) &&
              !(!dropMode && (is("grab") || is("drag")))
            }
            label=""
            clickKey={`${step.id}-${sku}-${beat}`}
          />
        </>
      ) : null}

      <div
        className={cn(
          "flex shrink-0 items-center gap-3 border-b bg-white px-3 py-2.5 sm:px-4",
          readyOn && !publishing ? "border-[#141414]" : "border-[#e5e5e5]",
        )}
      >
        <motion.div
          className="relative flex shrink-0 items-center gap-1"
          animate={
            packing
              ? { scale: 0.88, x: 24 }
              : { scale: 1, x: 0 }
          }
          transition={{ duration: 0.55, ease: EASE }}
        >
          {dropMode && !freezeDrop ? null : dragging || fileDrag ? (
            shots.map((_, i) => (
              <motion.div
                key={`slot-${i}`}
                data-listing-slot={i === 0 ? "" : undefined}
                initial={false}
                animate={
                  i === 0
                    ? { scale: 1.08 }
                    : { scale: 1 }
                }
                transition={{ type: "spring", stiffness: 320, damping: 18 }}
                className={cn(
                  "size-11 rounded-md sm:size-12",
                  i === 0
                    ? "border border-dashed border-[#141414] bg-[#f7f7f7]"
                    : "border border-dashed border-[#d8d8d8] bg-[#fafafa]",
                )}
              />
            ))
          ) : (
            shots.map((src, i) => (
              <motion.div
                key={`${sku}-${src}`}
                data-listing-slot={i === 0 ? "" : undefined}
                initial={i === 0 ? false : { opacity: 0 }}
                animate={{
                  opacity: packing ? (i === 0 ? 1 : 0.4) : i < filled ? 1 : photoIn ? 0.2 : 0,
                  scale: packing ? 0.9 : 1,
                  x: packing ? -i * 16 : 0,
                }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
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
        </motion.div>
        <div className={cn("min-w-0 flex-1", packing && "pointer-events-none opacity-0")}>
          <p className="truncate text-[13px] font-semibold tracking-tight text-[#191919] sm:text-[15px]">
            {dropMode
              ? freezeDrop
                ? "Your photo"
                : "New listing"
              : draftOn
                ? typing
                : photosOn
                  ? item.name
                  : photoIn
                    ? item.name
                    : "New listing"}
            {!dropMode && draftOn && typing.length < item.title.length ? (
              <span className="ml-0.5 inline-block h-3 w-px animate-pulse bg-[#191919]" />
            ) : null}
          </p>
          {descOn ? (
            <p className="mt-0.5 truncate text-[12px] text-[#707070]">
              {descTyping}
              {descOn && descTyping.length < item.description.length ? (
                <span className="ml-0.5 inline-block h-3 w-px animate-pulse bg-[#707070]" />
              ) : null}
            </p>
          ) : null}
          {priceOn && !dropMode ? (
            <p className="mt-0.5 text-[12px] text-[#707070]">
              <motion.span
                key="price"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-0.5 tabular-nums"
              >
                <span className="text-[#8a8a8a]">Sold</span>
                <span>eBay {compsLabel}</span>
                <span>Amazon ${Math.round(item.comps * 0.94).toLocaleString("en-US")}</span>
                <span className="font-semibold text-[#141414]">You ${price.toFixed(0)}</span>
              </motion.span>
            </p>
          ) : photosOn && !descOn ? (
            <p className="mt-0.5 text-[12px] text-[#707070]">
              {filled} of {shots.length} photos
            </p>
          ) : null}
        </div>
        {!dropMode && resting ? (
          <button
            type="button"
            onClick={replayStory}
            className="shrink-0 text-[13px] font-medium text-[#3665F3]"
          >
            Watch again
          </button>
        ) : null}
        {!dropMode ? (
        <motion.div
          className={cn(
            "relative h-10 w-[122px] shrink-0 overflow-hidden text-[13px] font-medium tracking-tight",
            readyOn || publishing || liveOn ? "bg-[#ececec] text-white" : "bg-[#ececec] text-[#9b9b9b]",
          )}
        >
          <motion.div
            className="absolute inset-y-0 left-0 bg-[#141414]"
            initial={false}
            animate={{
              width: allLive ? "100%" : publishing || liveOn ? "100%" : readyOn ? "0%" : "0%",
            }}
            transition={{ duration: publishing ? 0.7 : 0.35, ease: EASE }}
          />
          <span
            className={cn(
              "relative z-10 grid h-full place-items-center",
              publishing || liveOn || allLive ? "text-white" : readyOn ? "text-[#141414]" : "text-[#9b9b9b]",
            )}
          >
            {allLive || liveOn ? "Live" : "Publish"}
          </span>
        </motion.div>
        ) : null}
      </div>

      {showCenter && !resting ? (
        <CenterLine
          headline={caption.headline}
          sub={caption.sub}
          stepKey={`${sku}-${step.id}`}
          compact={compact}
        />
      ) : null}

      {dropMode ? (
        <>
          <DropStage
            fileDrag={fileDrag}
            freezeDrop={freezeDrop}
            shots={shots}
            catalog={catalog}
            sku={sku}
            compact={compact}
          />
          <StoreTargets compact={compact} />
        </>
      ) : (
      <div className="relative min-h-0 flex-1">
        <AnimatePresence mode="wait">
        {showAdmin ? (
          <motion.div
            key={`admin-${sku}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.48, ease: EASE }}
            className="h-full min-h-0"
          >
          <AdminLivePanel
            title={item.title}
            cover={cover}
            price={priceLabel}
            available={sales}
            sold={sold}
            storeName={shop}
          />
          </motion.div>
        ) : (
        <motion.div
          key={`stores-${sku}`}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.32, ease: EASE }}
          className="grid h-full min-h-0 grid-cols-6 grid-rows-2 divide-x divide-y divide-[#e5e5e5]"
        >
        <ChannelShell dim={publishing && !ebayIn} className="col-span-2">
          {ebayIn ? (
            <EbayLivePreview
              key={`ebay-${cover}`}
              photoSrc={cover}
              title={item.title}
              priceLabel={priceLabel}
              compareAtLabel={compsLabel}
              storeName={shop}
              live
              compact
              fill
              className="h-full min-h-0 rounded-none shadow-none ring-0"
            />
          ) : (
            <WaitingEbay />
          )}
        </ChannelShell>

        <ChannelShell dim={publishing && !amazonIn} className="col-span-2">
          {amazonIn ? (
            <AmazonStorefront
              key={`amz-${cover}`}
              src={cover}
              title={item.title}
              price={priceLabel}
              listPrice={compsLabel}
            />
          ) : (
            <WaitingAmazon />
          )}
        </ChannelShell>

        <ChannelShell dim={publishing && !facebookIn} className="col-span-2">
          {facebookIn ? (
            <FacebookStorefront
              key={`fb-${cover}`}
              src={cover}
              title={item.title}
              price={priceLabel}
              seller={shop}
            />
          ) : (
            <WaitingFacebook />
          )}
        </ChannelShell>

        <ChannelShell dim={publishing && !shopifyIn} className="col-span-3">
          {shopifyIn ? (
            <ShopifyStorefront key={`shop-${cover}`} src={cover} title={item.title} price={priceLabel} />
          ) : (
            <WaitingShopify />
          )}
        </ChannelShell>

        <ChannelShell dim={publishing && !webIn} className="col-span-3">
          {webIn ? (
            <SiteStorefront
              key={`web-${cover}`}
              src={cover}
              title={item.title}
              price={priceLabel}
              slug={slug}
            />
          ) : (
            <WaitingSite />
          )}
        </ChannelShell>
        </motion.div>
        )}
        </AnimatePresence>
      </div>
      )}

      {dropMode ? null : (
      <SalesStrip
        dollars={sales}
        sold={sold}
        unit={item.price}
        reduce={reduce}
      />
      )}
      {!dropMode && resting && showRestCta ? (
        <YourTurn onReplay={replayStory} />
      ) : null}
    </section>
  );
}
