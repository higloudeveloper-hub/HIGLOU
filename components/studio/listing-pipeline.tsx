"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Globe, MapPin, MousePointer2, Search, ShoppingCart } from "lucide-react";
import { usePrefersReducedMotion } from "@/components/listing/wizard/use-prefers-reduced-motion";
import {
  EbayLivePreview,
  EbayWordmark,
  useConnectedEbayStoreName,
} from "@/components/studio/ebay-live-preview";
import { cn } from "@/lib/utils";
import { STORY_CATALOG, type StoryItem } from "@/components/studio/ready-catalog";

const CATALOG = STORY_CATALOG;

const STEPS = [
  { id: "grab", ms: 1400, x: 14, y: 74, click: true, label: "Grab one photo" },
  { id: "drag", ms: 1600, x: 9, y: 11, click: false, label: "Drop on listing" },
  { id: "drop", ms: 800, x: 9, y: 11, click: true, label: "Photo in" },
  { id: "photos", ms: 1000, x: 22, y: 8, click: false, label: "Higlou adds shots" },
  { id: "title", ms: 850, x: 40, y: 8, click: false, label: "Title writes itself" },
  { id: "desc", ms: 750, x: 40, y: 8, click: false, label: "Description" },
  { id: "compare", ms: 800, x: 40, y: 8, click: false, label: "Priced vs sold comps" },
  { id: "fillEbay", ms: 1300, x: 16, y: 38, click: false, label: "eBay" },
  { id: "fillAmazon", ms: 1300, x: 50, y: 38, click: false, label: "Amazon" },
  { id: "fillFacebook", ms: 1300, x: 84, y: 38, click: false, label: "Facebook" },
  { id: "fillShopify", ms: 1300, x: 24, y: 70, click: false, label: "Shopify" },
  { id: "fillWeb", ms: 1300, x: 76, y: 70, click: false, label: "Your site" },
  { id: "ready", ms: 1500, x: 91, y: 8, click: false, label: "Publish" },
  { id: "publish", ms: 1600, x: 50, y: 48, click: true, label: "Publishing" },
  { id: "dispatch", ms: 4000, x: 50, y: 48, click: false, label: "Sending" },
  { id: "sales", ms: 1800, x: 88, y: 93, click: false, label: "Revenue" },
  { id: "hold", ms: 1200, x: 88, y: 93, click: false, label: "Next product" },
] as const;

const DROP_STEPS = [
  { id: "grab", ms: 1200, x: 14, y: 74, click: true, label: "Grab one photo" },
  { id: "drag", ms: 1400, x: 9, y: 11, click: false, label: "Drop on listing" },
  { id: "drop", ms: 900, x: 9, y: 11, click: true, label: "Photo in" },
  { id: "hold", ms: 1400, x: 9, y: 11, click: false, label: "Your turn" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

function stepIndex(id: StepId) {
  return STEPS.findIndex((s) => s.id === id);
}

const FILL_FLY: Partial<Record<StepId, { x: number; y: number }>> = {
  fillEbay: { x: 16, y: 38 },
  fillAmazon: { x: 50, y: 38 },
  fillFacebook: { x: 84, y: 38 },
  fillShopify: { x: 24, y: 70 },
  fillWeb: { x: 76, y: 70 },
};

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
  "fillEbay",
  "fillAmazon",
  "fillFacebook",
  "fillShopify",
  "fillWeb",
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
    }, 10);
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

function AmazonMark({ className, hero = false }: { className?: string; hero?: boolean }) {
  return (
    <span className={cn("relative inline-block font-semibold tracking-tight", className)}>
      amazon
      <span
        aria-hidden
        className={cn(
          "absolute right-0 left-[18%] rounded-full",
          hero ? "-bottom-2 h-3" : "-bottom-1 h-[5px]",
        )}
        style={{
          background:
            "radial-gradient(120% 120% at 50% -20%, transparent 42%, #FF9900 43%, #FF9900 70%, transparent 71%)",
        }}
      />
    </span>
  );
}

