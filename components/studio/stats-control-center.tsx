"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Heart } from "lucide-react";
import { toast } from "sonner";
import { formatRelativeTime } from "@/lib/format-relative-time";
import {
  usd,
  useEbaySales,
} from "@/lib/studio/use-ebay-sales";
import { cn } from "@/lib/utils";
import {
  EbayLivePreview,
  EbayWordmark,
} from "@/components/studio/ebay-live-preview";
import {
  ChanceMeter,
  DealDesk,
  OneClickMove,
  OpportunityList,
  recommendCopy,
} from "@/components/studio/opportunity-board";
import type {
  DealCard,
  InventoryLine,
  OfferMove,
  StockAlert,
} from "@/lib/ebay/sales-sync";

type Pane = "opps" | "act" | "carts" | "listings" | "orders";

function hiRes(url: string | null | undefined) {
  if (!url) return "";
  return url
    .replace(/s-l\d+/gi, "s-l500")
    .replace(/\$_\d+/g, "$_57")
    .replace(/^http:\/\//i, "https://");
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
  const [pickedId, setPickedId] = useState<string | null>(null);
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
  const deals = snap?.deals ?? [];
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
  const active: Pane = pane ?? "opps";

  const pickedDeal =
    deals.find((row) => row.listingId === pickedId) ||
    deals.find((row) => row.signal !== "sleeping") ||
    deals[0] ||
    null;
  const featuredInv =
    snap.inventory.find((row) => row.listingId === pickedDeal?.listingId) ||
    feed[0] ||
    null;

  const featuredTitle = pickedDeal?.title || featuredInv?.title || "";
  const featuredPhoto = pickedDeal?.pictureUrl || featuredInv?.pictureUrl;
  const featuredPrice = pickedDeal?.price ?? featuredInv?.price ?? null;
  const featuredId = pickedDeal?.listingId || featuredInv?.listingId || "";
  const canOffer =
    Boolean(featuredId) &&
    (pickedDeal?.inCart || carts.some((c) => c.listingId === featuredId));
  const dropTo =
    pickedDeal?.recommend.kind === "drop" ? pickedDeal.recommend.price : null;

  const runRecommend = (deal: DealCard) => {
    setPickedId(deal.listingId);
    if (deal.recommend.kind === "offer") {
      void act(
        `offer-${deal.listingId}`,
        {
          action: "offer",
          listingId: deal.listingId,
          discountPercentage: deal.recommend.pct || 10,
        },
        recommendCopy(deal).button + " sent",
      );
      return;
    }
    if (deal.recommend.kind === "drop" && deal.recommend.price != null) {
      void act(
        `price-${deal.listingId}`,
        {
          action: "price",
          listingId: deal.listingId,
          price: deal.recommend.price,
        },
        `BIN dropped to ${usd(deal.recommend.price, true)}`,
      );
    }
  };

  return (
    <div className="mx-auto max-w-[1100px] pb-16">
      <div className="overflow-hidden rounded-xl bg-white shadow-[0_12px_32px_-18px_rgba(0,0,0,0.45)] ring-1 ring-black/10">
        <div className="flex items-center gap-3 border-b border-[#e5e5e5] px-4 py-2.5">
          <button type="button" onClick={() => setPane("opps")}>
            <EbayWordmark className="text-[22px]" />
          </button>
          <button
            type="button"
            onClick={() => setPane("opps")}
            className="min-w-0 flex-1 rounded-full border border-[#ccc] bg-[#f7f7f7] px-3 py-1.5 text-left text-[12px] text-[#707070]"
          >
            {shop} · opportunity center
          </button>
          <span className="hidden text-[12px] font-medium text-[#191919] sm:inline">
            Live · {formatRelativeTime(snap.syncedAt)}
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
            active={active === "opps"}
            onClick={() => setPane("opps")}
            label="Deals"
            value={String(deals.length)}
            hint="Ranked live"
          />
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
            hint={`${snap.watchers} watching`}
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
              {featuredTitle ? (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={featuredId || featuredTitle}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.35 }}
                  >
                    <EbayLivePreview
                      photoSrc={hiRes(featuredPhoto)}
                      title={featuredTitle}
                      priceLabel={
                        dropTo != null
                          ? `US ${usd(dropTo, true)}`
                          : featuredPrice != null
                            ? `US ${usd(featuredPrice, true)}`
                            : "US —"
                      }
                      compareAtLabel={
                        dropTo != null && featuredPrice != null
                          ? `US ${usd(featuredPrice, true)}`
                          : null
                      }
                      storeName={shop}
                      live
                    />
                    {pickedDeal ? (
                      <div className="mt-3 space-y-3">
                        <div className="rounded-xl bg-white p-3 ring-1 ring-[#e5e5e5]">
                          <ChanceMeter
                            chance={pickedDeal.chance}
                            next={
                              pickedDeal.recommend.kind === "keep"
                                ? undefined
                                : pickedDeal.recommend.afterChance
                            }
                            big
                          />
                          <p className="mt-2 text-[13px] font-medium text-[#191919]">
                            {pickedDeal.why}
                          </p>
                          <p className="mt-1 text-[12px] text-[#707070]">
                            {pickedDeal.move}
                          </p>
                          {pickedDeal.vsStore === "lower" ? (
                            <p className="mt-1 text-[12px] font-semibold text-[#86B817]">
                              Priced lower than the rest of the store.
                            </p>
                          ) : null}
                          {pickedDeal.vsStore === "higher" &&
                          pickedDeal.signal === "stuck" ? (
                            <p className="mt-1 text-[12px] font-semibold text-[#c41e3a]">
                              Priced high vs the store — watching, not buying.
                            </p>
                          ) : null}
                          <div className="mt-3">
                            <OneClickMove
                              deal={pickedDeal}
                              busy={busy}
                              onGo={runRecommend}
                              large
                            />
                          </div>
                        </div>
                        {featuredId ? (
                          <DealDesk
                            listingId={featuredId}
                            price={featuredPrice}
                            canOffer={canOffer}
                            busy={busy}
                            onOffer={(pct, label) =>
                              void act(
                                `offer-${featuredId}`,
                                {
                                  action: "offer",
                                  listingId: featuredId,
                                  discountPercentage: pct,
                                },
                                label,
                              )
                            }
                            onDrop={(price) =>
                              void act(
                                `price-${featuredId}`,
                                {
                                  action: "price",
                                  listingId: featuredId,
                                  price,
                                },
                                `BIN set to ${usd(price, true)}`,
                              )
                            }
                          />
                        ) : null}
                      </div>
                    ) : featuredId ? (
                      <div className="mt-3">
                        <DealDesk
                          listingId={featuredId}
                          price={featuredPrice}
                          canOffer={canOffer}
                          busy={busy}
                          onOffer={(pct, label) =>
                            void act(
                              `offer-${featuredId}`,
                              {
                                action: "offer",
                                listingId: featuredId,
                                discountPercentage: pct,
                              },
                              label,
                            )
                          }
                          onDrop={(price) =>
                            void act(
                              `price-${featuredId}`,
                              {
                                action: "price",
                                listingId: featuredId,
                                price,
                              },
                              `BIN set to ${usd(price, true)}`,
                            )
                          }
                        />
                      </div>
                    ) : null}
                  </motion.div>
                </AnimatePresence>
              ) : (
                <p className="grid min-h-[420px] place-items-center text-[14px] text-[#707070]">
                  No live listings yet.
                </p>
              )}
            </div>

            <div className="max-h-[820px] overflow-y-auto bg-white">
              {snap.cartError ? (
                <Link
                  href="/settings#ebay-store"
                  className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950"
                >
                  {snap.cartError}
                  <ArrowRight className="size-4" />
                </Link>
              ) : null}
              <div className="flex items-center justify-between border-b border-[#eee] px-4 py-2.5">
                <p className="text-[13px] font-semibold text-[#191919]">
                  {active === "opps"
                    ? "Opportunity center · live"
                    : active === "act"
                      ? "Stock alerts"
                      : snap.inCart > 0 && active === "carts"
                        ? "In cart"
                        : "Watching now · like eBay search"}
                </p>
                {active === "opps" && carts.length > 1 ? (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      void act(
                        "offer-all",
                        {
                          action: "offer_all",
                          listingIds: carts.map((m) => m.listingId),
                          discountPercentage: 10,
                        },
                        "Offers sent to interested buyers",
                      )
                    }
                    className="h-7 rounded-full bg-[#3665F3] px-3 text-[11px] font-semibold text-white disabled:opacity-50"
                  >
                    {busy === "offer-all" ? "Sending…" : "Offer all carts"}
                  </button>
                ) : null}
              </div>
              {active === "opps" ? (
                <OpportunityList
                  deals={deals}
                  selectedId={featuredId || null}
                  busy={busy}
                  onPick={setPickedId}
                  onGo={runRecommend}
                />
              ) : feed.length === 0 ? (
                <p className="px-4 py-10 text-[14px] text-[#707070]">
                  Nothing in this view yet.
                </p>
              ) : (
                <ul>
                  {feed.slice(0, 12).map((row, i) => (
                    <EbayResultRow
                      key={row.listingId || row.sku}
                      row={row}
                      offer={carts.find((c) => c.listingId === row.listingId)}
                      alert={snap.stockAlerts.find(
                        (a) => a.listingId === row.listingId,
                      )}
                      deal={deals.find((d) => d.listingId === row.listingId)}
                      delay={i * 0.04}
                      onWork={() => {
                        setPickedId(row.listingId);
                        setPane("opps");
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

function EbayResultRow({
  row,
  offer,
  alert,
  deal,
  delay,
  onWork,
}: {
  row: InventoryLine;
  offer?: OfferMove;
  alert?: StockAlert;
  deal?: DealCard;
  delay: number;
  onWork: () => void;
}) {
  const href = row.listingId
    ? `https://www.ebay.com/itm/${row.listingId}`
    : "#";
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
        {deal ? (
          <div className="mt-1.5 max-w-[220px]">
            <ChanceMeter chance={deal.chance} />
          </div>
        ) : (
          <p className="mt-0.5 text-[12px] text-[#707070]">
            {row.watchers ? `${row.watchers} watching` : "Live"}
            {row.soldQty ? ` · ${row.soldQty} sold` : ""}
          </p>
        )}
        {offer?.kind === "in_cart" ? (
          <p className="mt-1 text-[12px] font-semibold text-[#3665F3]">
            In cart
          </p>
        ) : null}
        {alert ? (
          <p className="mt-1 text-[12px] font-medium text-[#c41e3a]">
            {alert.why} {alert.fix}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onWork}
          className="mt-2 h-7 rounded-full bg-[#3665F3] px-3 text-[11px] font-semibold text-white"
        >
          Work this deal
        </button>
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
