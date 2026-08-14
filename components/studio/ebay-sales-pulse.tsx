"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { LiveDot } from "@/components/ui/studio";
import { formatRelativeTime } from "@/lib/format-relative-time";
import type { SalesSnapshot } from "@/lib/ebay/sales-sync";

function usd(n: number) {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
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
          setSnap({
            syncedAt: new Date().toISOString(),
            connected: false,
            orders30d: 0,
            units30d: 0,
            revenue30d: 0,
            ordersToday: 0,
            revenueToday: 0,
            matchedToHiglou: 0,
            unmatchedEbaySales: 0,
            reflectedThisSync: 0,
            recent: [],
            opportunities: [],
            error: "Could not reach eBay sales",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const t = window.setInterval(() => void load(), 25_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  if (loading && !snap) {
    return (
      <div className="mb-8 h-40 animate-pulse rounded-[28px] bg-muted" />
    );
  }
  if (!snap) return null;

  const last = snap.recent[0];

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          <LiveDot tone={snap.connected && !snap.error ? "success" : "brand"} />
          eBay ↔ Higlou
        </p>
        <p className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <RefreshCw className="size-3" />
          {snap.error
            ? snap.error
            : `Synced ${formatRelativeTime(snap.syncedAt)}`}
        </p>
      </div>

      {snap.error ? (
        <Link
          href="/settings#ebay-store"
          className="mb-3 flex items-center justify-between rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950"
        >
          {snap.error}
          <ArrowRight className="size-4" />
        </Link>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="col-span-2 overflow-hidden rounded-[28px] bg-foreground p-5 text-background lg:col-span-2">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-background/50 uppercase">
            Last 30 days
          </p>
          <p className="mt-2 font-display text-4xl tracking-tight">
            {usd(snap.revenue30d)}
          </p>
          <p className="mt-1 text-[13px] text-background/60">
            {snap.orders30d} order{snap.orders30d === 1 ? "" : "s"} ·{" "}
            {snap.units30d} sold · {snap.matchedToHiglou} matched in Higlou
          </p>
        </div>
        <div className="rounded-[24px] border border-border/70 bg-surface p-4 shadow-[0_16px_40px_-32px_rgba(20,16,8,0.45)]">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Today
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {snap.ordersToday}
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {usd(snap.revenueToday)} today
          </p>
        </div>
        <div className="rounded-[24px] border border-border/70 bg-surface p-4 shadow-[0_16px_40px_-32px_rgba(20,16,8,0.45)]">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Last sale
          </p>
          {last ? (
            <>
              <p className="mt-2 line-clamp-2 text-[14px] font-semibold leading-snug">
                {last.title}
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {usd(last.amount)} · {formatRelativeTime(last.createdAt)}
                {last.higlouProductId ? " · in Higlou" : " · eBay only"}
              </p>
            </>
          ) : (
            <p className="mt-2 text-[13px] text-muted-foreground">
              No eBay sales in 30 days
            </p>
          )}
        </div>
      </div>

      {snap.recent.length > 0 ? (
        <div className="mt-3 overflow-hidden rounded-[24px] border border-border/70 bg-surface">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-[13px] font-semibold">Live orders</p>
            <p className="text-[11px] text-muted-foreground">
              {snap.reflectedThisSync
                ? `${snap.reflectedThisSync} marked sold in Higlou`
                : "Pulls every 25s"}
            </p>
          </div>
          <ul className="divide-y divide-border/60">
            {snap.recent.slice(0, 5).map((row) => (
              <li
                key={`${row.orderId}-${row.listingId}-${row.sku}`}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{row.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {row.qty} × {usd(row.amount)}
                    {row.higlouProductId ? " · synced" : " · not in Higlou"}
                  </p>
                </div>
                {row.listingId ? (
                  <a
                    href={`https://www.ebay.com/itm/${row.listingId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-[12px] font-medium underline-offset-2 hover:underline"
                  >
                    eBay
                  </a>
                ) : row.higlouProductId ? (
                  <Link
                    href={`/listings/${row.higlouProductId}`}
                    className="shrink-0 text-[12px] font-medium"
                  >
                    Open
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {snap.opportunities.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {snap.opportunities.slice(0, 4).map((op, i) => {
            const wide = i === 0;
            const card = (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="h-full rounded-[24px] border border-border/70 bg-surface p-4 shadow-[0_16px_40px_-32px_rgba(20,16,8,0.45)]"
              >
                <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  {op.kind === "draft"
                    ? "Opportunity"
                    : op.kind === "live_no_sales"
                      ? "Live, no sale"
                      : "eBay only"}
                </p>
                <p className="mt-2 line-clamp-2 text-[14px] font-semibold leading-snug">
                  {op.title}
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {op.detail}
                </p>
              </motion.div>
            );
            const span = wide ? "col-span-2" : undefined;
            if (!op.href) {
              return (
                <div key={op.id} className={span}>
                  {card}
                </div>
              );
            }
            if (op.href.startsWith("http")) {
              return (
                <a
                  key={op.id}
                  href={op.href}
                  target="_blank"
                  rel="noreferrer"
                  className={span}
                >
                  {card}
                </a>
              );
            }
            return (
              <Link key={op.id} href={op.href} className={span}>
                {card}
              </Link>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