function FacebookLogo({ hero = false, word = false }: { hero?: boolean; word?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg
        viewBox="0 0 36 36"
        className={hero ? "size-[72px] sm:size-[88px]" : "size-6"}
        aria-label="Facebook"
      >
        <rect width="36" height="36" rx="8" fill="#1877F2" />
        <path
          fill="#fff"
          d="M25.2 18.6h-4.3V32h-5.4V18.6H12v-4.5h3.5v-2.8c0-3.6 1.6-5.6 5.7-5.6H25v4.6h-2.3c-1.7 0-2.2.8-2.2 2.1v1.7h4.4l-.7 4.5Z"
        />
      </svg>
      {hero || word ? (
        <span
          className={cn(
            "font-bold tracking-tight text-[#1877F2]",
            hero ? "text-[40px] sm:text-[52px]" : "text-[13px]",
          )}
        >
          facebook
        </span>
      ) : null}
    </span>
  );
}

function ShopifyLogo({
  hero = false,
  light = false,
}: {
  hero?: boolean;
  light?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2",
        light ? "text-white" : "text-[#141414]",
      )}
    >
      <svg viewBox="0 0 24 24" className={hero ? "size-[72px] sm:size-[80px]" : "size-5"} aria-hidden>
        <path
          fill="#95BF47"
          d="M19.2 4.6 17.6.4c-.1-.2-.3-.3-.5-.2l-1.6.5C15.2.3 14.6 0 14.2 0 11.7 0 9.6 2.6 9 6.3L3.8 8c-.3.1-.5.4-.5.7L2 21.2c0 .3.2.6.5.6h14.4c.3 0 .5-.2.6-.5l2.2-16c.1-.3-.1-.6-.5-.7ZM14.2 2c.2 0 .4 0 .6.1l-1.2 3.7c-.8-.2-1.6-.3-2.4-.3.4-2 1.3-3.5 3-3.5Zm-2.2 5.8c.9 0 1.9.1 2.9.4L13.6 12c-1.2-.4-2.2-.5-3-.5-.2-1.3.2-2.7 1.4-3.7Z"
        />
      </svg>
      <span
        className={cn(
          "font-semibold tracking-tight",
          hero ? "text-[44px] sm:text-[56px]" : "text-[14px]",
        )}
      >
        Shopify
      </span>
    </span>
  );
}

function StoreLogo({ name, hero = false }: { name: string; hero?: boolean }) {
  if (name === "eBay") {
    return <EbayWordmark className={hero ? "text-[72px] sm:text-[96px]" : "text-[18px]"} />;
  }
  if (name === "Amazon") {
    return (
      <AmazonMark
        hero={hero}
        className={hero ? "text-[60px] text-[#131921] sm:text-[80px]" : "text-[16px] text-[#131921]"}
      />
    );
  }
  if (name === "Facebook") return <FacebookLogo hero={hero} />;
  if (name === "Shopify") return <ShopifyLogo hero={hero} />;
  return (
    <span className={cn("inline-flex items-center gap-3 font-semibold tracking-tight", hero ? "text-[40px] sm:text-[52px]" : "text-[13px]")}>
      <Globe className={hero ? "size-14 sm:size-16" : "size-3.5"} />
      Your site
    </span>
  );
}

