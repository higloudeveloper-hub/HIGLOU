"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
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

function Photo({
  src,
  title,
  className,
}: {
  src: string | null;
  title: string;
  className?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden bg-white", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="size-full object-contain p-6"
        />
      ) : (
        <span className="grid size-full place-items-center text-[28px] font-semibold text-zinc-300">
          {(title.trim()[0] || "?").toUpperCase()}
        </span>
      )}
    </div>
  );
}

export function StatsControlCenter() {
  const { snap, loading } = useEbaySales();
  const [pane, setPane] = useState<Pane | null>(null);

  if (loading && !snap) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 pt-4">
        <div className="h-16 w-48 animate-pulse rounded-2xl bg-zinc-100" />
        <div className="h-44 animate-pulse rounded-[28px] bg-zinc-100" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-[28px] bg-zinc-100" />
          ))}
        </div>
      </div>
    );
  }
  if (!snap) return null;

  const shop = snap.storeName?.trim() || "eBay store";
  const alertCount = snap.inventoryLow + snap.inventoryOut;
  const watching = snap.inventory.filter((row) => row.watchers > 0).slice(0, 9);
  const active: Pane =
    pane ??
    (snap.inCart > 0 || Boolean(snap.cartError)
      ? "carts"
      : alertCount > 0
        ? "act"
        : watching.length > 0
          ? "carts"
          : "listings");

  const detailTitle =
    active === "orders"
      ? "Orders"
      : active === "listings"
        ? "Live listings"
        : active === "act"
          ? "Stock alerts"
          : snap.inCart > 0
            ? "In cart"
            : "Watching";

  return (
    <div className="mx-auto max-w-5xl pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4 pt-2 pb-10">
        <div>
          <p className="text-[13px] font-medium text-zinc-500">
            {shop}
            <span className="mx-2 text-zinc-300">·</span>
            Live every {SALES_POLL_MS / 1000}s
          </p>
          <h1 className="mt-1 font-display text-[52px] leading-none tracking-tight text-zinc-950">
            Stats
          </h1>
        </div>
        <p className="text-[13px] text-zinc-500">
          {snap.error ? snap.error : `Updated ${formatRelativeTime(snap.syncedAt)}`}
        </p>
      </header>

      {snap.error ? (
        <Link
          href="/settings#ebay-store"
          className="mb-8 flex items-center justify-between rounded-2xl bg-amber-50 px-5 py-4 text-[15px] text-amber-950"
        >
          {snap.error}
          <ArrowRight className="size-4" />
        </Link>
      ) : null}

      <button
        type="button"
        onClick={() => setPane("orders")}
        className={cn(
          "mb-4 w-full rounded-[32px] bg-white px-8 py-8 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_40px_rgba(0,0,0,0.06)] transition",
          active === "orders" && "ring-2 ring-zinc-950/10",
        )}
      >
        <p className="text-[13px] font-medium text-zinc-500">Sales · 30 days</p>
        <motion.p
          key={snap.revenue30d}
          initial={{ opacity: 0.7, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 font-display text-[64px] leading-none tracking-tight text-zinc-950"
        >
          {usd(snap.revenue30d)}
        </motion.p>
        <p className="mt-4 text-[15px] text-zinc-500">
          {snap.orders30d} orders · {snap.units30d} sold · avg{" "}
          {usd(snap.avgOrder, true)}
        </p>
      </button>

      <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric
          active={active === "orders"}
          onClick={() => setPane("orders")}
          label="Today"
          value={`${snap.ordersToday}`}
          hint={`${usd(snap.revenueToday)} today`}
        />
        <Metric
          active={active === "listings"}
          onClick={() => setPane("listings")}
          label="Live"
          value={String(snap.inventoryLive)}
          hint={`${snap.inventoryUnits} units · ${usd(snap.inventoryValue)}`}
        />
        <Metric
          active={active === "carts"}
          onClick={() => setPane("carts")}
          label="In cart"
          value={String(snap.inCart)}
          hint={`${snap.watchers} watching`}
        />
        <Metric
          active={active === "act"}
          onClick={() => setPane("act")}
          label="Alerts"
          value={String(alertCount)}
          hint={alertCount ? "Needs a look" : "All clear"}
          warn={alertCount > 0}
        />
      </div>

      <div className="mb-5 flex items-end justify-between">
        <h2 className="text-[22px] font-semibold tracking-tight text-zinc-950">
          {detailTitle}
        </h2>
        <p className="text-[13px] text-zinc-500">Tap a number above</p>
      </div>

      {active === "act" ? (
        <AlertPane alerts={snap.stockAlerts} />
      ) : active === "carts" ? (
        <OfferPane
          moves={snap.offerMoves}
          cartError={snap.cartError}
          watching={watching}
        />
      ) : active === "listings" ? (
        <InventoryPane rows={snap.inventory} />
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
  );
}

function Metric({
  label,
  value,
  hint,
  active,
  warn,
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  active?: boolean;
  warn?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[28px] bg-white px-6 py-6 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)] transition",
        active && "ring-2 ring-zinc-950/10",
      )}
    >
      <p className="text-[13px] font-medium text-zinc-500">{label}</p>
      <p
        className={cn(
          "mt-2 text-[36px] font-semibold tracking-tight",
          warn ? "text-amber-600" : "text-zinc-950",
        )}
      >
        {value}
      </p>
      <p className="mt-2 text-[13px] text-zinc-500">{hint}</p>
    </button>
  );
}

