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

function HudCorners({ active }: { active?: boolean }) {
  const tone = active ? "bg-brand" : "bg-[#0f1111]/35";
  return (
    <>
      <span className={cn("absolute left-0 top-0 h-3 w-3 border-l-2 border-t-2", active ? "border-brand" : "border-[#0f1111]/40")} />
      <span className={cn("absolute right-0 top-0 h-3 w-3 border-r-2 border-t-2", active ? "border-brand" : "border-[#0f1111]/40")} />
      <span className={cn("absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2", active ? "border-brand" : "border-[#0f1111]/40")} />
      <span className={cn("absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2", active ? "border-brand" : "border-[#0f1111]/40")} />
      <span className={cn("absolute left-1 top-1 size-1 rounded-full", tone)} />
    </>
  );
}

function Thumb({
  src,
  title,
  className,
}: {
  src: string | null;
  title: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-[#f4f4f2]",
        className ?? "size-12 shrink-0 rounded-sm",
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-contain p-1" />
      ) : (
        <span className="grid size-full place-items-center font-mono text-[13px] text-[#565959]">
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
      <div className="higlou-hud-shell mx-auto min-h-[640px] max-w-[1120px] rounded-2xl border border-[#d5d9d9]" />
    );
  }
  if (!snap) return null;

  const live = snap.connected && !snap.error;
  const shop = snap.storeName?.trim() || "eBay store";
  const alertCount = snap.inventoryLow + snap.inventoryOut;
  const offerCount = snap.offerMoves.length;
  const watching = snap.inventory.filter((row) => row.watchers > 0).slice(0, 9);
  const active: Pane =
    pane ??
    (snap.inCart > 0 || Boolean(snap.cartError)
      ? "carts"
      : alertCount > 0
        ? "act"
        : offerCount > 0 || watching.length > 0
          ? "carts"
          : "listings");

  const metrics = [
    {
      pane: "orders" as Pane,
      code: "01",
      label: "SALES_30D",
      value: usd(snap.revenue30d),
      hint: `${snap.orders30d} orders · ${snap.units30d} sold`,
      pulse: true,
    },
    {
      pane: "orders" as Pane,
      code: "02",
      label: "TODAY",
      value: `${snap.ordersToday}`,
      hint: `${usd(snap.revenueToday)} · avg ${usd(snap.avgOrder, true)}`,
    },
    {
      pane: "listings" as Pane,
      code: "03",
      label: "LIVE_SKUS",
      value: String(snap.inventoryLive),
      hint: `${snap.inventoryUnits} units · ${usd(snap.inventoryValue)}`,
    },
    {
      pane: "carts" as Pane,
      code: "04",
      label: "IN_CART",
      value: String(snap.inCart),
      hint: "Buyers you can send an offer",
    },
    {
      pane: "carts" as Pane,
      code: "05",
      label: "WATCHERS",
      value: String(snap.watchers),
      hint: `${watching.length} hot listings`,
    },
    {
      pane: "act" as Pane,
      code: "06",
      label: "ALERTS",
      value: String(alertCount),
      hint: `${snap.inventoryLow} low · ${snap.inventoryOut} out`,
      warn: alertCount > 0,
    },
  ];

  return (
    <div className="higlou-hud-shell relative mx-auto max-w-[1120px] overflow-hidden rounded-2xl border border-[#d5d9d9] pb-6">
      <div
        aria-hidden
        className="higlou-hud-sweep pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-brand/25 to-transparent"
      />

      <header className="relative z-20 flex flex-wrap items-end justify-between gap-3 px-5 pt-5 pb-4">
        <div>
          <p className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.22em] text-[#565959] uppercase">
            <LiveDot tone={live ? "success" : "brand"} />
            <span className="higlou-hud-tick">SYS</span>
            // control center
          </p>
          <h1 className="mt-1 font-display text-4xl tracking-tight">Stats</h1>
          <p className="mt-1 font-mono text-[11px] tracking-wide text-[#565959] uppercase">
            {shop} // live {SALES_POLL_MS / 1000}s // tap a cell
          </p>
        </div>
        <p className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[#565959]">
          <RefreshCw
            className={cn(
              "size-3",
              live && "animate-spin [animation-duration:3s]",
            )}
          />
          {snap.error ? snap.error : `SYNC ${formatRelativeTime(snap.syncedAt)}`}
        </p>
      </header>

      <div className="relative z-20 mx-5 mb-4 h-px overflow-hidden bg-[#0f1111]/10">
        <motion.span
          key={tick}
          className="absolute inset-y-0 w-1/3 bg-brand"
          initial={{ left: "-30%" }}
          animate={{ left: "100%" }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
      </div>

      {snap.error ? (
        <Link
          href="/settings#ebay-store"
          className="relative z-20 mx-5 mb-4 flex items-center justify-between border border-amber-300 bg-amber-50 px-4 py-3 font-mono text-[12px] text-amber-950"
        >
          {snap.error}
          <ArrowRight className="size-4" />
        </Link>
      ) : null}

      <div className="relative z-20 grid grid-cols-2 gap-2 px-5 lg:grid-cols-3">
        {metrics.map((metric, i) => (
          <MetricCard
            key={metric.code}
            index={i}
            active={active === metric.pane}
            onClick={() => setPane(metric.pane)}
            code={metric.code}
            label={metric.label}
            value={metric.value}
            hint={metric.hint}
            pulse={metric.pulse}
            warn={metric.warn}
          />
        ))}
      </div>

      <div className="relative z-20 mx-5 mt-3 min-h-[340px] border border-[#0f1111]/12 bg-white/80">
        {active === "act" ? (
          <AlertPane alerts={snap.stockAlerts} />
        ) : active === "carts" ? (
          <OfferPane
            moves={snap.offerMoves}
            cartError={snap.cartError}
            watching={watching}
          />
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
  code,
  label,
  value,
  hint,
  pulse,
  active,
  warn,
  index,
  onClick,
}: {
  code: string;
  label: string;
  value: string;
  hint: string;
  pulse?: boolean;
  active?: boolean;
  warn?: boolean;
  index: number;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.35 }}
      className={cn(
        "relative min-h-[108px] overflow-hidden bg-white/90 px-4 py-3.5 text-left transition",
        active ? "bg-brand-soft/80" : "hover:bg-white",
      )}
    >
      <HudCorners active={active} />
      {pulse ? (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-0.5 bg-brand [animation:higlou-scan_2.4s_ease-in-out_infinite]"
        />
      ) : null}
      <p className="font-mono text-[10px] tracking-[0.18em] text-[#565959]">
        {code} / {label}
      </p>
      <motion.p
        key={value}
        initial={{ opacity: 0.4, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "mt-1 font-mono text-[26px] leading-none tracking-tight",
          warn ? "text-amber-700" : "text-[#0f1111]",
        )}
      >
        {value}
      </motion.p>
      <p className="mt-2 text-[11px] text-[#565959]">{hint}</p>
    </motion.button>
  );
}

function PaneHead({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[#0f1111]/10 px-4 py-2.5">
      <p className="font-mono text-[11px] tracking-[0.16em] text-[#0f1111] uppercase">
        {title}
      </p>
      <p className="font-mono text-[10px] tracking-wide text-[#565959] uppercase">
        {hint}
      </p>
    </div>
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
    <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
      {items.map((item, i) => (
        <motion.a
          key={item.key}
          href={item.href}
          target="_blank"
          rel="noreferrer"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.04, duration: 0.3 }}
          className="group relative overflow-hidden bg-[#f7f7f5]"
        >
          <HudCorners />
          <Thumb
            src={item.pictureUrl}
            title={item.title}
            className="aspect-square w-full"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-2 top-2 h-10 bg-gradient-to-b from-brand/40 to-transparent opacity-0 transition group-hover:opacity-100 [animation:higlou-scan_2s_ease-in-out_infinite]"
          />
          <div className="border-t border-[#0f1111]/8 px-2.5 py-2">
            <p className="line-clamp-2 text-[12px] font-medium leading-snug text-[#0f1111]">
              {item.title}
            </p>
            <p className="mt-1 font-mono text-[10px] tracking-wide text-[#565959] uppercase">
              {item.meta}
            </p>
          </div>
        </motion.a>
      ))}
    </div>
  );
}

function AlertPane({ alerts }: { alerts: StockAlert[] }) {
  if (alerts.length === 0) {
    return (
      <>
        <PaneHead title="06 / Alerts" hint="Clear" />
        <p className="px-4 py-10 font-mono text-[12px] text-[#565959]">
          No stock problems. Qty 1 on a one-of-one listing is normal.
        </p>
      </>
    );
  }
  return (
    <>
      <PaneHead title="06 / Alerts" hint="What it is · how to fix" />
      <ProductGrid
        items={alerts.map((row) => ({
          key: `${row.kind}-${row.listingId}`,
          href: row.href,
          title: row.title,
          pictureUrl: row.pictureUrl,
          meta: `${row.why} · Fix: ${row.fix}`,
        }))}
      />
    </>
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
  const gridItems =
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
    <>
      <PaneHead
        title={carts.length > 0 ? "04 / In cart" : "05 / Watching"}
        hint={
          cartError
            ? "eBay blocked cart read"
            : carts.length > 0
              ? `${carts.length} live offers`
              : `${watching.length} hot listings`
        }
      />
      {cartError ? (
        <Link
          href="/settings#ebay-store"
          className="flex items-center justify-between border-b border-[#eee] px-4 py-3 font-mono text-[12px] text-amber-800 hover:bg-[#f7f7f7]"
        >
          {cartError}
          <ArrowRight className="size-4" />
        </Link>
      ) : null}
      {gridItems.length === 0 ? (
        <p className="px-4 py-10 font-mono text-[12px] text-[#565959]">
          No cart or watcher signal yet. The grid fills the second a buyer
          touches a listing.
        </p>
      ) : (
        <div className="max-h-[min(52vh,420px)] overflow-y-auto">
          <ProductGrid items={gridItems} />
        </div>
      )}
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
        <PaneHead title="03 / Inventory" hint={`${live} live`} />
        <p className="px-4 py-10 font-mono text-[12px] text-[#565959]">
          No active eBay listings found yet.
        </p>
      </>
    );
  }
  return (
    <>
      <PaneHead title="03 / Inventory" hint={`${live} live`} />
      <div className="max-h-[min(52vh,420px)] overflow-y-auto">
        <ProductGrid
          items={rows.map((row) => ({
            key: `${row.sku}-${row.listingId}`,
            href: row.listingId
              ? `https://www.ebay.com/itm/${row.listingId}`
              : "#",
            title: row.title,
            pictureUrl: row.pictureUrl,
            meta: `${row.qty} qty${row.price != null ? ` · ${usd(row.price, true)}` : ""}${row.watchers ? ` · ${row.watchers} watch` : ""}`,
          }))}
        />
      </div>
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
      <PaneHead title="01 / Orders" hint="Last 30 days" />
      {empty ? (
        <p className="px-4 py-10 font-mono text-[12px] text-[#565959]">{empty}</p>
      ) : (
        <ul className="max-h-[min(52vh,380px)] divide-y divide-[#0f1111]/8 overflow-y-auto">
          {rows.map((row, i) => (
            <motion.li
              key={`${row.orderId}-${row.listingId}-${row.sku}`}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-[#0f1111]">
                  {row.title}
                </p>
                <p className="font-mono text-[10px] tracking-wide text-[#565959] uppercase">
                  {row.qty} sold · {formatRelativeTime(row.createdAt)}
                  {row.buyer ? ` · ${row.buyer}` : ""}
                </p>
              </div>
              <p className="shrink-0 font-mono text-[14px] text-[#0f1111]">
                {usd(row.amount, true)}
              </p>
            </motion.li>
          ))}
        </ul>
      )}
    </>
  );
}
