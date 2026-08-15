"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { usd } from "@/lib/studio/use-ebay-sales";
import { cn } from "@/lib/utils";
import type { DealCard } from "@/lib/ebay/sales-sync";

export function offerFromUsd(bin: number, offer: number) {
  const pct = Math.round((1 - offer / bin) * 100);
  const clamped = Math.min(20, Math.max(5, pct));
  const usdOut = Math.round(bin * (1 - clamped / 100) * 100) / 100;
  return { pct: clamped, usd: usdOut, requestedPct: pct };
}

function hiRes(url: string | null | undefined) {
  if (!url) return "";
  return url
    .replace(/s-l\d+/gi, "s-l500")
    .replace(/\$_\d+/g, "$_57")
    .replace(/^http:\/\//i, "https://");
}

const SIGNAL: Record<
  DealCard["signal"],
  { label: string; className: string; section: string }
> = {
  close_now: {
    label: "Close now",
    className: "bg-[#3665F3] text-white",
    section: "Close now",
  },
  stuck: {
    label: "Price block",
    className: "bg-[#F5AF02] text-[#191919]",
    section: "Price is blocking the sale",
  },
  hot: {
    label: "Hot",
    className: "bg-[#E53238] text-white",
    section: "Hot right now",
  },
  priced_right: {
    label: "Selling",
    className: "bg-[#86B817] text-white",
    section: "Already selling",
  },
  sleeping: {
    label: "Quiet",
    className: "bg-[#eee] text-[#707070]",
    section: "Quiet — one tap to wake up",
  },
};

const SECTION_ORDER: DealCard["signal"][] = [
  "close_now",
  "stuck",
  "hot",
  "priced_right",
  "sleeping",
];

export function recommendCopy(deal: DealCard) {
  const rec = deal.recommend;
  if (rec.kind === "offer" && rec.price != null) {
    return {
      button: `Send ${usd(rec.price, true)} offer`,
      hint: `${rec.pct}% off · chance ${deal.chance}% → ${rec.afterChance}%`,
    };
  }
  if (rec.kind === "drop" && rec.price != null) {
    return {
      button: `Drop to ${usd(rec.price, true)}`,
      hint: `${rec.pct}% off · chance ${deal.chance}% → ${rec.afterChance}%`,
    };
  }
  return {
    button: "Keep this price",
    hint: deal.move || "Not enough data to cut the BIN.",
  };
}

export function ChanceMeter({
  chance,
  next,
  big = false,
}: {
  chance: number;
  next?: number;
  big?: boolean;
}) {
  const fill =
    chance >= 70 ? "#3665F3" : chance >= 40 ? "#F5AF02" : "#c41e3a";
  return (
    <div className={cn(big ? "space-y-1.5" : "space-y-0.5")}>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={cn(
            "font-semibold tabular-nums tracking-tight",
            big ? "text-[40px] leading-none text-[#191919]" : "text-[15px]",
          )}
          style={big ? undefined : { color: fill }}
        >
          {chance}%
          {next != null && next > chance ? (
            <span className="ml-1 text-[13px] font-semibold text-[#86B817]">
              → {next}%
            </span>
          ) : null}
        </span>
        <span className="text-[11px] font-medium text-[#707070]">
          chance to sell
        </span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-[#eee]">
        {next != null && next > chance ? (
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-[#86B817]/30"
            style={{ width: `${next}%` }}
          />
        ) : null}
        <motion.div
          className="relative h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${chance}%` }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          style={{ background: fill }}
        />
      </div>
    </div>
  );
}

function PriceDrop({
  from,
  to,
}: {
  from: number | null;
  to: number | null;
}) {
  if (from == null) return null;
  if (to == null || to >= from) {
    return (
      <p className="text-[18px] font-semibold tabular-nums text-[#191919]">
        <span className="text-[11px] font-semibold">US </span>
        {usd(from, true)}
      </p>
    );
  }
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[13px] font-semibold text-[#707070] line-through decoration-[#E53238] tabular-nums">
        {usd(from, true)}
      </span>
      <AnimatePresence mode="wait">
        <motion.span
          key={to}
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-[18px] font-semibold tabular-nums text-[#E53238]"
        >
          {usd(to, true)}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

export function OneClickMove({
  deal,
  busy,
  onGo,
  large = false,
}: {
  deal: DealCard;
  busy: string | null;
  onGo: (deal: DealCard) => void;
  large?: boolean;
}) {
  const copy = recommendCopy(deal);
  const locked = busy !== null;
  const working =
    busy === `offer-${deal.listingId}` || busy === `price-${deal.listingId}`;
  if (deal.recommend.kind === "keep") {
    return (
      <p className="text-[12px] font-medium text-[#86B817]">{copy.hint}</p>
    );
  }
  return (
    <div className={large ? "space-y-1.5" : "space-y-1"}>
      <button
        type="button"
        disabled={locked}
        onClick={(e) => {
          e.stopPropagation();
          onGo(deal);
        }}
        className={cn(
          "rounded-full bg-[#3665F3] font-semibold text-white disabled:opacity-50",
          large
            ? "h-12 w-full text-[15px]"
            : "h-8 px-3 text-[12px]",
        )}
      >
        {working ? "Working…" : copy.button}
      </button>
      <p className="text-[11px] text-[#707070]">{copy.hint}</p>
    </div>
  );
}

export function DealDesk({
  listingId,
  price,
  canOffer,
  busy,
  onOffer,
  onDrop,
}: {
  listingId: string;
  price: number | null;
  canOffer: boolean;
  busy: string | null;
  onOffer: (pct: number, label: string) => void;
  onDrop: (price: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [offer, setOffer] = useState("");
  const [bin, setBin] = useState(price != null ? String(price) : "");

  useEffect(() => {
    setOffer("");
    setBin(price != null ? String(price) : "");
  }, [listingId, price]);

  const offerNum = Number(offer);
  const binNum = Number(bin);
  const derived =
    price && Number.isFinite(offerNum) && offerNum > 0
      ? offerFromUsd(price, offerNum)
      : null;
  const locked = busy !== null;

  return (
    <div className="rounded-xl bg-white ring-1 ring-[#e5e5e5]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[12px] font-semibold text-[#191919]"
      >
        Set my own price
        <span className="text-[#707070]">{open ? "−" : "+"}</span>
      </button>
      {open ? (
        <div className="space-y-3 border-t border-[#eee] px-3 py-3">
          {canOffer ? (
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-[#707070] uppercase">
                Your offer
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {[5, 10, 15, 20].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    disabled={!price || locked}
                    onClick={() =>
                      setOffer((price! * (1 - pct / 100)).toFixed(2))
                    }
                    className="h-7 rounded-full border border-[#111]/12 px-2.5 text-[11px] font-semibold text-[#191919] disabled:opacity-40"
                  >
                    {pct}%
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-1.5">
                <label className="flex h-10 min-w-0 flex-1 items-center gap-1 rounded-lg border border-[#ccc] bg-[#f7f7f7] px-2.5 text-[14px]">
                  <span className="font-semibold text-[#707070]">$</span>
                  <input
                    inputMode="decimal"
                    value={offer}
                    disabled={locked}
                    onChange={(e) =>
                      setOffer(e.target.value.replace(/[^\d.]/g, ""))
                    }
                    placeholder={price ? (price * 0.9).toFixed(2) : "your price"}
                    className="min-w-0 flex-1 bg-transparent font-semibold tabular-nums outline-none"
                  />
                </label>
                <button
                  type="button"
                  disabled={locked || !derived}
                  onClick={() => {
                    if (!derived) return;
                    onOffer(
                      derived.pct,
                      `Offer sent · ${usd(derived.usd, true)} (${derived.pct}% off)`,
                    );
                  }}
                  className="h-10 shrink-0 rounded-full bg-[#3665F3] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
                >
                  {busy === `offer-${listingId}` ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          ) : null}
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-[#707070] uppercase">
              Your BIN
            </p>
            <div className="mt-1.5 flex gap-1.5">
              <label className="flex h-10 min-w-0 flex-1 items-center gap-1 rounded-lg border border-[#ccc] bg-[#f7f7f7] px-2.5 text-[14px]">
                <span className="font-semibold text-[#707070]">$</span>
                <input
                  inputMode="decimal"
                  value={bin}
                  disabled={locked}
                  onChange={(e) => setBin(e.target.value.replace(/[^\d.]/g, ""))}
                  placeholder="your price"
                  className="min-w-0 flex-1 bg-transparent font-semibold tabular-nums outline-none"
                />
              </label>
              <button
                type="button"
                disabled={locked || !Number.isFinite(binNum) || binNum < 1}
                onClick={() => {
                  const next = Math.round(binNum * 100) / 100;
                  if (next < 1) {
                    toast.error("Price must be at least $1.00");
                    return;
                  }
                  onDrop(next);
                }}
                className="h-10 shrink-0 rounded-full border border-[#111] bg-white px-4 text-[13px] font-semibold text-[#111] disabled:opacity-50"
              >
                {busy === `price-${listingId}` ? "Updating…" : "Set price"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function OpportunityList({
  deals,
  selectedId,
  busy,
  onPick,
  onGo,
}: {
  deals: DealCard[];
  selectedId: string | null;
  busy: string | null;
  onPick: (listingId: string) => void;
  onGo: (deal: DealCard) => void;
}) {
  if (deals.length === 0) {
    return (
      <p className="px-4 py-10 text-[14px] text-[#707070]">
        No live opportunities yet.
      </p>
    );
  }
  return (
    <div>
      {SECTION_ORDER.map((signal) => {
        const rows = deals.filter((row) => row.signal === signal);
        if (rows.length === 0) return null;
        return (
          <section key={signal}>
            <p className="sticky top-0 z-10 border-b border-[#eee] bg-[#f7f7f7] px-4 py-2 text-[11px] font-semibold tracking-wide text-[#707070] uppercase">
              {SIGNAL[signal].section}
            </p>
            <ul>
              {rows.map((deal) => {
                const tone = SIGNAL[deal.signal];
                const selected = deal.listingId === selectedId;
                const next =
                  deal.recommend.kind === "keep"
                    ? undefined
                    : deal.recommend.price;
                return (
                  <li key={deal.listingId}>
                    <div
                      className={cn(
                        "flex gap-3 border-b border-[#eee] px-4 py-3 transition",
                        selected ? "bg-[#eef4ff]" : "hover:bg-[#f7f7f7]",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => onPick(deal.listingId)}
                        className="size-[92px] shrink-0 overflow-hidden rounded-md bg-white ring-1 ring-[#e5e5e5]"
                      >
                        {hiRes(deal.pictureUrl) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={hiRes(deal.pictureUrl)}
                            alt=""
                            className="size-full object-contain p-1.5"
                          />
                        ) : (
                          <span className="grid size-full place-items-center text-[18px] font-semibold text-[#bbb]">
                            {(deal.title[0] || "?").toUpperCase()}
                          </span>
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => onPick(deal.listingId)}
                          className="w-full text-left"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="line-clamp-2 text-[13px] leading-snug text-[#191919]">
                              {deal.title}
                            </p>
                            <span
                              className={cn(
                                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                tone.className,
                              )}
                            >
                              {tone.label}
                            </span>
                          </div>
                          <div className="mt-1">
                            <PriceDrop from={deal.price} to={next ?? null} />
                          </div>
                          <div className="mt-1.5">
                            <ChanceMeter
                              chance={deal.chance}
                              next={
                                deal.recommend.kind === "keep"
                                  ? undefined
                                  : deal.recommend.afterChance
                              }
                            />
                          </div>
                          <p className="mt-1 line-clamp-2 text-[11px] text-[#707070]">
                            {deal.why}
                          </p>
                          {deal.evidence ? (
                            <p className="mt-0.5 line-clamp-1 text-[10px] text-[#9b9b9b]">
                              {deal.evidence}
                            </p>
                          ) : null}
                        </button>
                        <div className="mt-2">
                          <OneClickMove
                            deal={deal}
                            busy={busy}
                            onGo={onGo}
                          />
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function LiveBanner({
  shop,
  deals,
  watching,
  inCart,
  syncedAt,
}: {
  shop: string;
  deals: DealCard[];
  watching: number;
  inCart: number;
  syncedAt: string;
}) {
  const tape = deals.length > 0 ? [...deals, ...deals] : [];
  const next = deals[0];
  return (
    <div className="shrink-0 bg-[#3665F3] text-white">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <div className="flex shrink-0 items-center gap-2">
          <span className="relative flex size-2.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-white/80" />
            <span className="relative size-2.5 rounded-full bg-white" />
          </span>
          <p className="text-[13px] font-bold tracking-tight">LIVE MACHINE</p>
        </div>
        <p className="hidden shrink-0 text-[12px] text-white/85 lg:block">
          {shop}
        </p>
        <div className="min-w-0 flex-1 overflow-hidden">
          {tape.length > 0 ? (
            <motion.div
              className="flex w-max gap-10 whitespace-nowrap"
              animate={{ x: ["0%", "-50%"] }}
              transition={{ duration: 32, repeat: Infinity, ease: "linear" }}
            >
              {tape.map((deal, i) => (
                <span
                  key={`${deal.listingId}-${i}`}
                  className="text-[13px] font-medium"
                >
                  {deal.title.slice(0, 48)}
                  <span className="mx-2 text-white/55">·</span>
                  {recommendCopy(deal).button}
                  <span className="mx-2 text-white/55">·</span>
                  {deal.chance}% chance
                </span>
              ))}
            </motion.div>
          ) : (
            <p className="truncate text-[13px] text-white/85">
              Scanning eBay carts, watchers, and prices…
            </p>
          )}
        </div>
        <p className="hidden shrink-0 text-[12px] font-medium text-white/90 sm:block">
          {watching} watching · {inCart} in cart
          {next ? ` · next: ${recommendCopy(next).button}` : ""}
        </p>
        <p className="hidden shrink-0 text-[11px] text-white/70 xl:block">
          {formatRelativeTime(syncedAt)}
        </p>
      </div>
    </div>
  );
}
