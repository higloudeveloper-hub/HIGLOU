"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { LiveDot } from "@/components/ui/studio";
import { formatRelativeTime } from "@/lib/format-relative-time";
import {
  SALES_POLL_MS,
  usd,
  useEbaySales,
} from "@/lib/studio/use-ebay-sales";
import { cn } from "@/lib/utils";
import type { InventoryLine, SalesOpportunity } from "@/lib/ebay/sales-sync";

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

function qtyClass(qty: number) {
  if (qty <= 0) return "text-red-600";
  if (qty <= 1) return "text-amber-700";
  return "text-[#0f1111]";
}

function opportunityLabel(kind: SalesOpportunity["kind"]) {
  if (kind === "draft") return "Draft";
  if (kind === "live_no_sales") return "No sales";
  return "eBay only";
}

export function StatsControlCenter() {
  const { snap, loading, tick } = useEbaySales();

  if (loading && !snap) {
    return (
      <div className="mx-auto max-w-[1080px]">
        <div className="h-16 animate-pulse rounded-xl bg-[#f0f2f2]" />
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[92px] animate-pulse rounded-xl border border-[#d5d9d9] bg-white"
            />
          ))}
        </div>
      </div>
    );
  }
  if (!snap) return null;

  const live = snap.connected && !snap.error;
  const shop = snap.storeName?.trim() || "eBay store";
  const alerts = snap.inventory.filter((row) => row.qty <= 1);

  return (
    <div className="mx-auto max-w-[1080px] pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
        <div>
          <p className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            <LiveDot tone={live ? "success" : "brand"} />
            Control center
          </p>
          <h1 className="mt-1 font-display text-4xl tracking-tight">Stats</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {shop} · live from eBay every {SALES_POLL_MS / 1000}s
          </p>
        </div>
        <p className="inline-flex items-center gap-1.5 text-[12px] text-[#565959]">
          <RefreshCw
            className={cn(
              "size-3",
              live && "animate-spin [animation-duration:3s]",
            )}
          />
          {snap.error ? snap.error : formatRelativeTime(snap.syncedAt)}
        </p>
      </header>

      <div className="relative mb-4 h-1 overflow-hidden rounded-full bg-[#f0f2f2]">
        <motion.span
          key={tick}
          className="absolute inset-y-0 w-1/3 rounded-full bg-brand"
          initial={{ left: "-30%" }}
          animate={{ left: "100%" }}
          transition={{ duration: 1.1, ease: "easeOut" }}
        />
      </div>

      {snap.error ? (
        <Link
          href="/settings#ebay-store"
          className="mb-4 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950"
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

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <Panel
          title="Inventory"
          hint={`${snap.inventoryLive} live · qty from eBay`}
          empty={
            snap.inventory.length === 0
              ? "No active eBay listings found yet."
              : null
          }
        >
          {snap.inventory.map((row) => (
            <InventoryRow key={`${row.sku}-${row.listingId}`} row={row} />
          ))}
        </Panel>

        <Panel
          title="Orders"
          hint="Last 30 days"
          empty={
            snap.recent.length === 0
              ? "No eBay orders in the last 30 days."
              : null
          }
        >
          {snap.recent.map((row) => (
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
        </Panel>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <Panel
          title="Stock alerts"
          hint="Low or out"
          empty={alerts.length === 0 ? "No low-stock items right now." : null}
        >
          {alerts.map((row) => (
            <InventoryRow key={`alert-${row.listingId}`} row={row} />
          ))}
        </Panel>

        <Panel
          title="Needs a look"
          hint="Higlou vs eBay"
          empty={
            snap.opportunities.length === 0
              ? "Nothing waiting — store and drafts look aligned."
              : null
          }
        >
          {snap.opportunities.map((row) => {
            const inner = (
              <>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-[#0f1111]">
                    {row.title}
                  </p>
                  <p className="text-[11px] text-[#565959]">{row.detail}</p>
                </div>
                <span className="shrink-0 text-[11px] font-medium text-[#565959]">
                  {opportunityLabel(row.kind)}
                </span>
              </>
            );
            return row.href ? (
              <li key={row.id}>
                <Link
                  href={row.href}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-[#f7f7f7]"
                >
                  {inner}
                </Link>
              </li>
            ) : (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                {inner}
              </li>
            );
          })}
        </Panel>
      </div>
    </div>
  );
}

function Panel({
  title,
  hint,
  empty,
  children,
}: {
  title: string;
  hint: string;
  empty: string | null;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#d5d9d9] bg-white">
      <div className="flex items-center justify-between border-b border-[#eee] px-4 py-2.5">
        <p className="text-[13px] font-semibold text-[#0f1111]">{title}</p>
        <p className="text-[11px] text-[#565959]">{hint}</p>
      </div>
      {empty ? (
        <p className="px-4 py-6 text-[13px] text-[#565959]">{empty}</p>
      ) : (
        <ul className="divide-y divide-[#eee]">{children}</ul>
      )}
    </div>
  );
}

function InventoryRow({ row }: { row: InventoryLine }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
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
        <p className={cn("text-[15px] font-semibold tabular-nums", qtyClass(row.qty))}>
          {row.qty}
        </p>
      </div>
    </li>
  );
}
