"use client";

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
  const channels = [
    { key: "ebay", name: "eBay", mark: <EbayMark className="h-4" /> },
    { key: "amazon", name: "Amazon", mark: <AmazonMark className="h-3.5" /> },
    { key: "facebook", name: "Facebook", mark: <FacebookMark className="h-3.5" /> },
    { key: "shopify", name: "Shopify", mark: <ShopifyMark className="h-4" /> },
    { key: "site", name: "Your site", mark: <SiteMark className="h-4" /> },
  ] as const;
  const kpis = [
    { label: "Available", value: money(available) },
    { label: "Orders", value: String(Math.max(sold, 1)) },
    { label: "Live listings", value: "5" },
    { label: "Watchers", value: String(8 + sold * 2) },
  ] as const;
  const feed = [
    { text: `Live on eBay · ${shop}`, when: "just now" },
    { text: "Live on Amazon", when: "just now" },
    { text: "Live on Facebook Marketplace", when: "just now" },
    { text: "Live on Shopify", when: "just now" },
    { text: `Sold · ${price}`, when: "now" },
  ] as const;

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] bg-[#f7f7f7]">
      <div className="flex shrink-0 items-center justify-between border-b border-[#e5e5e5] bg-white px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <p className="text-[11px] font-medium tracking-[0.16em] text-[#8a8a8a] uppercase">
            Studio
          </p>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {NAV.map((label, i) => (
              <motion.span
                key={label}
                initial={{ opacity: 0.28 }}
                animate={{ opacity: i === 1 ? 1 : 0.55 }}
                transition={{ delay: 0.08 * i, duration: 0.35, ease: EASE }}
                className={cn(
                  "text-[12px] tracking-tight",
                  i === 1 ? "font-medium text-[#141414]" : "text-[#8a8a8a]",
                )}
              >
                {label}
              </motion.span>
            ))}
          </div>
        </div>
        <span className="shrink-0 text-[11px] font-medium text-[#3665F3]">Live</span>
      </div>

      <div className="grid shrink-0 grid-cols-4 divide-x divide-[#e5e5e5] border-b border-[#e5e5e5] bg-white">
        {kpis.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 + i * 0.08, duration: 0.4, ease: EASE }}
            className="px-2.5 py-2.5 sm:px-3"
          >
            <p className="text-[10px] font-medium tracking-[0.12em] text-[#8a8a8a] uppercase">
              {kpi.label}
            </p>
            <p className="mt-0.5 text-[16px] font-medium tabular-nums tracking-tight text-[#141414] sm:text-[18px]">
              {kpi.value}
            </p>
          </motion.div>
        ))}
      </div>

      <div className="grid min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="min-h-0 overflow-y-auto border-b border-[#e5e5e5] bg-white lg:border-r lg:border-b-0">
          <p className="px-3 pt-2.5 text-[11px] font-medium tracking-[0.14em] text-[#8a8a8a] uppercase sm:px-4">
            Listings
          </p>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4, ease: EASE }}
            className="mx-3 mt-2 mb-3 flex items-center gap-3 border border-[#e5e5e5] bg-white p-2 sm:mx-4"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover}
              alt=""
              className="size-14 shrink-0 object-contain sm:size-16"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium tracking-tight text-[#141414]">
                {title}
              </p>
              <p className="mt-0.5 text-[12px] tabular-nums text-[#565959]">{price}</p>
              <p className="mt-1 text-[11px] text-[#8a8a8a]">5 stores · Live</p>
            </div>
          </motion.div>

          <div className="divide-y divide-[#eee]">
            {channels.map((channel, i) => (
              <motion.div
                key={channel.key}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.28 + i * 0.1, duration: 0.35, ease: EASE }}
                className="flex items-center gap-3 px-3 py-2.5 sm:px-4"
              >
                <div className="flex h-6 w-[88px] shrink-0 items-center">
                  {channel.mark}
                </div>
                <span className="min-w-0 flex-1 truncate text-[12px] text-[#565959]">
                  {channel.name}
                </span>
                <span className="text-[11px] font-medium text-[#3665F3]">Live</span>
                <span className="text-[12px] tabular-nums text-[#141414]">{price}</span>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto bg-white">
          <p className="px-3 pt-2.5 text-[11px] font-medium tracking-[0.14em] text-[#8a8a8a] uppercase sm:px-4">
            Activity
          </p>
          <div className="mt-1 divide-y divide-[#eee]">
            {feed.map((row, i) => (
              <motion.div
                key={row.text}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.36 + i * 0.12, duration: 0.35, ease: EASE }}
                className="flex items-baseline justify-between gap-3 px-3 py-2.5 sm:px-4"
              >
                <p className="min-w-0 truncate text-[13px] text-[#141414]">{row.text}</p>
                <p className="shrink-0 text-[11px] text-[#8a8a8a]">{row.when}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