function ProductGrid({
  items,
}: {
  items: Array<{
    key: string;
    href: string;
    title: string;
    pictureUrl: string | null;
    meta: string;
  }>;
}) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <a
          key={item.key}
          href={item.href}
          target="_blank"
          rel="noreferrer"
          className="group overflow-hidden rounded-[28px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_28px_rgba(0,0,0,0.05)] transition hover:-translate-y-0.5"
        >
          <Photo
            src={item.pictureUrl}
            title={item.title}
            className="aspect-square w-full"
          />
          <div className="px-5 pb-5 pt-1">
            <p className="line-clamp-2 text-[15px] font-medium leading-snug text-zinc-950">
              {item.title}
            </p>
            <p className="mt-1.5 text-[13px] text-zinc-500">{item.meta}</p>
          </div>
        </a>
      ))}
    </div>
  );
}

function EmptyNote({ children }: { children: string }) {
  return (
    <div className="rounded-[28px] bg-white px-8 py-16 text-center text-[15px] text-zinc-500 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {children}
    </div>
  );
}

function AlertPane({ alerts }: { alerts: StockAlert[] }) {
  if (alerts.length === 0) {
    return (
      <EmptyNote>
        No stock problems. Qty 1 on a one-of-one listing is normal.
      </EmptyNote>
    );
  }
  return (
    <ProductGrid
      items={alerts.map((row) => ({
        key: `${row.kind}-${row.listingId}`,
        href: row.href,
        title: row.title,
        pictureUrl: row.pictureUrl,
        meta: `${row.why} ${row.fix}`,
      }))}
    />
  );
}

function OfferPane({
  moves,
  cartError,
  watching,
}: {
  moves: OfferMove[];
  cartError?: string;
  watching: InventoryLine[];
}) {
  const carts = moves.filter((row) => row.kind === "in_cart");
  const items =
    carts.length > 0
      ? carts.map((row) => ({
          key: `cart-${row.listingId}`,
          href: row.href,
          title: row.title,
          pictureUrl: row.pictureUrl,
          meta:
            row.suggestedPrice != null
              ? `Offer ${usd(row.suggestedPrice, true)} · ${row.suggestedOffPct}% off`
              : row.why,
        }))
      : watching.map((row) => ({
          key: `watch-${row.listingId}`,
          href: `https://www.ebay.com/itm/${row.listingId}`,
          title: row.title,
          pictureUrl: row.pictureUrl,
          meta: `${row.watchers} watching${row.price != null ? ` · ${usd(row.price, true)}` : ""}`,
        }));

  return (
    <div className="space-y-4">
      {cartError ? (
        <Link
          href="/settings#ebay-store"
          className="flex items-center justify-between rounded-2xl bg-amber-50 px-5 py-4 text-[15px] text-amber-950"
        >
          {cartError}
          <ArrowRight className="size-4" />
        </Link>
      ) : null}
      {items.length === 0 ? (
        <EmptyNote>
          No one has these in a cart right now. Watching will show here as soon
          as buyers touch a listing.
        </EmptyNote>
      ) : (
        <ProductGrid items={items} />
      )}
    </div>
  );
}

function InventoryPane({ rows }: { rows: InventoryLine[] }) {
  if (rows.length === 0) {
    return <EmptyNote>No active eBay listings found yet.</EmptyNote>;
  }
  return (
    <ProductGrid
      items={rows.map((row) => ({
        key: `${row.sku}-${row.listingId}`,
        href: row.listingId ? `https://www.ebay.com/itm/${row.listingId}` : "#",
        title: row.title,
        pictureUrl: row.pictureUrl,
        meta: `${row.qty} in stock${row.price != null ? ` · ${usd(row.price, true)}` : ""}${row.watchers ? ` · ${row.watchers} watching` : ""}`,
      }))}
    />
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
  if (empty) return <EmptyNote>{empty}</EmptyNote>;
  return (
    <div className="overflow-hidden rounded-[28px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_28px_rgba(0,0,0,0.05)]">
      {rows.map((row) => (
        <div
          key={`${row.orderId}-${row.listingId}-${row.sku}`}
          className="flex items-center justify-between gap-4 border-b border-zinc-100 px-6 py-4 last:border-b-0"
        >
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium text-zinc-950">
              {row.title}
            </p>
            <p className="mt-0.5 text-[13px] text-zinc-500">
              {row.qty} sold · {formatRelativeTime(row.createdAt)}
              {row.buyer ? ` · ${row.buyer}` : ""}
            </p>
          </div>
          <p className="shrink-0 text-[17px] font-semibold tabular-nums text-zinc-950">
            {usd(row.amount, true)}
          </p>
        </div>
      ))}
    </div>
  );
}
