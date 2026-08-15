"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { LiveDot } from "@/components/ui/studio";
import { formatRelativeTime } from "@/lib/format-relative-time";
import {
  emptySalesSnapshot,
  type SalesSnapshot,
} from "@/lib/ebay/sales-sync";
import { cn } from "@/lib/utils";

const POLL_MS = 12_000;

function usd(n: number, cents = false) {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  })}`;
}

function Metric({
  label,
  value,
  hint,
  pulse,
}: {
  label: string;
  value: string;
  hint: string;
  pulse?: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[#d5d9d9] bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(15,17,17,0.06)]">
      {pulse ? (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-0.5 bg-brand [animation:higlou-scan_2.4s_ease-in-out_infinite]"
        />
      ) : null}
      <p className="text-[11px] font-medium tracking-[0.12em] text-[#565959] uppercase">
        {label}
      </p>
      <motion.p
        key={value}
        initial={{ opacity: 0.45, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-1 text-[24px] font-semibold tabular-nums tracking-tight text-[#0f1111]"
      >
        {value}
      </motion.p>
      <p className="mt-0.5 text-[12px] text-[#565959]">{hint}</p>
    </div>
  );
}

export function EbaySalesPulse() {
  const [snap, setSnap] = useState<SalesSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/ebay/sales", { cache: "no-store" });
        const body = (await res.json()) as SalesSnapshot;
        if (!cancelled) {
          setSnap(body);
          setTick((n) => n + 1);
        }
      } catch {
        if (!cancelled) {
          setSnap(emptySalesSnapshot({ error: "Could not reach eBay sales" }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const t = window.setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  if (loading && !snap) {
    return (
      <section className="mb-10 min-h-[560px]">
        <div className="h-[72px] animate-pulse rounded-xl border border-[#d5d9d9] bg-white" />
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[92px] animate-pulse rounded-xl border border-[#d5d9d9] bg-white"
            />
          ))}
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="h-[280px] animate-pulse rounded-xl border border-[#d5d9d9] bg-white" />
          <div className="h-[280px] animate-pulse rounded-xl border border-[#d5d9d9] bg-white" />
        </div>
      </section>
    );
  }
  if (!snap) return null;

  const live = snap.connected && !snap.error;
  const shop = snap.storeName?.trim() || "eBay store";

  return (
    <section className="mb-10 min-h-[560px]">
      <div className="mb-3 overflow-hidden rounded-xl border border-[#d5d9d9] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-[#565959] uppercase">
              <LiveDot tone={live ? "success" : "brand"} />
              Live store
            </p>
            <p className="truncate text-[18px] font-semibold tracking-tight text-[#0f1111]">
              {shop}
            </p>
          </div>
          <p className="inline-flex items-center gap-1.5 text-[12px] text-[#565959]">
            <RefreshCw className={cn("size-3", live && "animate-spin [animation-duration:3s]")} />
            {snap.error
              ? snap.error
              : `eBay · ${formatRelativeTime(snap.syncedAt)}`}
          </p>
        </div>
        <div className="relative h-1 overflow-hidden bg-[#f0f2f2]">
          <motion.span
            key={tick}
            className="absolute inset-y-0 w-1/3 rounded-full bg-brand"
            initial={{ left: "-30%" }}
            animate={{ left: "100%" }}
            transition={{ duration: 1.1, ease: "easeOut" }}
          />
        </div>
      </div>

      {snap.error ? (
        <Link
          href="/settings#ebay-store"
          className="mb-3 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950"
        >
          {snap.error}
          <ArrowRight className="size-4" />
        </Link>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Metric
          pulse
          label="Sales · 30 days"
          value={usd(snap.revenue30d)}
          hint={`${snap.orders30d} orders · ${snap.units30d} sold`}
        />
        <Metric
          label="Today"
          value={`${snap.ordersToday}`}
          hint={`${usd(snap.revenueToday)} · avg ${usd(snap.avgOrder, true)}`}
        />
        <Metric
          label="Live listings"
          value={String(snap.inventoryLive)}
          hint={`${snap.inventoryUnits} units on eBay`}
        />
        <Metric
          label="Inventory value"
          value={usd(snap.inventoryValue)}
          hint="Price × available qty"
        />
        <Metric
          label="Watchers"
          value={String(snap.watchers)}
          hint="People watching live items"
        />
        <Metric
          label="Stock alerts"
          value={String(snap.inventoryLow + snap.inventoryOut)}
          hint={`${snap.inventoryLow} low · ${snap.inventoryOut} out`}
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-[#d5d9d9] bg-white">
          <div className="flex items-center justify-between border-b border-[#eee] px-4 py-2.5">
            <p className="text-[13px] font-semibold text-[#0f1111]">Inventory</p>
            <p className="text-[11px] text-[#565959]">
              {snap.inventoryLive} live · qty from eBay
            </p>
          </div>
          {snap.inventory.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-[#565959]">
              No active eBay listings found yet.
            </p>
          ) : (
            <ul className="divide-y divide-[#eee]">
              {snap.inventory.slice(0, 8).map((row) => (
                <li
                  key={`${row.sku}-${row.listingId}`}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <div className="relative size-11 shrink-0 overflow-hidden rounded-md border border-[#eee] bg-[#f7f7f7]">
                    {row.pictureUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.pictureUrl}
                        alt=""
                        className="size-full object-contain p-0.5"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    {row.listingId ? (
                      <a
                        href={`https://www.ebay.com/itm/${row.listingId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-[13px] font-medium text-[#0f1111] hover:text-[#2162a1] hover:underline"
                      >
                        {row.title}
                      </a>
                    ) : (
                      <p className="truncate text-[13px] font-medium text-[#0f1111]">
                        {row.title}
                      </p>
                    )}
                    <p className="text-[11px] text-[#565959]">
                      {row.price != null ? usd(row.price, true) : "—"}
                      {row.watchers ? ` · ${row.watchers} watching` : ""}
                      {row.soldQty ? ` · ${row.soldQty} sold` : ""}
                    </p>
                  </div>
                  <div className="w-12 shrink-0 text-right">
                    <p className="text-[10px] font-medium tracking-wide text-[#565959] uppercase">
                      Qty
                    </p>
                    <p
                      className={cn(
                        "text-[15px] font-semibold tabular-nums",
                        row.qty <= 0
                          ? "text-red-600"
                          : row.qty <= 1
                            ? "text-amber-700"
                            : "text-[#0f1111]",
                      )}
                    >
                      {row.qty}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-[#d5d9d9] bg-white">
          <div className="flex items-center justify-between border-b border-[#eee] px-4 py-2.5">
            <p className="text-[13px] font-semibold text-[#0f1111]">Orders</p>
            <p className="text-[11px] text-[#565959]">
              Last 30 days · refresh {POLL_MS / 1000}s
            </p>
          </div>
          {snap.recent.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-[#565959]">
              No eBay orders in the last 30 days.
            </p>
          ) : (
            <ul className="divide-y divide-[#eee]">
              {snap.recent.slice(0, 8).map((row) => (
                <li
                  key={`${row.orderId}-${row.listingId}-${row.sku}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-[#0f1111]">
                      {row.title}
                    </p>
                    <p className="text-[11px] text-[#565959]">
                      {row.qty} sold · {formatRelativeTime(row.createdAt)}
                      {row.buyer ? ` · ${row.buyer}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[14px] font-semibold tabular-nums text-[#0f1111]">
                      {usd(row.amount, true)}
                    </p>
                    {row.listingId ? (
                      <a
                        href={`https://www.ebay.com/itm/${row.listingId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-[#2162a1] hover:underline"
                      >
                        eBay
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
