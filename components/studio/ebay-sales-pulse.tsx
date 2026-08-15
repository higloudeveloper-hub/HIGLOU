"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { LiveDot } from "@/components/ui/studio";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { usd, useEbaySales } from "@/lib/studio/use-ebay-sales";
import { cn } from "@/lib/utils";

/** Compact Home teaser — full live board lives on /stats. */
export function EbaySalesPulse({ className }: { className?: string }) {
  const { snap, loading, tick } = useEbaySales();

  if (loading && !snap) {
    return (
      <div className="h-[76px] animate-pulse rounded-xl border border-[#d5d9d9] bg-white" />
    );
  }
  if (!snap) return null;

  const live = snap.connected && !snap.error;
  const shop = snap.storeName?.trim() || "eBay store";
  const alerts = snap.inventoryLow + snap.inventoryOut;

  return (
    <Link
      href="/stats"
      className={cn(
        "group block overflow-hidden rounded-xl border border-[#d5d9d9] bg-white shadow-[0_1px_2px_rgba(15,17,17,0.06)] transition hover:border-[#bbb]",
        className,
      )}
    >
      <div className="flex min-h-[72px] items-center gap-4 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-[#565959] uppercase">
            <LiveDot tone={live ? "success" : "brand"} />
            Live store
          </p>
          <p className="truncate text-[16px] font-semibold tracking-tight text-[#0f1111]">
            {shop}
          </p>
        </div>

        <div className="hidden items-center gap-6 sm:flex">
          <TeaserStat
            label="30 days"
            value={usd(snap.revenue30d)}
            hint={`${snap.orders30d} orders`}
          />
          <TeaserStat
            label="In cart"
            value={String(snap.inCart)}
            hint={snap.inCart ? "send an offer" : "none waiting"}
          />
          <TeaserStat
            label="Alerts"
            value={String(alerts)}
            hint={alerts ? "needs a look" : "stock ok"}
            warn={alerts > 0}
          />
        </div>

        <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-[#565959] group-hover:text-[#0f1111]">
          <RefreshCw
            className={cn(
              "size-3",
              live && "animate-spin [animation-duration:3s]",
            )}
          />
          <span className="hidden md:inline">
            {snap.error ? "Fix" : formatRelativeTime(snap.syncedAt)}
          </span>
          <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
        </span>
      </div>
      <div className="relative h-0.5 overflow-hidden bg-[#f0f2f2]">
        <motion.span
          key={tick}
          className="absolute inset-y-0 w-1/3 rounded-full bg-brand"
          initial={{ left: "-30%" }}
          animate={{ left: "100%" }}
          transition={{ duration: 1.1, ease: "easeOut" }}
        />
      </div>
    </Link>
  );
}

function TeaserStat({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint: string;
  warn?: boolean;
}) {
  return (
    <div className="min-w-[4.5rem] text-right">
      <p className="text-[10px] font-medium tracking-[0.12em] text-[#565959] uppercase">
        {label}
      </p>
      <p
        className={cn(
          "text-[18px] font-semibold tabular-nums tracking-tight",
          warn ? "text-amber-700" : "text-[#0f1111]",
        )}
      >
        {value}
      </p>
      <p className="text-[11px] text-[#565959]">{hint}</p>
    </div>
  );
}
