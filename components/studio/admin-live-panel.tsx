"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  AmazonMark,
  EbayMark,
  FacebookMark,
  ShopifyMark,
  SiteMark,
} from "@/components/brand/store-marks";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

const NAV = ["Home", "Stats", "Listings", "Exports", "Settings"] as const;

function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function useRise(target: number) {
  const [n, setN] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 640);
      const eased = 1 - (1 - t) ** 3;
      const next = from + (target - from) * eased;
      fromRef.current = next;
      setN(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return n;
}

function StoreMarks({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <EbayMark className="h-3" />
      <AmazonMark className="h-2.5" />
      <FacebookMark className="h-2.5" />
      <ShopifyMark className="h-3.5" />
      <SiteMark className="h-3.5" />
    </div>
  );
}

export function AdminLivePanel({
  title,
  cover,
  price,
  available,
  sold,
  storeName,
}: {
  title: string;
  cover: string;
  price: string;
  available: number;
  sold: number;
  storeName: string;
}) {
  const shop = storeName.trim() || "your store";
  const risen = useRise(available);
  const orders = Math.max(sold, 1);
  const watchers = 8 + sold * 2;
  const channels: { key: string; mark: ReactNode }[] = [
    { key: "ebay", mark: <EbayMark className="h-[15px]" /> },
    { key: "amazon", mark: <AmazonMark className="h-3.5" /> },
    { key: "facebook", mark: <FacebookMark className="h-3.5" /> },
    { key: "shopify", mark: <ShopifyMark className="h-4" /> },
    { key: "site", mark: <SiteMark className="h-4" /> },
  ];
  const kpis = [
    { label: "Available", value: money(risen) },
    { label: "Orders", value: String(orders) },
    { label: "Live listings", value: "5" },
    { label: "Watchers", value: String(watchers) },
  ] as const;
  const feed = [
    { mark: <EbayMark className="h-3" />, text: `Live on eBay · ${shop}`, when: "just now" },
    { mark: <AmazonMark className="h-2.5" />, text: "Live on Amazon", when: "just now" },
    { mark: <FacebookMark className="h-2.5" />, text: "Live on Marketplace", when: "just now" },
    { mark: <ShopifyMark className="h-3.5" />, text: "Live on Shopify", when: "just now" },
    { mark: <SiteMark className="h-3.5" />, text: `Sold · ${price}`, when: "now" },
  ] as const;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] bg-white"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-[#e5e5e5] px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-4">
          <p className="text-[11px] font-medium tracking-[0.16em] text-[#8a8a8a] uppercase">
            Studio
          </p>
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            {NAV.map((label, i) => (
              <motion.span
                key={label}
                initial={{ opacity: 0.2 }}
                animate={{ opacity: i === 1 ? 1 : 0.45 }}
                transition={{ delay: 0.06 * i, duration: 0.4, ease: EASE }}
                className={cn(
                  "text-[12px] tracking-tight",
                  i === 1
                    ? "border-b border-[#141414] pb-0.5 font-medium text-[#141414]"
                    : "text-[#8a8a8a]",
                )}
              >
                {label}
              </motion.span>
            ))}
          </div>
        </div>
        <span className="shrink-0 text-[11px] font-medium tracking-tight text-[#3665F3]">
          Live
        </span>
      </div>

      <div className="grid shrink-0 grid-cols-4 border-b border-[#e5e5e5]">
        {kpis.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.07, duration: 0.4, ease: EASE }}
            className={cn("px-3 py-3 sm:px-4", i > 0 && "border-l border-[#e5e5e5]")}
          >
            <p className="text-[10px] font-medium tracking-[0.12em] text-[#8a8a8a] uppercase">
              {kpi.label}
            </p>
            <p className="mt-1 text-[17px] font-medium tabular-nums tracking-tight text-[#141414] sm:text-[20px]">
              {kpi.value}
            </p>
          </motion.div>
        ))}
      </div>

      <div className="grid min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="min-h-0 overflow-y-auto border-b border-[#e5e5e5] lg:border-r lg:border-b-0">
          <p className="px-3 pt-3 text-[11px] font-medium tracking-[0.14em] text-[#8a8a8a] uppercase sm:px-4">
            Listings
          </p>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22, duration: 0.4, ease: EASE }}
            className="mx-3 mt-2.5 mb-1 flex items-center gap-3 bg-[#fafafa] px-2.5 py-2 sm:mx-4"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover}
              alt=""
              className="size-14 shrink-0 object-contain sm:size-[68px]"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium tracking-tight text-[#141414]">
                {title}
              </p>
              <p className="mt-0.5 text-[13px] tabular-nums text-[#141414]">{price}</p>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <StoreMarks />
                <span className="text-[11px] font-medium text-[#3665F3]">Live</span>
              </div>
            </div>
          </motion.div>

          <div>
            {channels.map((channel, i) => (
              <motion.div
                key={channel.key}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.09, duration: 0.35, ease: EASE }}
                className="flex items-center gap-3 px-3 py-2.5 sm:px-4"
              >
                <div className="flex h-5 min-w-[92px] shrink-0 items-center">
                  {channel.mark}
                </div>
                <span className="h-px min-w-0 flex-1 bg-[#eee]" />
                <span className="text-[11px] font-medium text-[#3665F3]">Live</span>
                <span className="w-[72px] text-right text-[12px] tabular-nums text-[#141414]">
                  {price}
                </span>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto">
          <p className="px-3 pt-3 text-[11px] font-medium tracking-[0.14em] text-[#8a8a8a] uppercase sm:px-4">
            Activity
          </p>
          <div className="mt-1">
            {feed.map((row, i) => (
              <motion.div
                key={row.text}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + i * 0.11, duration: 0.35, ease: EASE }}
                className="flex items-center gap-3 px-3 py-2.5 sm:px-4"
              >
                <div className="flex h-4 w-10 shrink-0 items-center">{row.mark}</div>
                <p className="min-w-0 flex-1 truncate text-[13px] text-[#141414]">{row.text}</p>
                <p className="shrink-0 text-[11px] text-[#8a8a8a]">{row.when}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