function StoreTargets() {
  const stores = [
    { key: "ebay", node: <EbayWordmark className="text-[18px]" /> },
    { key: "amazon", node: <AmazonMark className="text-[16px] text-[#131921]" /> },
    { key: "facebook", node: <FacebookLogo word /> },
    { key: "shopify", node: <ShopifyLogo /> },
    {
      key: "site",
      node: (
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold tracking-tight text-[#141414]">
          <Globe className="size-3.5" />
          Your site
        </span>
      ),
    },
  ] as const;

  return (
    <div className="shrink-0 border-t border-[#e5e5e5] bg-white px-4 py-3">
      <p className="mb-2.5 text-center text-[11px] font-medium tracking-[0.16em] text-[#8a8a8a] uppercase">
        Publishes to five stores
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {stores.map((store) => (
          <div
            key={store.key}
            className="flex h-11 min-w-[108px] items-center justify-center rounded-lg bg-white px-3 ring-1 ring-[#e5e5e5]"
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
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
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
        {label ? (
          <motion.span
            key={clickKey}
            initial={{ opacity: 0, y: 6, x: flip ? 8 : -8 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "absolute top-7 max-w-[220px] rounded-md bg-[#141414] px-2 py-1 text-[12px] font-medium text-white shadow-[0_8px_20px_-10px_rgba(0,0,0,0.45)]",
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
      return { headline: "ONE PHOTO", sub: "Grab it from Ready to list." };
    case "drag":
      return { headline: "DROP IT", sub: "On the first listing slot." };
    case "drop":
      return { headline: "PHOTO IN", sub: "Higlou takes over from here." };
    case "photos":
      return {
        headline: "MORE SHOTS",
        sub: `${ctx.filled} of ${ctx.shots} from that one photo.`,
      };
    case "title":
      return { headline: "TITLE WRITES ITSELF", sub: "From the photo. Ready for every store." };
    case "desc":
      return { headline: "THEN THE COPY", sub: "Buyer-ready. No typing." };
    case "compare":
      return { headline: "PRICED TO SELL", sub: "Undercut what already sold." };
    case "fillEbay":
      return { headline: "", sub: "Now live." };
    case "fillAmazon":
      return { headline: "", sub: "Now live." };
    case "fillFacebook":
      return { headline: "", sub: "Now live." };
    case "fillShopify":
      return { headline: "", sub: "Now live." };
    case "fillWeb":
      return { headline: "", sub: "Now live." };
    case "ready":
      return { headline: "ONLY ONE CLICK", sub: "Publish once. All five go live." };
    case "publish":
      return { headline: "EVERYTHING BECOMES ONE", sub: "Photos, title, price — one packet." };
    case "dispatch":
      return { headline: "FLYING TO FIVE STORES", sub: "eBay · Amazon · Facebook · Shopify · your site" };
    case "sales":
      return { headline: "MONEY IN", sub: "Watch the wallet. Real time." };
    case "hold":
      return { headline: "NEXT PRODUCT", sub: "The wallet keeps the money." };
    default:
      return { headline: "Watch this.", sub: "One photo becomes five live storefronts." };
  }
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
        stamp
          ? "inset-0 items-center"
          : "inset-x-0 top-[12%] items-start sm:top-[14%]",
      )}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={stepKey}
          initial={{ opacity: 0, y: stamp ? 22 : 10, scale: stamp ? 0.72 : 0.94 }}
          animate={{ opacity: 1, y: 0, scale: stamp ? 1.04 : 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.98 }}
          transition={
            stamp
              ? { type: "spring", stiffness: 320, damping: 18 }
              : { duration: 0.32, ease: [0.22, 1, 0.36, 1] }
          }
          className={cn(
            "relative max-w-[560px] text-center",
            stamp
              ? ""
              : "rounded-2xl bg-white/92 px-5 py-3 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.45)] ring-1 ring-black/5 sm:px-7 sm:py-3.5",
          )}
        >
          {mark ? (
            <div className="mb-2 flex justify-center drop-shadow-[0_12px_28px_rgba(255,255,255,0.9)]">
              {mark}
            </div>
          ) : (
            <p
              className={cn(
                "font-semibold tracking-[-0.045em] text-[#141414] leading-[0.95]",
                compact ? "text-[24px]" : "text-[28px] sm:text-[40px]",
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
        scale: phase === "drop" ? 0.16 : phase === "grab" ? 1 : 1.08,
        rotate: phase === "grab" ? -4 : phase === "drag" ? -12 : 0,
      }}
      transition={{
        type: "spring",
        stiffness: phase === "drag" ? 160 : 240,
        damping: phase === "drag" ? 20 : 22,
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

function FlyClone({
  src,
  toX,
  toY,
  hopKey,
  fromX = 9,
  fromY = 11,
  size = 48,
}: {
  src: string;
  toX: number;
  toY: number;
  hopKey: string;
  fromX?: number;
  fromY?: number;
  size?: number;
}) {
  return (
    <motion.div
      key={hopKey}
      className="pointer-events-none absolute z-20 overflow-hidden rounded-md bg-white shadow-[0_24px_48px_-18px_rgba(0,0,0,0.42)] ring-1 ring-black/10"
      initial={{
        left: `${fromX}%`,
        top: `${fromY}%`,
        width: size,
        height: size,
        opacity: 1,
        x: "-50%",
        y: "-50%",
        rotate: -8,
        scale: 1,
      }}
      animate={{
        left: [`${fromX}%`, `${fromX + (toX - fromX) * 0.42}%`, `${toX}%`],
        top: [`${fromY}%`, `${Math.min(fromY, toY) - 10}%`, `${toY}%`],
        width: [size, size + 8, 36],
        height: [size, size + 8, 36],
        opacity: [1, 1, 0],
        rotate: [-8, 6, 0],
        scale: [1, 1.12, 0.4],
      }}
      transition={{ duration: 0.78, times: [0, 0.32, 1], ease: [0.16, 1, 0.3, 1] }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="size-full object-contain p-0.5" />
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
      initial={{ left: "18%", top: "9%", scale: 0.22, opacity: 0, x: "-50%", y: "-50%", rotate: -16 }}
      animate={
        packed
          ? { left: "50%", top: "50%", scale: 0.72, opacity: 0.32, rotate: 0 }
          : { left: "50%", top: "50%", scale: 1, opacity: 1, rotate: -3 }
      }
      transition={{ type: "spring", stiffness: 170, damping: 15 }}
    >
      {extras.slice(1, 3).map((shot, i) => (
        <motion.div
          key={shot}
          className="absolute overflow-hidden rounded-[3px] bg-white p-1 pb-5 shadow-[0_20px_40px_-14px_rgba(0,0,0,0.45)] ring-1 ring-black/10"
          initial={{
            left: i === 0 ? -78 : 96,
            top: 48,
            rotate: i === 0 ? -22 : 22,
            opacity: 0,
          }}
          animate={{
            left: packed ? (i === 0 ? -6 : 26) : (i + 1) * 11,
            top: packed ? (i + 1) * -5 : (i + 1) * -10,
            rotate: packed ? (i === 0 ? -3 : 7) : (i + 1) * 7,
            opacity: packed ? 0.15 : 1,
          }}
          transition={{ type: "spring", stiffness: 220, damping: 16, delay: packed ? 0 : 0.1 + i * 0.12 }}
          style={{ width: 128, height: 156 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot} alt="" className="size-full object-contain" />
        </motion.div>
      ))}
      <div className="relative h-[176px] w-[142px] overflow-hidden rounded-[4px] bg-white p-2 pb-8 shadow-[0_40px_70px_-16px_rgba(0,0,0,0.55)] ring-1 ring-black/10">
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
  const midX = 50 + (toX - 50) * 0.46;
  const midY = Math.min(toY, 38) - 22;
  const spin = toX >= 50 ? 22 : -20;

  return (
    <motion.div
      key={hopKey}
      className="pointer-events-none absolute z-40"
      initial={{
        left: "50%",
        top: "50%",
        opacity: 0,
        x: "-50%",
        y: "-50%",
        rotate: -10,
        scale: 0.28,
      }}
      animate={{
        left: ["50%", `${midX}%`, `${toX}%`],
        top: ["50%", `${midY}%`, `${toY}%`],
        opacity: [0, 1, 1, 0],
        rotate: [-10, spin * 0.4, spin],
        scale: [0.28, 1.08, 0.18],
      }}
      transition={{
        delay,
        duration: 1.05,
        times: [0, 0.24, 1],
        ease: [
          [0.16, 1, 0.3, 1],
          [0.55, 0.02, 0.9, 0.28],
        ],
        opacity: { delay, duration: 1.05, times: [0, 0.07, 0.8, 1] },
      }}
    >
      <motion.span
        aria-hidden
        className="absolute top-full left-1/2 mt-2 h-2 w-[72px] -translate-x-1/2 rounded-full bg-black/30 blur-[6px]"
        initial={{ opacity: 0, scaleX: 0.4 }}
        animate={{ opacity: [0, 0.45, 0], scaleX: [0.4, 1.25, 0.25] }}
        transition={{ delay, duration: 1.05, times: [0, 0.24, 1] }}
      />
      <div className="h-[158px] w-[128px] overflow-hidden rounded-[3px] bg-white p-1 pb-5 shadow-[0_36px_60px_-12px_rgba(0,0,0,0.52)] ring-1 ring-black/10">
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
        opacity: on ? 1 : focused ? 0.78 : 0.38,
        filter: on ? "saturate(1)" : "saturate(0.45)",
      }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      className={cn(
        "relative flex h-full min-h-0 flex-col overflow-hidden bg-white",
        focused && "z-10 ring-2 ring-inset ring-[#141414]/20 shadow-[0_8px_28px_-18px_rgba(0,0,0,0.35)]",
        className,
      )}
    >
      {children}
      <AnimatePresence>
        {live ? (
          <>
            <motion.span
              key="flash"
              initial={{ opacity: 0.55 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="pointer-events-none absolute inset-0 z-20 bg-white"
            />
            <motion.span
              key="ring"
              initial={{ scale: 0.82, opacity: 0.4 }}
              animate={{ scale: 1.12, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-none absolute inset-3 z-20 rounded-md ring-2 ring-[#141414]/30"
            />
          </>
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
    <div className={cn("relative h-full min-h-0 overflow-hidden bg-white", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <motion.img
        key={src}
        src={src}
        alt=""
        initial={{ y: -16, opacity: 0, scale: 0.94 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 26 }}
        className="absolute inset-0 size-full object-contain p-1.5"
      />
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
        <AmazonMark className="text-[13px] text-white" />
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
      <LivePhoto src={src} />
      <div className="shrink-0 px-2 pb-2 pt-1">
        <p className="line-clamp-1 text-[11px] leading-snug text-[#0F1111]">{title}</p>
        <p className="mt-0.5 flex items-center gap-1 text-[11px]">
          <span className="tracking-tight text-[#DE7921]">★★★★★</span>
          <span className="text-[#007185]">4.8</span>
        </p>
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
        <p className="text-[10px] font-medium text-[#007600]">In Stock.</p>
        <div className="mt-1 grid grid-cols-2 gap-1">
          <p className="grid h-7 place-items-center rounded-full bg-[#FFD814] text-[10px] font-semibold whitespace-nowrap text-[#0F1111]">
            Add to Cart
          </p>
          <p className="grid h-7 place-items-center rounded-full bg-[#FFA41C] text-[10px] font-semibold whitespace-nowrap text-[#0F1111]">
            Buy Now
          </p>
        </div>
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
        <FacebookLogo />
        <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-[#050505]">
          Marketplace
        </span>
        <span className="truncate text-[11px] text-[#65676B]">{seller}</span>
      </div>
      <LivePhoto src={src} className="bg-[#F0F2F5]" />
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
        <ShopifyLogo />
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
      <LivePhoto src={src} />
      <div className="shrink-0 px-3 pb-2 pt-1.5">
        <p className="line-clamp-1 text-[13px] font-medium tracking-tight text-[#121212]">{title}</p>
        <p className="mt-0.5 text-[16px] tabular-nums text-[#121212]">{price}</p>
        <div className="mt-1 flex h-6 w-[88px] items-center justify-between rounded-sm border border-[#c9c9c9] px-1.5 text-[11px] tabular-nums text-[#121212]">
          <span className="text-[#8a8a8a]">−</span>
          1
          <span className="text-[#8a8a8a]">+</span>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1">
          <p className="grid h-7 place-items-center rounded-sm bg-[#121212] text-[10px] font-semibold whitespace-nowrap text-white">
            Add to cart
          </p>
          <p className="grid h-7 place-items-center rounded-sm bg-[#5A31F4] text-[10px] font-semibold whitespace-nowrap text-white">
            Buy it now
          </p>
        </div>
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
      <LivePhoto src={src} />
      <div className="shrink-0 px-3 pb-2 pt-1.5">
        <p className="line-clamp-1 text-[13px] font-medium tracking-tight text-[#141414]">{title}</p>
        <p className="mt-0.5 text-[16px] font-medium tabular-nums">{price}</p>
        <p className="mt-0.5 text-[11px] text-[#8a8a8a]">Free shipping · Ships in 2–4 days</p>
        <p className="mt-1.5 grid h-7 place-items-center rounded-none bg-[#141414] text-[11px] font-medium tracking-wide text-white">
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
}) {
  const reduce = usePrefersReducedMotion();
  const dropMode = mode === "drop";
  const hasUserPhotos = Boolean(photos && photos.length > 0);
  const freezeDrop = dropMode && hasUserPhotos;
  const timeline = dropMode ? DROP_STEPS : STEPS;
  const [beat, setBeat] = useState(0);
  const [sku, setSku] = useState(0);
  const [fileDrag, setFileDrag] = useState(false);
  const [filled, setFilled] = useState(reduce ? 4 : 0);
  const [landed, setLanded] = useState(0);
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
  const ebayIn = at("fillEbay");
  const amazonIn = at("fillAmazon");
  const facebookIn = at("fillFacebook");
  const shopifyIn = at("fillShopify");
  const webIn = at("fillWeb");
  const readyOn = at("ready");
  const packing = is("publish");
  const dispatching = is("dispatch");
  const publishing = packing || dispatching;
  const ebayLive = landed >= 1;
  const amazonLive = landed >= 2;
  const facebookLive = landed >= 3;
  const shopifyLive = landed >= 4;
  const webLive = landed >= 5;
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
  const stampName =
    is("fillEbay") || (dispatching && landed === 1)
      ? "eBay"
      : is("fillAmazon") || (dispatching && landed === 2)
        ? "Amazon"
        : is("fillFacebook") || (dispatching && landed === 3)
          ? "Facebook"
          : is("fillShopify") || (dispatching && landed === 4)
            ? "Shopify"
            : is("fillWeb") || (dispatching && landed === 5)
              ? "site"
              : null;
  const showCenter =
    dropMode ||
    Boolean(stampName) ||
    step.id === "grab" ||
    step.id === "ready" ||
    step.id === "publish" ||
    step.id === "sales";

  useEffect(() => {
    if (dropMode) {
      onStory?.({ sku: 0, phase: "gone", cover });
      return;
    }
    onStory?.({ sku: sku % catalog.length, phase: dragPhase, cover });
  }, [dropMode, sku, dragPhase, cover, onStory, catalog.length]);

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
      setBeat(timeline.length - 1);
      return;
    }
    let i = 0;
    let id = 0;
    const loop = () => {
      id = window.setTimeout(() => {
        if (fileDragRef.current) {
          loop();
          return;
        }
        i += 1;
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
  }, [reduce, dropMode, freezeDrop, timeline]);

  useEffect(() => {
    if (reduce || freezeDrop) {
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
    }, 180);
    return () => window.clearInterval(t);
  }, [photoIn, photosOn, reduce, freezeDrop, shots.length]);

  useEffect(() => {
    if (dropMode) return;
    if (reduce) {
      setLanded(5);
      return;
    }
    if (step.id === "dispatch") {
      setLanded(0);
      const times = [1050, 1600, 2150, 2700, 3250];
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
  }, [dropMode, reduce, step.id, sku]);

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
          {!dropMode && FILL_FLY[step.id] ? (
            <FlyClone
              src={cover}
              toX={FILL_FLY[step.id]!.x}
              toY={FILL_FLY[step.id]!.y}
              hopKey={`${sku}-${step.id}`}
            />
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
                  delay={i * 0.55}
                  hopKey={`${sku}-fall-${store.name}`}
                />
              ))
            : null}
          <GuideCursor
            x={is("photos") ? 8 + Math.max(0, filled - 1) * 5.2 : step.x}
            y={step.y}
            click={step.click || (is("photos") && filled > 1)}
            visible={
              !CURSOR_OFF.has(step.id) &&
              !(dropMode && is("hold")) &&
              !(!dropMode && (is("grab") || is("drag")))
            }
            label=""
            clickKey={`${step.id}-${sku}-${is("photos") ? filled : beat}`}
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
              ? { scale: 0.62, x: 36 }
              : { scale: 1, x: 0 }
          }
          transition={{ type: "spring", stiffness: 280, damping: 22 }}
        >
          {dragging || fileDrag ? (
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
                    ? "border-2 border-dashed border-[#141414] bg-[#f7f7f7] shadow-[0_0_0_6px_rgba(20,20,20,0.06)]"
                    : "border border-dashed border-[#d8d8d8] bg-[#fafafa]",
                )}
              />
            ))
          ) : (
            shots.map((src, i) => (
              <motion.div
                key={`${sku}-${src}`}
                data-listing-slot={i === 0 ? "" : undefined}
                initial={i === 0 ? false : { opacity: 0, scale: 0.45, x: -18 }}
                animate={{
                  opacity: packing ? (i === 0 ? 1 : 0.35) : i < filled ? 1 : photoIn ? 0.2 : 0,
                  y: packing ? 0 : i < filled ? 0 : 6,
                  scale: packing ? 0.85 : i < filled ? 1 : 0.92,
                  x: packing ? -i * 22 : i < filled ? 0 : -8,
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
                    {i === 0 && is("photos") ? (
                      <motion.span
                        className="pointer-events-none absolute inset-x-0 h-px bg-[#141414]"
                        initial={{ top: "8%", opacity: 0.55 }}
                        animate={{ top: "88%", opacity: 0 }}
                        transition={{ duration: 1.15, ease: "easeInOut" }}
                      />
                    ) : null}
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
                : item.name
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
        {!dropMode ? (
        <motion.div
          className={cn(
            "relative h-10 w-[122px] shrink-0 overflow-hidden rounded-md text-[13px] font-semibold tracking-[-0.01em]",
            readyOn || publishing || liveOn ? "bg-[#ececec] text-white" : "bg-[#ececec] text-[#9b9b9b]",
          )}
          animate={{ scale: publishing ? [1, 0.96, 1] : 1 }}
          transition={{ duration: 0.35 }}
        >
          <motion.div
            className="absolute inset-x-0 bottom-0 bg-[#141414]"
            initial={false}
            animate={{
              height: allLive ? "100%" : publishing || liveOn ? "85%" : "0%",
            }}
            transition={{ duration: publishing ? 0.62 : 0.32, ease: [0.22, 1, 0.36, 1] }}
          />
          <span
            className={cn(
              "relative z-10 grid h-full place-items-center",
              publishing || liveOn ? "text-white" : readyOn ? "text-[#141414]" : "text-[#9b9b9b]",
            )}
          >
            {packing ? "Packing" : dispatching ? "Sending" : liveOn ? "Live" : "Publish"}
          </span>
        </motion.div>
        ) : null}
      </div>

      {showCenter ? (
        <CenterLine
          headline={stampName ? "" : caption.headline}
          sub={stampName ? "Now live." : caption.sub}
          mark={
            stampName ? (
              <StoreLogo name={stampName} hero={!compact} />
            ) : undefined
          }
          stepKey={`${sku}-${step.id}-${stampName ?? beat}`}
          compact={compact}
        />
      ) : null}

      {dropMode ? (
        <div className="relative flex min-h-0 flex-1 flex-col bg-[#f7f7f7]">
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4">
            <div className="flex items-end justify-center gap-2 sm:gap-3">
              {(freezeDrop ? shots.slice(0, 5) : CATALOG.map((p) => p.photos[0])).map((src, i) => {
                const on = freezeDrop ? i === 0 : i === sku % CATALOG.length;
                const label = freezeDrop ? `Photo ${i + 1}` : CATALOG[i]?.name;
                return (
                  <div key={`${label}-${src}`} className="flex flex-col items-center gap-1.5">
                    <div
                      className={cn(
                        "overflow-hidden rounded-lg bg-white ring-1 ring-[#e5e5e5] transition",
                        on
                          ? "h-[88px] w-[72px] ring-[#141414] sm:h-[108px] sm:w-[88px]"
                          : "h-[64px] w-[52px] opacity-45 sm:h-[76px] sm:w-[62px]",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="size-full object-contain p-1" />
                    </div>
                    <p className={cn("text-[11px]", on ? "font-semibold text-[#141414]" : "text-[#8a8a8a]")}>
                      {label}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
          <StoreTargets />
        </div>
      ) : (
      <motion.div
        className="relative min-h-0 flex-1 origin-top"
        animate={
          packing
            ? { scale: 0.86, y: 20, opacity: 0.22 }
            : { scale: 1, y: 0, opacity: 1 }
        }
        transition={{ type: "spring", stiffness: 240, damping: 22 }}
      >
        <div className="grid h-full min-h-0 grid-cols-6 grid-rows-2 divide-x divide-y divide-[#e5e5e5]">
        <ChannelShell live={ebayLive} filled={ebayIn} focused={is("fillEbay") || (dispatching && landed === 1)} className="col-span-2">
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

        <ChannelShell live={amazonLive} filled={amazonIn} focused={is("fillAmazon") || (dispatching && landed === 2)} className="col-span-2">
          {amazonIn ? (
            <AmazonStorefront
              key={`amz-${cover}`}
              src={cover}
              title={item.title}
              price={priceLabel}
              listPrice={compsLabel}
            />
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

        <ChannelShell live={facebookLive} filled={facebookIn} focused={is("fillFacebook") || (dispatching && landed === 3)} className="col-span-2">
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
                <FacebookLogo word />
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

        <ChannelShell live={shopifyLive} filled={shopifyIn} focused={is("fillShopify") || (dispatching && landed === 4)} className="col-span-3">
          {shopifyIn ? (
            <ShopifyStorefront key={`shop-${cover}`} src={cover} title={item.title} price={priceLabel} />
          ) : (
            <>
              <div className="flex shrink-0 items-center justify-between border-b border-[#eee] bg-white px-3 py-2">
                <ShopifyLogo />
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

        <ChannelShell live={webLive} filled={webIn} focused={is("fillWeb") || (dispatching && landed === 5)} className="col-span-3">
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
      </motion.div>
      )}

      {dropMode ? null : (
      <SalesStrip
        dollars={sales}
        sold={sold}
        unit={item.price}
        reduce={reduce}
      />
      )}
    </section>
  );
}
