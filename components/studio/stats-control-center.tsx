"use client";

import { useState } from "react";
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
import type {
  InventoryLine,
  OfferMove,
  StockAlert,
} from "@/lib/ebay/sales-sync";

type Pane = "act" | "carts" | "listings" | "orders";

function Thumb({ src, title }: { src: string | null; title: string }) {
  return (
    <div className="relative size-12 shrink-0 overflow-hidden rounded-md border border-[#eee] bg-[#f7f7f7]">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-contain p-0.5" />
      ) : (
        <span className="grid size-full place-items-center text-[13px] font-semibold text-[#565959]">
          {(title.trim()[0] || "?").toUpperCase()}
        </span>
      )}
    </div>
  );
}

export function StatsControlCenter() {
  const { snap, loading, tick } = useEbaySales();
  const [pane, setPane] = useState<Pane | null>(null);

  if (loading && !snap) {
    return (
      <div className="mx-auto max-w-[1080px]">
        <div className="h-14 animate-pulse rounded-xl bg-[#f0f2f2]" />
        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[72px] animate-pulse rounded-xl border border-[#d5d9d9] bg-white"
            />
          ))}
        </div>
        <div className="mt-3 h-[320px] animate-pulse rounded-xl border border-[#d5d9d9] bg-white" />
      </div>
    );
  }
  if (!snap) return null;

  const live = snap.connected && !snap.error;
  const shop = snap.storeName?.trim() || "eBay store";
  const alertCount = snap.inventoryLow + snap.inventoryOut;
  const offerCount = snap.offerMoves.length;
  const active: Pane =
    pane ??
    (alertCount > 0 ? "act" : offerCount > 0 ? "carts" : "listings");

  return (
    <div className="mx-auto max-w-[1080px] pb-10">
      <header className="flex flex-wrap items-end justify-between gap-3 pb-4">
        <div>
          <p className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            <LiveDot tone={live ? "success" : "brand"} />
            Control center
          </p>
          <h1 className="mt-1 font-display text-3xl tracking-tight">Stats</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {shop} · tap a card · live every {SALES_POLL_MS / 1000}s
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

      <div className="relative mb-3 h-1 overflow-hidden rounded-full bg-[#f0f2f2]">
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
          className="mb-3 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950"
        >
          {snap.error}
          <ArrowRight className="size-4" />
        </Link>
      ) : null}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        <MetricCard
          active={active === "orders"}
          onClick={() => setPane("orders")}
          pulse
          label="Sales · 30 days"
          value={usd(snap.revenue30d)}
          hint={`${snap.orders30d} orders · ${snap.units30d} sold`}
        />
        <MetricCard
          active={active === "orders"}
          onClick={() => setPane("orders")}
          label="Today"
          value={`${snap.ordersToday}`}
          hint={`${usd(snap.revenueToday)} · avg ${usd(snap.avgOrder, true)}`}
        />
        <MetricCard
          active={active === "listings"}
          onClick={() => setPane("listings")}
          label="Live listings"
          value={String(snap.inventoryLive)}
          hint={`${snap.inventoryUnits} units · ${usd(snap.inventoryValue)}`}
        />
        <MetricCard
          active={active === "carts"}
          onClick={() => setPane("carts")}
          label="In cart / watching"
          value={String(snap.inCart)}
          hint="Buyers you can send an offer"
        />
        <MetricCard
          active={active === "carts"}
          onClick={() => setPane("carts")}
          label="Watchers"
          value={String(snap.watchers)}
          hint={`${offerCount} offer moves`}
        />
        <MetricCard
          active={active === "act"}
          onClick={() => setPane("act")}
          label="Stock alerts"
          value={String(alertCount)}
          hint={`${snap.inventoryLow} low · ${snap.inventoryOut} out`}
          warn={alertCount > 0}
        />
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-[#d5d9d9] bg-white">
        {active === "act" ? (
          <AlertPane alerts={snap.stockAlerts} />
        ) : active === "carts" ? (
          <OfferPane moves={snap.offerMoves} />
        ) : active === "listings" ? (
          <InventoryPane rows={snap.inventory} live={snap.inventoryLive} />
        ) : (
          <OrdersPane
            rows={snap.recent}
            empty={
              snap.recent.length === 0
                ? "No eBay orders in the last 30 days."
                : null
            }
          />
        )}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  pulse,
  active,
  warn,
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  pulse?: boolean;
  active?: boolean;
  warn?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-xl border bg-white px-4 py-3 text-left shadow-[0_1px_2px_rgba(15,17,17,0.06)] transition",
        active ? "border-[#0f1111]" : "border-[#d5d9d9] hover:border-[#bbb]",
      )}
    >
      {pulse ? (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-0.5 bg-brand [animation:higlou-scan_2.4s_ease-in-out_infinite]"
        />
      ) : null}
      <p className="text-[11px] font-medium tracking-[0.12em] text-[#565959] uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-[22px] font-semibold tabular-nums tracking-tight",
          warn ? "text-amber-700" : "text-[#0f1111]",
        )}
      >
        {value}
      </p>
      <p className="text-[12px] text-[#565959]">{hint}</p>
    </button>
  );
}

