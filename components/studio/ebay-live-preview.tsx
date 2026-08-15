"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Heart, Search, ShoppingCart, Star } from "lucide-react";
import { displayNameFromEbayUsername } from "@/lib/ebay/store-display-name";
import { cn } from "@/lib/utils";

export { EbayMark as EbayWordmark } from "@/components/brand/store-marks";
import { EbayMark } from "@/components/brand/store-marks";

export function useConnectedEbayStoreName(passed?: string | null) {
  const [connected, setConnected] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/ebay/store-name");
        if (!res.ok) return;
        const body = (await res.json()) as {
          storeName?: string | null;
          username?: string | null;
        };
        const resolved =
          body.storeName?.trim() ||
          (body.username ? displayNameFromEbayUsername(body.username) : "");
        if (!cancelled && resolved) setConnected(resolved);
      } catch {
        /* keep passed name */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fromProp = passed?.trim() || "";
  const generic =
    !fromProp ||
    /^your eBay store$/i.test(fromProp) ||
    /^your store$/i.test(fromProp);
  return connected || (generic ? "" : fromProp) || "your eBay store";
}

export function EbayLivePreview({
  photoSrc,
  title,
  priceLabel,
  storeName,
  live,
  compact = false,
  fill = false,
  className,
  compareAtLabel,
}: {
  photoSrc: string;
  title: string;
  priceLabel: string;
  storeName: string;
  live: boolean;
  compact?: boolean;
  fill?: boolean;
  className?: string;
  compareAtLabel?: string | null;
}) {
  const shop = useConnectedEbayStoreName(storeName);
  const price = live ? priceLabel.replace(/^US\s*/i, "") : "—";
  const was = compareAtLabel?.replace(/^US\s*/i, "") || "";
  const dropping = Boolean(live && was && was !== price);
  const tight = compact || fill;

  return (
    <div
      className={cn(
        "min-h-0 bg-white font-sans text-[#191919] shadow-[0_12px_32px_-18px_rgba(0,0,0,0.5)] ring-1 ring-black/10",
        tight
          ? "grid h-full min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-none"
          : "flex flex-col overflow-hidden rounded-xl",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-1.5 border-b border-[#e5e5e5] bg-white px-2 py-1">
        <EbayMark className={tight ? "h-4" : "h-5"} />
        {tight ? (
          <div className="flex min-w-0 flex-1 overflow-hidden rounded-sm border border-[#ccc]">
            <span className="min-w-0 flex-1 truncate bg-white px-2 py-0.5 text-[10px] text-[#707070]">
              Search for anything
            </span>
            <span className="grid w-7 shrink-0 place-items-center bg-[#3665F3] text-white">
              <Search className="size-3" strokeWidth={2.4} />
            </span>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1 rounded-full border border-[#ccc] bg-[#f7f7f7] px-2 py-0.5 text-[11px] text-[#707070]">
            <Search className="size-3 shrink-0" strokeWidth={2} />
            <span className="truncate">Search eBay</span>
          </div>
        )}
        <ShoppingCart className="size-3.5 shrink-0 text-[#191919]" strokeWidth={1.8} />
      </div>

      <div
        className={cn(
          "relative min-h-0 overflow-hidden bg-white",
          tight ? "h-full" : "aspect-square",
        )}
      >
        <AnimatePresence mode="wait">
          {live ? (
            // eslint-disable-next-line @next/next/no-img-element -- eBay listing photo
            <motion.img
              key={photoSrc}
              src={photoSrc}
              alt=""
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 size-full object-contain p-3"
            />
          ) : (
            <motion.div
              key="wait"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 grid place-items-center bg-[#f7f7f7]"
            >
              <p className="text-[11px] font-medium text-[#707070]">
                Uploading to eBay…
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        {live ? (
          <div className="pointer-events-none absolute bottom-1.5 left-1.5">
            <EbayMark className="h-4" />
          </div>
        ) : null}
        {live && !tight ? (
          <button
            type="button"
            tabIndex={-1}
            className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-white/90 text-[#191919] shadow-sm ring-1 ring-black/10"
            aria-hidden
          >
            <Heart className="size-3.5" strokeWidth={1.8} />
          </button>
        ) : null}
      </div>

      <div className={cn("shrink-0", tight ? "px-2 pt-1 pb-2" : "p-3")}>
        {!tight ? (
          <p className="mb-1 text-[10px] text-[#707070]">
            Home › Business & Industrial › Power Tools
          </p>
        ) : null}
        <motion.p
          initial={live ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.06, duration: 0.18 }}
          className={cn(
            "font-semibold leading-snug",
            tight
              ? "line-clamp-1 text-[12px]"
              : "line-clamp-2 text-[14px]",
            live ? "text-[#191919]" : "text-[#9b9b9b]",
          )}
        >
          {live ? title : "Your listing appears here on eBay"}
        </motion.p>
        {!tight ? (
          <p className="mt-1 text-[11px] text-[#707070]">
            Condition: <span className="font-semibold text-[#191919]">New</span>
          </p>
        ) : live ? (
          <p className="text-[10px] text-[#707070]">
            Condition: <span className="font-semibold text-[#191919]">New</span>
            <span className="mx-1 text-[#cfcfcf]">·</span>
            Free shipping
          </p>
        ) : null}
        {live ? (
          <div className="mt-0.5">
            {dropping ? (
              <p className="text-[12px] font-semibold text-[#707070] line-through decoration-[#E53238] tabular-nums">
                US {was}
              </p>
            ) : null}
            <AnimatePresence mode="wait">
              <motion.p
                key={price}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.16, delay: 0.08 }}
                className={cn(
                  "font-bold tabular-nums",
                  tight ? "text-[15px]" : "text-[22px]",
                  dropping ? "text-[#E53238]" : "text-[#191919]",
                )}
              >
                <span className="text-[11px] font-semibold">US </span>
                {price}
              </motion.p>
            </AnimatePresence>
          </div>
        ) : (
          <p
            className={cn(
              "mt-0.5 font-bold tabular-nums text-[#9b9b9b]",
              tight ? "text-[15px]" : "text-[22px]",
            )}
          >
            —
          </p>
        )}
        {tight ? null : (
          <p className="min-h-[16px] text-[11px] text-[#707070]">
            {live ? "Free shipping · Arrives in 3–5 days" : "Waiting for publish"}
          </p>
        )}

        <div
          className={cn(
            "mt-1 grid gap-1",
            tight ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          <div
            className={cn(
              "grid h-7 place-items-center rounded-lg text-center text-[10px] font-bold whitespace-nowrap",
              !tight && "h-9 text-[12px]",
              live
                ? "bg-[#3665F3] text-white"
                : "bg-[#e5e5e5] text-[#9b9b9b]",
            )}
          >
            {live ? "Buy It Now" : tight ? "Soon" : "Goes live next"}
          </div>
          <div
            className={cn(
              "grid h-7 place-items-center rounded-lg border text-center text-[10px] font-bold whitespace-nowrap",
              !tight && "h-9 text-[12px]",
              live
                ? "border-[#3665F3] text-[#3665F3]"
                : "border-[#e5e5e5] text-[#9b9b9b]",
            )}
          >
            Add to cart
          </div>
        </div>

        {tight ? null : (
        <div className="mt-2.5 flex items-center gap-2 border-t border-[#e5e5e5] pt-2.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#191919] text-[9px] font-bold text-white">
            {shop.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-semibold">{shop}</p>
            <p className="flex items-center gap-1 text-[10px] text-[#707070]">
              <Star className="size-2.5 fill-[#F5AF02] text-[#F5AF02]" />
              {live ? "99.8% positive · Top Rated Seller" : "Connected eBay store"}
            </p>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
