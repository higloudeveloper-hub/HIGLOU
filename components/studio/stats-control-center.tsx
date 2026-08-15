"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Heart } from "lucide-react";
import { toast } from "sonner";
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
  StoreInsight,
} from "@/lib/ebay/sales-sync";

type Pane = "act" | "carts" | "listings" | "orders";

function hiRes(url: string | null | undefined) {
  if (!url) return "";
  return url
    .replace(/s-l\d+/gi, "s-l500")
    .replace(/\$_\d+/g, "$_57")
    .replace(/^http:\/\//i, "https://");
}

function suggestDrop(price: number | null) {
  if (!price || price < 2) return { pct: 10, amount: null as number | null };
  const pct = price >= 50 ? 10 : 5;
  return { pct, amount: Math.round(price * (1 - pct / 100) * 100) / 100 };
}

async function runPremium(body: {
  action: "offer" | "offer_all" | "price";
  listingId?: string;
  listingIds?: string[];
  discountPercentage?: number;
  price?: number;
}) {
  const res = await fetch("/api/ebay/premium", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error || "Action failed");
}

export function StatsControlCenter() {
  const { snap, loading, reload } = useEbaySales();
  const [pane, setPane] = useState<Pane | null>(null);
  const [hero, setHero] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const lastOrdersRef = useRef<number | null>(null);

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

  useEffect(() => {
    if (!snap) return;
    if (
      lastOrdersRef.current != null &&
      snap.orders30d > lastOrdersRef.current
    ) {
      toast.success("New eBay sale just landed");
    }
    lastOrdersRef.current = snap.orders30d;
  }, [snap]);

  const act = async (
    key: string,
    body: Parameters<typeof runPremium>[0],
    ok: string,
  ) => {
    setBusy(key);
    try {
      await runPremium(body);
      toast.success(ok);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

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

        {snap.insights.length > 0 ? (
          <PremiumStrip
            insights={snap.insights}
            busy={busy}
            onOffer={(listingId, pct) =>
              void act(
                `offer-${listingId}`,
                {
                  action: "offer",
                  listingId,
                  discountPercentage: pct,
                },
                `Offer sent · ${pct}% off`,
              )
            }
            onPrice={(listingId, price) => {
              if (
                !window.confirm(
                  `Drop this listing to ${usd(price, true)} on eBay?`,
                )
              ) {
                return;
              }
              void act(
                `price-${listingId}`,
                { action: "price", listingId, price },
                `Price updated to ${usd(price, true)}`,
              );
            }}
            onOfferAll={() =>
              void act(
                "offer-all",
                {
                  action: "offer_all",
                  listingIds: snap.offerMoves
                    .filter((m) => m.kind === "in_cart")
                    .map((m) => m.listingId),
                  discountPercentage: 10,
                },
                "Offers sent to interested buyers",
              )
            }
          />
        ) : null}

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
                    {featured.listingId ? (
                      <FeaturedActions
                        listingId={featured.listingId}
                        price={featured.price}
                        busy={busy}
                        canOffer={carts.some(
                          (c) => c.listingId === featured.listingId,
                        )}
                        onOffer={() =>
                          void act(
                            `offer-${featured.listingId}`,
                            {
                              action: "offer",
                              listingId: featured.listingId,
                              discountPercentage: 10,
                            },
                            "10% offer sent to interested buyers",
                          )
                        }
                        onDrop={() => {
                          const next = suggestDrop(featured.price).amount;
                          if (next == null) {
                            toast.error("This listing has no price to drop.");
                            return;
                          }
                          if (
                            !window.confirm(
                              `Drop BIN to ${usd(next, true)} on eBay?`,
                            )
                          ) {
                            return;
                          }
                          void act(
                            `price-${featured.listingId}`,
                            {
                              action: "price",
                              listingId: featured.listingId,
                              price: next,
                            },
                            `Price dropped to ${usd(next, true)}`,
                          );
                        }}
                      />
                    ) : null}
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
                        busy={busy}
                        onOffer={(listingId, pct) =>
                          void act(
                            `offer-${listingId}`,
                            {
                              action: "offer",
                              listingId,
                              discountPercentage: pct,
                            },
                            `Offer sent · ${pct}% off`,
                          )
                        }
                        onDrop={(listingId, price) => {
                          if (
                            !window.confirm(
                              `Drop BIN to ${usd(price, true)} on eBay?`,
                            )
                          ) {
                            return;
                          }
                          void act(
                            `price-${listingId}`,
                            { action: "price", listingId, price },
                            `Price dropped to ${usd(price, true)}`,
                          );
                        }}
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

function PremiumStrip({
  insights,
  busy,
  onOffer,
  onPrice,
  onOfferAll,
}: {
  insights: StoreInsight[];
  busy: string | null;
  onOffer: (listingId: string, pct: number) => void;
  onPrice: (listingId: string, price: number) => void;
  onOfferAll: () => void;
}) {
  const offers = insights.filter((row) => row.kind === "send_offer");
  return (
    <div className="border-b border-[#e5e5e5] bg-[#f7f7f7] px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold text-[#191919]">
          Seller moves
        </p>
        {offers.length > 1 ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={onOfferAll}
            className="h-8 rounded-full bg-[#3665F3] px-3.5 text-[12px] font-semibold text-white disabled:opacity-50"
          >
            {busy === "offer-all" ? "Sending…" : "Send all cart offers"}
          </button>
        ) : null}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {insights.map((insight) => {
          const pct = insight.suggestedPct || 10;
          const drop = insight.suggestedPrice;
          return (
            <article
              key={insight.id}
              className="flex min-w-[280px] max-w-[320px] shrink-0 gap-2.5 rounded-lg bg-white p-2.5 ring-1 ring-[#e5e5e5]"
            >
              <div className="size-14 shrink-0 overflow-hidden rounded-md bg-[#f7f7f7] ring-1 ring-[#eee]">
                {hiRes(insight.pictureUrl) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={hiRes(insight.pictureUrl)}
                    alt=""
                    className="size-full object-contain p-1"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-[12px] font-medium text-[#191919]">
                  {insight.title}
                </p>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-[#707070]">
                  {insight.detail}
                </p>
                <div className="mt-1.5">
                  {insight.kind === "send_offer" ? (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => onOffer(insight.listingId, pct)}
                      className="h-7 rounded-full bg-[#3665F3] px-2.5 text-[11px] font-semibold text-white disabled:opacity-50"
                    >
                      {busy === `offer-${insight.listingId}`
                        ? "Sending…"
                        : `Send ${pct}% offer`}
                    </button>
                  ) : (insight.kind === "cut_price" || insight.kind === "hot") &&
                    drop != null ? (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => onPrice(insight.listingId, drop)}
                      className="h-7 rounded-full border border-[#111]/15 px-2.5 text-[11px] font-semibold text-[#111] disabled:opacity-50"
                    >
                      {busy === `price-${insight.listingId}`
                        ? "Updating…"
                        : `Drop to ${usd(drop, true)}`}
                    </button>
                  ) : (
                    <a
                      href={`https://www.ebay.com/itm/${insight.listingId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-7 items-center text-[11px] font-semibold text-[#3665F3]"
                    >
                      Open on eBay
                    </a>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function FeaturedActions({
  listingId,
  price,
  busy,
  canOffer,
  onOffer,
  onDrop,
}: {
  listingId: string;
  price: number | null;
  busy: string | null;
  canOffer: boolean;
  onOffer: () => void;
  onDrop: () => void;
}) {
  const next = suggestDrop(price).amount;
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-2">
      {canOffer ? (
        <button
          type="button"
          disabled={busy !== null}
          onClick={onOffer}
          className="h-8 rounded-full bg-[#3665F3] px-3.5 text-[12px] font-semibold text-white disabled:opacity-50"
        >
          {busy === `offer-${listingId}` ? "Sending…" : "Send 10% offer"}
        </button>
      ) : null}
      {next != null ? (
        <button
          type="button"
          disabled={busy !== null}
          onClick={onDrop}
          className="h-8 rounded-full border border-[#111]/15 bg-white px-3.5 text-[12px] font-semibold text-[#111] disabled:opacity-50"
        >
          {busy === `price-${listingId}`
            ? "Updating…"
            : `Drop to ${usd(next, true)}`}
        </button>
      ) : null}
      <a
        href={`https://www.ebay.com/itm/${listingId}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-8 items-center rounded-full px-3 text-[12px] font-medium text-[#3665F3]"
      >
        View on eBay
      </a>
    </div>
  );
}

function EbayResultRow({
  row,
  offer,
  alert,
  delay,
  busy,
  onOffer,
  onDrop,
}: {
  row: InventoryLine;
  offer?: OfferMove;
  alert?: StockAlert;
  delay: number;
  busy: string | null;
  onOffer: (listingId: string, pct: number) => void;
  onDrop: (listingId: string, price: number) => void;
}) {
  const href = row.listingId
    ? `https://www.ebay.com/itm/${row.listingId}`
    : "#";
  const drop = offer?.suggestedPrice ?? suggestDrop(row.price).amount;
  const pct = offer?.suggestedOffPct || 10;
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="flex gap-3 border-b border-[#eee] px-4 py-3 hover:bg-[#f7f7f7]"
    >
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="relative size-[108px] shrink-0 overflow-hidden rounded-md bg-white ring-1 ring-[#e5e5e5]"
      >
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
      </a>
      <div className="min-w-0 flex-1">
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="line-clamp-2 text-[14px] leading-snug text-[#191919] hover:text-[#3665F3]"
        >
          {row.title}
        </a>
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
        {offer?.kind === "in_cart" ? (
          <p className="mt-1 text-[12px] font-semibold text-[#3665F3]">
            In cart
            {offer.suggestedPrice != null
              ? ` · offer ${usd(offer.suggestedPrice, true)} (${pct}% off)`
              : ""}
          </p>
        ) : offer?.kind === "best_offer" ? (
          <p className="mt-1 text-[12px] font-semibold text-[#3665F3]">
            Buyer sent a Best Offer
          </p>
        ) : (
          <p className="mt-1 text-[12px] font-bold text-[#3665F3]">Buy It Now</p>
        )}
        {alert ? (
          <p className="mt-1 text-[12px] font-medium text-[#c41e3a]">
            {alert.why} {alert.fix}
          </p>
        ) : null}
        {row.listingId ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {offer?.kind === "in_cart" ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => onOffer(row.listingId, pct)}
                className="h-7 rounded-full bg-[#3665F3] px-2.5 text-[11px] font-semibold text-white disabled:opacity-50"
              >
                {busy === `offer-${row.listingId}`
                  ? "Sending…"
                  : `Send ${pct}% offer`}
              </button>
            ) : null}
            {drop != null ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => onDrop(row.listingId, drop)}
                className="h-7 rounded-full border border-[#111]/15 bg-white px-2.5 text-[11px] font-semibold text-[#111] disabled:opacity-50"
              >
                {busy === `price-${row.listingId}`
                  ? "Updating…"
                  : `Drop to ${usd(drop, true)}`}
              </button>
            ) : null}
            {offer?.kind === "best_offer" ? (
              <a
                href={offer.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-7 items-center px-1 text-[11px] font-semibold text-[#3665F3]"
              >
                Open offers
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
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