function PaneHead({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[#eee] px-4 py-2.5">
      <p className="text-[13px] font-semibold text-[#0f1111]">{title}</p>
      <p className="text-[11px] text-[#565959]">{hint}</p>
    </div>
  );
}

function AlertPane({ alerts }: { alerts: StockAlert[] }) {
  if (alerts.length === 0) {
    return (
      <>
        <PaneHead title="Stock alerts" hint="Only real problems" />
        <p className="px-4 py-8 text-[13px] text-[#565959]">
          No stock problems. Qty 1 on a one-of-one listing is normal, not an
          alert.
        </p>
      </>
    );
  }
  return (
    <>
      <PaneHead
        title="Stock alerts"
        hint="What it is · how to fix it"
      />
      <ul className="max-h-[min(52vh,380px)] divide-y divide-[#eee] overflow-y-auto">
        {alerts.map((row) => (
          <li key={`${row.kind}-${row.listingId}`}>
            <a
              href={row.href}
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-3 px-4 py-2.5 hover:bg-[#f7f7f7]"
            >
              <Thumb src={row.pictureUrl} title={row.title} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-[#0f1111]">
                  {row.title}
                </p>
                <p
                  className={cn(
                    "text-[12px] font-medium",
                    row.kind === "out" ? "text-red-600" : "text-amber-700",
                  )}
                >
                  {row.why}
                </p>
                <p className="text-[12px] text-[#565959]">Fix: {row.fix}</p>
              </div>
              <ArrowRight className="mt-1 size-4 shrink-0 text-[#565959]" />
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

function OfferPane({ moves }: { moves: OfferMove[] }) {
  if (moves.length === 0) {
    return (
      <>
        <PaneHead title="Carts & offers" hint="Live from eBay" />
        <p className="px-4 py-8 text-[13px] text-[#565959]">
          Nobody has these in a cart or sent a Best Offer right now. When they
          do, Higlou shows the discount you can send.
        </p>
      </>
    );
  }
  return (
    <>
      <PaneHead
        title="Carts & offers"
        hint="In cart, watching, or Best Offer"
      />
      <ul className="max-h-[min(52vh,380px)] divide-y divide-[#eee] overflow-y-auto">
        {moves.map((row) => (
          <li key={`${row.kind}-${row.listingId}`}>
            <a
              href={row.href}
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-3 px-4 py-2.5 hover:bg-[#f7f7f7]"
            >
              <Thumb src={row.pictureUrl} title={row.title} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-[#0f1111]">
                  {row.title}
                </p>
                <p className="text-[12px] text-[#565959]">{row.why}</p>
                {row.kind === "in_cart" && row.suggestedPrice != null ? (
                  <p className="text-[12px] font-medium text-[#0f1111]">
                    Offer you can send: {usd(row.suggestedPrice, true)} (
                    {row.suggestedOffPct}% off
                    {row.price != null ? ` ${usd(row.price, true)}` : ""})
                  </p>
                ) : (
                  <p className="text-[12px] font-medium text-[#0f1111]">
                    Open eBay to accept or counter.
                  </p>
                )}
              </div>
              <ArrowRight className="mt-1 size-4 shrink-0 text-[#565959]" />
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

function InventoryPane({
  rows,
  live,
}: {
  rows: InventoryLine[];
  live: number;
}) {
  if (rows.length === 0) {
    return (
      <>
        <PaneHead title="Inventory" hint={`${live} live`} />
        <p className="px-4 py-8 text-[13px] text-[#565959]">
          No active eBay listings found yet.
        </p>
      </>
    );
  }
  return (
    <>
      <PaneHead title="Inventory" hint={`${live} live · photos from eBay`} />
      <ul className="max-h-[min(52vh,380px)] divide-y divide-[#eee] overflow-y-auto">
        {rows.map((row) => (
          <li
            key={`${row.sku}-${row.listingId}`}
            className="flex items-center gap-3 px-4 py-2.5"
          >
            <Thumb src={row.pictureUrl} title={row.title} />
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
                    : row.listedQty > 1 && row.qty === 1
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
    </>
  );
}

function OrdersPane({
  rows,
  empty,
}: {
  rows: Array<{
    orderId: string;
    listingId: string;
    sku: string;
    title: string;
    qty: number;
    createdAt: string;
    buyer: string;
    amount: number;
  }>;
  empty: string | null;
}) {
  return (
    <>
      <PaneHead title="Orders" hint="Last 30 days" />
      {empty ? (
        <p className="px-4 py-8 text-[13px] text-[#565959]">{empty}</p>
      ) : (
        <ul className="max-h-[min(52vh,380px)] divide-y divide-[#eee] overflow-y-auto">
          {rows.map((row) => (
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
    </>
  );
}
