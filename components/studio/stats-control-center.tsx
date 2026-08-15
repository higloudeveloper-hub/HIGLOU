"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Heart } from "lucide-react";
import { formatRelativeTime } from "@/lib/format-relative-time";
import {
  SALES_POLL_MS,
  usd,
  useEbaySales,
} from "@/lib/studio/use-ebay-sales";
import { cn } from "@/lib/utils";
import {
  EbayLivePreview,
  EbayWordmark,
} from "@/components/studio/ebay-live-preview";
import type {
  InventoryLine,
  OfferMove,
  StockAlert,
} from "@/lib/ebay/sales-sync";

type Pane = "act" | "carts" | "listings" | "orders";

function hiRes(url: string | null | undefined) {
  if (!url) return "";
  return url
    .replace(/s-l\d+/gi, "s-l500")
    .replace(/\$_\d+/g, "$_57")
    .replace(/^http:\/\//i, "https://");
}

export function StatsControlCenter() {
  const { snap, loading } = useEbaySales();
  const [pane, setPane] = useState<Pane | null>(null);
  const [hero, setHero] = useState(0);

  const watching = useMemo(
    () => (snap?.inventory ?? []).filter((row) => row.watchers > 0),
    [snap],
  );
  const carts = useMemo(
    () => (snap?.offerMoves ?? []).filter((row) => row.kind === "in_cart"),
    [snap],
  );
  const feed = useMemo(() => {
    if (!snap) return [] as InventoryLine[];
    if (pane === "act") {
      const ids = new Set(snap.stockAlerts.map((a) => a.listingId));
      return snap.inventory.filter((row) => ids.has(row.listingId));
    }
    if (pane === "carts" && carts.length > 0) {
      const ids = new Set(carts.map((c) => c.listingId));
      const fromInv = snap.inventory.filter((row) => ids.has(row.listingId));
      if (fromInv.length) return fromInv;
    }
    if (watching.length) return watching;
    return snap.inventory;
  }, [snap, pane, carts, watching]);

  useEffect(() => {
    if (feed.length < 2) return;
    const t = window.setInterval(
      () => setHero((n) => (n + 1) % Math.min(feed.length, 6)),
      4200,
    );
    return () => window.clearInterval(t);
  }, [feed.length]);

  if (loading && !snap) {
    return (
      <div className="mx-auto max-w-[1100px]">
        <div className="h-[640px] animate-pulse rounded-xl bg-white ring-1 ring-black/10" />
      </div>
    );
  }
  if (!snap) return null;

  const shop = snap.storeName?.trim() || "eBay store";
  const alertCount = snap.inventoryLow + snap.inventoryOut;
  const active: Pane =
    pane ??
    (snap.inCart > 0
      ? "carts"
      : alertCount > 0
        ? "act"
        : watching.length
          ? "carts"
          : "listings");

  const featured = feed[hero % Math.max(feed.length, 1)];
  const rest = feed.filter((row) => row.listingId !== featured?.listingId);

  return (
    <div className="mx-auto max-w-[1100px] pb-16">
      <div className="overflow-hidden rounded-xl bg-white shadow-[0_12px_32px_-18px_rgba(0,0,0,0.45)] ring-1 ring-black/10">
        <div className="flex items-center gap-3 border-b border-[#e5e5e5] px-4 py-2.5">
          <EbayWordmark className="text-[22px]" />
          <div className="min-w-0 flex-1 rounded-full border border-[#ccc] bg-[#f7f7f7] px-3 py-1.5 text-[12px] text-[#707070]">
            {shop} · live store
          </div>
          <span className="hidden text-[12px] font-medium text-[#191919] sm:inline">
            Updated {formatRelativeTime(snap.syncedAt)}
          </span>
        </div>

        {snap.error ? (
          <Link
            href="/settings#ebay-store"
            className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950"
          >
            {snap.error}
            <ArrowRight className="size-4" />
          </Link>
        ) : null}

        <div className="grid grid-cols-2 divide-x divide-[#eee] border-b border-[#e5e5e5] lg:grid-cols-6">
          <StatCell
            active={active === "orders"}
            onClick={() => setPane("orders")}
            label="Sold · 30 days"
            value={usd(snap.revenue30d)}
            hint={`${snap.orders30d} orders`}
          />
          <StatCell
            active={active === "orders"}
            onClick={() => setPane("orders")}
            label="Today"
            value={`${snap.ordersToday}`}
            hint={usd(snap.revenueToday)}
          />
          <StatCell
            active={active === "listings"}
            onClick={() => setPane("listings")}
            label="Live listings"
            value={String(snap.inventoryLive)}
            hint={`${snap.inventoryUnits} units`}
          />
          <StatCell
            active={active === "carts"}
            onClick={() => setPane("carts")}
            label="In cart"
            value={String(snap.inCart)}
            hint="Send an offer"
          />
          <StatCell
            active={active === "carts"}
            onClick={() => setPane("carts")}
            label="Watching"
            value={String(snap.watchers)}
            hint={`${watching.length} listings`}
          />
          <StatCell
            active={active === "act"}
            onClick={() => setPane("act")}
            label="Alerts"
            value={String(alertCount)}
            hint={alertCount ? "Needs a look" : "All clear"}
            warn={alertCount > 0}
          />
        </div>

        {active === "orders" ? (
          <OrdersBoard rows={snap.recent} />
        ) : (
          <div className="grid gap-0 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <div className="border-b border-[#e5e5e5] bg-[#f7f7f7] p-4 lg:border-r lg:border-b-0">
              {featured ? (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={featured.listingId}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.35 }}
                  >
                    <EbayLivePreview
                      photoSrc={hiRes(featured.pictureUrl)}
                      title={featured.title}
                      priceLabel={
                        featured.price != null
                          ? `US ${usd(featured.price, true)}`
                          : "US —"
                      }
                      storeName={shop}
                      live
                    />
                    <p className="mt-3 text-center text-[12px] text-[#707070]">
                      {featured.watchers
                        ? `${featured.watchers} people watching this right now`
                        : "Live on eBay"}
                      {featured.soldQty ? ` · ${featured.soldQty} sold` : ""}
                      <span className="mx-1">·</span>
                      refreshes every {SALES_POLL_MS / 1000}s
                    </p>
                  </motion.div>
                </AnimatePresence>
              ) : (
                <p className="grid min-h-[420px] place-items-center text-[14px] text-[#707070]">
                  No live listings yet.
                </p>
              )}
            </div>

            <div className="max-h-[720px] overflow-y-auto bg-white">
              {snap.cartError ? (
                <Link
                  href="/settings#ebay-store"
                  className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950"
                >
                  {snap.cartError}
                  <ArrowRight className="size-4" />
                </Link>
              ) : null}
              <p className="border-b border-[#eee] px-4 py-2.5 text-[13px] font-semibold text-[#191919]">
                {active === "act"
                  ? "Stock alerts"
                  : snap.inCart > 0 && active === "carts"
                    ? "In cart — send an offer"
                    : "Watching now · like eBay search"}
              </p>
              {rest.length === 0 && !featured ? (
                <p className="px-4 py-10 text-[14px] text-[#707070]">
                  Nothing in this view yet.
                </p>
              ) : (
                <ul>
                  {(featured ? [featured, ...rest] : rest)
                    .slice(0, 12)
                    .map((row, i) => (
                      <EbayResultRow
                        key={row.listingId || row.sku}
                        row={row}
                        offer={carts.find((c) => c.listingId === row.listingId)}
                        alert={snap.stockAlerts.find(
                          (a) => a.listingId === row.listingId,
                        )}
                        delay={i * 0.04}
                      />
                    ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCell({
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
        "px-3 py-3 text-left transition",
        active ? "bg-[#eef4ff]" : "hover:bg-[#f7f7f7]",
      )}
    >
      <p className="text-[11px] font-medium text-[#707070]">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-[22px] font-semibold tabular-nums tracking-tight",
          warn ? "text-[#c41e3a]" : "text-[#191919]",
        )}
      >
        {value}
      </p>
      <p className="text-[11px] text-[#707070]">{hint}</p>
    </button>
  );
}

function EbayResultRow({
  row,
  offer,
  alert,
  delay,
}: {
  row: InventoryLine;
  offer?: OfferMove;
  alert?: StockAlert;
  delay: number;
}) {
  const href = row.listingId
    ? `https://www.ebay.com/itm/${row.listingId}`
    : "#";
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
    >
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="flex gap-3 border-b border-[#eee] px-4 py-3 hover:bg-[#f7f7f7]"
      >
        <div className="relative size-[108px] shrink-0 overflow-hidden rounded-md bg-white ring-1 ring-[#e5e5e5]">
          {hiRes(row.pictureUrl) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hiRes(row.pictureUrl)}
              alt=""
              className="size-full object-contain p-1.5"
            />
          ) : (
            <span className="grid size-full place-items-center text-[18px] font-semibold text-[#bbb]">
              {(row.title[0] || "?").toUpperCase()}
            </span>
          )}
          <Heart className="absolute top-1.5 right-1.5 size-3.5 text-[#191919]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[14px] leading-snug text-[#191919] group-hover:text-[#3665F3]">
            {row.title}
          </p>
          {row.price != null ? (
            <p className="mt-1 text-[20px] font-semibold tabular-nums text-[#191919]">
              <span className="text-[12px] font-semibold">US </span>
              {usd(row.price, true)}
            </p>
          ) : null}
          <p className="mt-0.5 text-[12px] text-[#707070]">
            {row.watchers ? `${row.watchers} watching` : "Live"}
            {row.soldQty ? ` · ${row.soldQty} sold` : ""}
            {row.qty != null ? ` · ${row.qty} available` : ""}
          </p>
          {offer?.suggestedPrice != null ? (
            <p className="mt-1 text-[12px] font-semibold text-[#3665F3]">
              Offer you can send: {usd(offer.suggestedPrice, true)} (
              {offer.suggestedOffPct}% off)
            </p>
          ) : (
            <p className="mt-1 text-[12px] font-bold text-[#3665F3]">
              Buy It Now
            </p>
          )}
          {alert ? (
            <p className="mt-1 text-[12px] font-medium text-[#c41e3a]">
              {alert.why} {alert.fix}
            </p>
          ) : null}
        </div>
      </a>
    </motion.li>
  );
}

function OrdersBoard({
  rows,
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
}) {
  if (rows.length === 0) {
    return (
      <p className="px-6 py-16 text-center text-[14px] text-[#707070]">
        No eBay orders in the last 30 days.
      </p>
    );
  }
  return (
    <ul>
      {rows.map((row) => (
        <li
          key={`${row.orderId}-${row.listingId}-${row.sku}`}
          className="flex items-center justify-between gap-4 border-b border-[#eee] px-5 py-4"
        >
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-[#191919]">
              {row.title}
            </p>
            <p className="mt-0.5 text-[12px] text-[#707070]">
              {row.qty} sold · {formatRelativeTime(row.createdAt)}
              {row.buyer ? ` · ${row.buyer}` : ""}
            </p>
          </div>
          <p className="shrink-0 text-[18px] font-semibold tabular-nums text-[#191919]">
            {usd(row.amount, true)}
          </p>
        </li>
      ))}
    </ul>
  );
}
