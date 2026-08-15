"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Check, Globe, Loader2 } from "lucide-react";
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

const BEATS = [
  { id: "photos", ms: 1600 },
  { id: "draft", ms: 2000 },
  { id: "click", ms: 900 },
  { id: "ebay", ms: 650 },
  { id: "amazon", ms: 650 },
  { id: "facebook", ms: 650 },
  { id: "web", ms: 650 },
  { id: "hold", ms: 2600 },
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
    }, 20);
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
        opacity: live ? 1 : 0.42,
        y: live ? 0 : 8,
      }}
      transition={{ type: "spring", stiffness: 280, damping: 24 }}
      className={cn(
        "flex min-h-0 flex-col overflow-hidden bg-white",
        live ? "shadow-[0_16px_40px_-28px_rgba(0,0,0,0.45)]" : "",
      )}
    >
      {children}
    </motion.div>
  );
}

function ProductShot({ live }: { live: boolean }) {
  return (
    <div className="relative min-h-0 flex-1 bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <motion.img
        src={SAMPLE_PHOTOS[0]}
        alt=""
        initial={false}
        animate={{
          opacity: live ? 1 : 0.14,
          scale: live ? 1 : 0.96,
          y: live ? 0 : 8,
        }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        className="absolute inset-0 size-full object-contain p-4"
      />
    </div>
  );
}

function LivePill({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
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
  className,
}: {
  storeName?: string | null;
  compact?: boolean;
  className?: string;
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
        "flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white",
        compact && "rounded-2xl border border-[#e5e5e5]",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-[#e5e5e5] bg-white px-3 py-2.5 sm:px-4">
        <div className="flex shrink-0 items-center gap-1">
          {SAMPLE_PHOTOS.map((src, i) => (
            <motion.div
              key={src}
              initial={false}
              animate={{ opacity: photosOn ? 1 : 0.25, scale: photosOn ? 1 : 0.96 }}
              transition={{ delay: i * 0.06 }}
              className="relative size-11 overflow-hidden rounded-lg bg-[#f7f7f7] sm:size-12"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="absolute inset-0 size-full object-contain p-0.5" />
            </motion.div>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold tracking-tight text-[#191919] sm:text-[15px]">
            {draftOn ? typing : "Drop photos. Higlou writes the listing."}
            {beat === 1 && typing.length < SAMPLE_TITLE.length ? (
              <span className="ml-0.5 inline-block h-3 w-px animate-pulse bg-[#191919]" />
            ) : null}
          </p>
          <p className="mt-0.5 text-[12px] text-[#707070]">
            {draftOn ? (
              <span className="font-semibold tabular-nums text-[#191919]">$189.00</span>
            ) : (
              "Title, price, and stores fill themselves."
            )}
            {draftOn ? " · one listing, four stores" : null}
          </p>
        </div>
        <motion.div
          initial={false}
          animate={
            beat === 2
              ? { scale: [1, 0.94, 1], boxShadow: "0 0 0 10px rgba(54,101,243,0.16)" }
              : { scale: 1, boxShadow: "0 0 0 0px rgba(54,101,243,0)" }
          }
          transition={{ duration: 0.4 }}
          className={cn(
            "inline-flex h-11 shrink-0 items-center rounded-full px-5 text-[13px] font-semibold",
            clickOn ? "bg-[#3665F3] text-white" : "bg-[#eee] text-[#9b9b9b]",
          )}
        >
          {beat === 2 ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3.5 animate-spin" />
              Click
            </span>
          ) : allLive || webOn ? (
            "Live everywhere"
          ) : (
            "Publish once"
          )}
        </motion.div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 divide-x divide-y divide-[#e5e5e5]">
        <ChannelShell live={ebayOn}>
          <div className="flex shrink-0 items-center justify-between border-b border-[#eee] px-3 py-2">
            <EbayWordmark className="text-[16px]" />
            <LivePill on={ebayOn} label="Live" />
          </div>
          <ProductShot live={ebayOn} />
          <div className="shrink-0 px-3 py-2">
            <p className="text-[16px] font-semibold tabular-nums">
              {ebayOn ? "$189.00" : "—"}
            </p>
            <p className="truncate text-[12px] text-[#707070]">
              {ebayOn ? `Buy It Now · ${shop}` : "eBay store"}
            </p>
          </div>
        </ChannelShell>

        <ChannelShell live={amazonOn}>
          <div className="flex shrink-0 items-center justify-between bg-[#232F3E] px-3 py-2">
            <AmazonMark className="text-[15px] text-white" />
            <LivePill on={amazonOn} label="Listed" />
          </div>
          <ProductShot live={amazonOn} />
          <div className="shrink-0 px-3 py-2">
            <p className="text-[16px] font-semibold text-[#B12704]">
              {amazonOn ? "$189.00" : "—"}
            </p>
            <p className="truncate text-[12px] text-[#707070]">Amazon · Add to Cart</p>
          </div>
        </ChannelShell>

        <ChannelShell live={facebookOn}>
          <div className="flex shrink-0 items-center justify-between border-b border-[#eee] px-3 py-2">
            <span className="text-[13px] font-bold text-[#1877F2]">
              facebook <span className="font-semibold text-[#65676B]">Marketplace</span>
            </span>
            <LivePill on={facebookOn} label="Posted" />
          </div>
          <ProductShot live={facebookOn} />
          <div className="shrink-0 px-3 py-2">
            <p className="text-[16px] font-semibold">{facebookOn ? "$189" : "—"}</p>
            <p className="truncate text-[12px] text-[#707070]">
              {facebookOn ? "Listed just now" : "Facebook Marketplace"}
            </p>
          </div>
        </ChannelShell>

        <ChannelShell live={webOn}>
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
          <ProductShot live={webOn} />
          <div className="shrink-0 px-3 py-2">
            <p className="text-[16px] font-semibold tabular-nums">
              {webOn ? "$189.00" : "—"}
            </p>
            <p className="truncate text-[12px] text-[#707070]">Your website</p>
          </div>
        </ChannelShell>
      </div>
    </section>
  );
}
