"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Heart, Search, ShoppingCart, Star } from "lucide-react";
import { displayNameFromEbayUsername } from "@/lib/ebay/store-display-name";
import { cn } from "@/lib/utils";

export function EbayWordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn("select-none font-bold tracking-tight", className)}
      aria-label="eBay"
    >
      <span style={{ color: "#E53238" }}>e</span>
      <span style={{ color: "#0064D2" }}>B</span>
      <span style={{ color: "#F5AF02" }}>a</span>
      <span style={{ color: "#86B817" }}>y</span>
    </span>
  );
}

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

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl bg-white font-sans text-[#191919] shadow-[0_12px_32px_-18px_rgba(0,0,0,0.5)] ring-1 ring-black/10",
        (compact || fill) && "h-full",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-[#e5e5e5] bg-white px-2.5 py-2">
        <EbayWordmark className={compact ? "text-[15px]" : "text-[18px]"} />
        <div className="flex min-w-0 flex-1 items-center gap-1 rounded-full border border-[#ccc] bg-[#f7f7f7] px-2.5 py-1 text-[11px] text-[#707070]">
          <Search className="size-3 shrink-0" strokeWidth={2} />
          <span className="truncate">Search eBay</span>
        </div>
        <ShoppingCart className="size-3.5 shrink-0 text-[#191919]" strokeWidth={1.8} />
      </div>

      <div
        className={cn(
          "relative bg-white",
          compact || fill ? "min-h-[160px] flex-1" : "aspect-square",
        )}
      >
        <AnimatePresence mode="wait">
          {live ? (
            // eslint-disable-next-line @next/next/no-img-element -- eBay listing photo
            <motion.img
              key={photoSrc}
              src={photoSrc}
              alt=""
              initial={{ y: -48, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 22 }}
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

      <div className={cn("shrink-0", compact ? "p-2.5" : "p-3")}>
        {!compact && !fill ? (
          <p className="mb-1 text-[10px] text-[#707070]">
            Home › Business & Industrial › Power Tools
          </p>
        ) : null}
        <motion.p
          initial={live ? { opacity: 0, y: 8 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.32 }}
          className={cn(
            "font-semibold leading-snug",
            compact ? "line-clamp-2 min-h-[32px] text-[12px]" : "line-clamp-2 text-[14px]",
            live ? "text-[#191919]" : "text-[#9b9b9b]",
          )}
        >
          {live ? title : "Your listing appears here on eBay"}
        </motion.p>
        <p className="mt-1 text-[11px] text-[#707070]">
          Condition: <span className="font-semibold text-[#191919]">New</span>
        </p>
        {live ? (
          <div className="mt-1">
            {dropping ? (
              <p className="text-[12px] font-semibold text-[#707070] line-through decoration-[#E53238] tabular-nums">
                US {was}
              </p>
            ) : null}
            <AnimatePresence mode="wait">
              <motion.p
                key={price}
                initial={{ y: 16, opacity: 0, scale: 0.88 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 420, damping: 22, delay: 0.18 }}
                className={cn(
                  "font-bold tabular-nums",
                  compact ? "text-[18px]" : "text-[22px]",
                  dropping ? "text-[#E53238]" : "text-[#191919]",
                )}
              >
                <span className="text-[12px] font-semibold">US </span>
                {price}
              </motion.p>
            </AnimatePresence>
          </div>
        ) : (
          <p
            className={cn(
              "mt-1 font-bold tabular-nums text-[#9b9b9b]",
              compact ? "text-[18px]" : "text-[22px]",
            )}
          >
            —
          </p>
        )}
        <p className="min-h-[16px] text-[11px] text-[#707070]">
          {live ? "Free shipping · Arrives in 3–5 days" : "Waiting for publish"}
        </p>

        <motion.div
          initial={live ? { opacity: 0, y: 10 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.32 }}
          className="mt-2.5 grid gap-1.5"
        >
          <div
            className={cn(
              "rounded-lg py-2 text-center text-[12px] font-bold",
              live
                ? "bg-[#3665F3] text-white"
                : "bg-[#e5e5e5] text-[#9b9b9b]",
            )}
          >
            {live ? "Buy It Now" : "Goes live next"}
          </div>
          <div
            className={cn(
              "rounded-lg border py-2 text-center text-[12px] font-bold",
              live
                ? "border-[#3665F3] text-[#3665F3]"
                : "border-[#e5e5e5] text-[#9b9b9b]",
            )}
          >
            Add to cart
          </div>
        </motion.div>

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
      </div>
    </div>
  );
}
