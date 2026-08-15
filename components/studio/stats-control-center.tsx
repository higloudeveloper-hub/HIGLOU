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
} from "@/components/studio/ebay-live-preview";
import {
  ChanceMeter,
  DealDesk,
  LiveBanner,
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
import {
  LiveConfirm,
  offerAllConfirm,
  offerConfirm,
  priceConfirm,
  type LiveConfirmOp,
} from "@/components/studio/live-confirm";

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
  const [pending, setPending] = useState<LiveConfirmOp | null>(null);
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

  const locked = busy !== null || pending !== null;

  const runConfirmed = async () => {
    if (!pending || busy) return;
    const op = pending;
    setBusy(op.key);
    try {
      await runPremium(op.body);
      toast.success(op.ok);
      setPending(null);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  if (loading && !snap) {
    return (
      <div className="flex h-full min-h-[520px] flex-1 animate-pulse bg-white" />
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
      setPending(
        offerConfirm({
          listingId: deal.listingId,
          title: deal.title,
          bin: deal.price,
          pct: deal.recommend.pct || 10,
          ok: recommendCopy(deal).button + " sent",
        }),
      );
      return;
    }
    if (deal.recommend.kind === "drop" && deal.recommend.price != null) {
      setPending(
        priceConfirm({
          listingId: deal.listingId,
          title: deal.title,
          from: deal.price,
          to: deal.recommend.price,
          ok: `BIN dropped to ${usd(deal.recommend.price, true)}`,
        }),
      );
    }
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-white md:h-full">
      <LiveBanner
        shop={shop}
        deals={deals}
        watching={snap.watchers}
        inCart={snap.inCart}
        syncedAt={snap.syncedAt}
      />
      <div className="flex min-h-0 flex-1 flex-col">

        {snap.error ? (
          <Link
            href="/settings#ebay-store"
            className="flex shrink-0 items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950"
          >
            {snap.error}
            <ArrowRight className="size-4" />
          </Link>
        ) : null}

        <div className="grid shrink-0 grid-cols-2 divide-x divide-[#eee] border-b border-[#e5e5e5] lg:grid-cols-6">
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
            spark={sparkFromOrders(snap.recent)}
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
          <div className="min-h-0 flex-1 overflow-y-auto">
            <OrdersBoard rows={snap.recent} />
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(440px,1.1fr)_minmax(0,0.9fr)]">
            <div className="flex min-h-0 flex-col border-b border-[#e5e5e5] bg-[#f3f3f3] p-4 lg:border-r lg:border-b-0">
              {featuredTitle ? (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={featuredId || featuredTitle}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.28 }}
                    className="flex min-h-0 flex-1 flex-col"
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
                      fill
                      className="min-h-0 flex-1"
                    />
                    {pickedDeal ? (
                      <div className="mt-3 shrink-0 space-y-2">
                        <div className="rounded-lg bg-white p-3 ring-1 ring-[#e5e5e5]">
                          <ChanceMeter
                            chance={pickedDeal.chance}
                            next={
                              pickedDeal.recommend.kind === "keep"
                                ? undefined
                                : pickedDeal.recommend.afterChance
                            }
                          />
                          <p className="mt-2 line-clamp-1 text-[12px] text-[#707070]">
                            {pickedDeal.why}
                          </p>
                          <div className="mt-3">
                            <OneClickMove
                              deal={pickedDeal}
                              busy={locked ? busy ?? "pending" : null}
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
                            busy={locked ? busy ?? "pending" : null}
                            onOffer={(pct, label) =>
                              setPending(
                                offerConfirm({
                                  listingId: featuredId,
                                  title: featuredTitle,
                                  bin: featuredPrice,
                                  pct,
                                  ok: label,
                                }),
                              )
                            }
                            onDrop={(price) =>
                              setPending(
                                priceConfirm({
                                  listingId: featuredId,
                                  title: featuredTitle,
                                  from: featuredPrice,
                                  to: price,
                                  ok: `BIN set to ${usd(price, true)}`,
                                }),
                              )
                            }
                          />
                        ) : null}
                      </div>
                    ) : featuredId ? (
                      <div className="mt-3 shrink-0">
                        <DealDesk
                          listingId={featuredId}
                          price={featuredPrice}
                          canOffer={canOffer}
                          busy={locked ? busy ?? "pending" : null}
                          onOffer={(pct, label) =>
                            setPending(
                              offerConfirm({
                                listingId: featuredId,
                                title: featuredTitle,
                                bin: featuredPrice,
                                pct,
                                ok: label,
                              }),
                            )
                          }
                          onDrop={(price) =>
                            setPending(
                              priceConfirm({
                                listingId: featuredId,
                                title: featuredTitle,
                                from: featuredPrice,
                                to: price,
                                ok: `BIN set to ${usd(price, true)}`,
                              }),
                            )
                          }
                        />
                      </div>
                    ) : null}
                  </motion.div>
                </AnimatePresence>
              ) : (
                <p className="grid min-h-0 flex-1 place-items-center text-[14px] text-[#707070]">
                  No live listings yet.
                </p>
              )}
            </div>

            <div className="flex min-h-0 flex-col bg-white">
              {snap.cartError ? (
                <Link
                  href="/settings#ebay-store"
                  className="flex shrink-0 items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950"
                >
                  {snap.cartError}
                  <ArrowRight className="size-4" />
                </Link>
              ) : null}
              <div className="flex shrink-0 items-center justify-between border-b border-[#eee] px-4 py-2.5">
                <p className="text-[13px] font-semibold tracking-tight text-[#191919]">
                  {active === "opps"
                    ? "Needs a move"
                    : active === "act"
                      ? "Stock alerts"
                      : snap.inCart > 0 && active === "carts"
                        ? "In cart"
                        : "Watching now"}
                </p>
                {active === "opps" && carts.length > 1 ? (
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() =>
                      setPending(
                        offerAllConfirm({
                          listingIds: carts.map((m) => m.listingId),
                          titles: carts.map((m) => m.title),
                          pct: 10,
                          ok: "Offers sent to interested buyers",
                        }),
                      )
                    }
                    className="h-8 rounded-md bg-[#141414] px-3 text-[12px] font-semibold text-white disabled:opacity-50"
                  >
                    {busy === "offer-all" ? "Sending…" : "Offer all carts"}
                  </button>
                ) : null}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {active === "opps" ? (
                  <OpportunityList
                    deals={deals}
                    selectedId={featuredId || null}
                    busy={locked ? busy ?? "pending" : null}
                    onPick={setPickedId}
                    onGo={runRecommend}
                  />
                ) : feed.length === 0 ? (
                  <p className="px-4 py-10 text-[14px] text-[#707070]">
                    Nothing in this view yet.
                  </p>
                ) : (
                  <ul>
                    {feed.slice(0, 16).map((row, i) => (
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
          </div>
        )}
      </div>
      {pending ? (
        <LiveConfirm
          op={pending}
          busy={busy !== null}
          onCancel={() => {
            if (!busy) setPending(null);
          }}
          onAccept={() => {
            void runConfirmed();
          }}
        />
      ) : null}
    </div>
  );
}

function sparkFromOrders(
  rows: Array<{ createdAt: string; amount: number }>,
) {
  if (rows.length < 2) return [] as number[];
  const sorted = [...rows].sort(
    (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt),
  );
  let sum = 0;
  return sorted.map((row) => {
    sum += row.amount;
    return sum;
  });
}

function MiniSpark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const w = 72;
  const h = 22;
  const d = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / (max - min || 1)) * (h - 3) - 1.5;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-1 h-[22px] w-[72px]" aria-hidden>
      <motion.path
        d={d}
        fill="none"
        stroke="#141414"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.15, ease: "easeOut" }}
      />
    </svg>
  );
}

function StatCell({
  label,
  value,
  hint,
  active,
  warn,
  spark,
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  active?: boolean;
  warn?: boolean;
  spark?: number[];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border-b-2 px-3 py-2.5 text-left transition",
        active
          ? "border-[#141414] bg-white"
          : "border-transparent hover:bg-[#fafafa]",
      )}
    >
      <p className="text-[11px] font-medium tracking-wide text-[#707070]">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-[22px] font-semibold tabular-nums tracking-tight",
          warn ? "text-[#c41e3a]" : "text-[#191919]",
        )}
      >
        {value}
      </p>
      {spark && spark.length > 1 ? (
        <div className="mt-1 flex items-end justify-between gap-2">
          <p className="text-[11px] text-[#707070]">{hint}</p>
          <MiniSpark values={spark} />
        </div>
      ) : (
        <p className="text-[11px] text-[#707070]">{hint}</p>
      )}
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
          className="mt-2 h-8 rounded-md bg-[#141414] px-3 text-[12px] font-semibold text-white"
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
