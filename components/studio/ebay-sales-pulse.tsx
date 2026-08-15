"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw } from "lucide-react";
import { LiveDot } from "@/components/ui/studio";
import { formatRelativeTime } from "@/lib/format-relative-time";
import {
  emptySalesSnapshot,
  type SalesSnapshot,
} from "@/lib/ebay/sales-sync";
import { cn } from "@/lib/utils";

function usd(n: number) {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-[#d5d9d9] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,17,17,0.06)]">
      <p className="text-[11px] font-medium tracking-wide text-[#565959] uppercase">
        {label}
      </p>
      <p className="mt-1 text-[22px] font-semibold tabular-nums tracking-tight text-[#0f1111]">
        {value}
      </p>
      <p className="mt-0.5 text-[12px] text-[#565959]">{hint}</p>
    </div>
  );
}

export function EbaySalesPulse() {
  const [snap, setSnap] = useState<SalesSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/ebay/sales", { cache: "no-store" });
        const body = (await res.json()) as SalesSnapshot;
        if (!cancelled) setSnap(body);
      } catch {
        if (!cancelled) {
          setSnap(
            emptySalesSnapshot({ error: "Could not reach eBay sales" }),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const t = window.setInterval(() => void load(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  if (loading && !snap) {
    return (
      <div className="mb-8 h-40 animate-pulse rounded-xl border border-[#eee] bg-[#f7f7f7]" />
    );
  }
  if (!snap) return null;

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          <LiveDot tone={snap.connected && !snap.error ? "success" : "brand"} />
          Live store
        </p>
        <p className="inline-flex items-center gap-1.5 text-[12px] text-[#565959]">
          <RefreshCw className="size-3" />
          {snap.error
            ? snap.error
            : `Updated ${formatRelativeTime(snap.syncedAt)}`}
        </p>
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label="Sales · 30 days"
          value={usd(snap.revenue30d)}
          hint={`${snap.orders30d} orders · ${snap.units30d} sold`}
        />
        <Metric
          label="Today"
          value={String(snap.ordersToday)}
          hint={`${usd(snap.revenueToday)} today`}
        />
        <Metric
          label="Live inventory"
          value={String(snap.inventoryLive)}
          hint={`${snap.inventoryUnits} units on eBay`}
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
            <p className="text-[11px] text-[#565959]">eBay available qty</p>
          </div>
          {snap.inventory.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-[#565959]">
              No live inventory yet. Publish a listing and it shows here.
            </p>
          ) : (
            <ul className="divide-y divide-[#eee]">
              {snap.inventory.slice(0, 8).map((row) => (
                <li
                  key={`${row.sku}-${row.listingId}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-[#0f1111]">
                      {row.title}
                    </p>
                    <p className="text-[11px] text-[#565959]">
                      {row.sku || "No SKU"} · {row.status.toLowerCase()}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        "text-[14px] font-semibold tabular-nums",
                        row.qty <= 0
                          ? "text-red-600"
                          : row.qty <= 1
                            ? "text-amber-700"
                            : "text-[#0f1111]",
                      )}
                    >
                      {row.qty}
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
                    ) : row.higlouProductId ? (
                      <Link
                        href={`/listings/${row.higlouProductId}`}
                        className="text-[11px] text-[#2162a1]"
                      >
                        Open
                      </Link>
                    ) : null}
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
              {snap.reflectedThisSync
                ? `${snap.reflectedThisSync} marked sold in Higlou`
                : "Pulls every 20s"}
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
                      {row.qty} × {usd(row.amount)} ·{" "}
                      {formatRelativeTime(row.createdAt)}
                      {row.higlouProductId ? " · in Higlou" : ""}
                    </p>
                  </div>
                  {row.listingId ? (
                    <a
                      href={`https://www.ebay.com/itm/${row.listingId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-[12px] text-[#2162a1] hover:underline"
                    >
                      eBay
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
