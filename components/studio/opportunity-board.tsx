"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
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
  { label: string; className: string }
> = {
  close_now: {
    label: "Close now",
    className: "bg-[#3665F3] text-white",
  },
  hot: {
    label: "Hot",
    className: "bg-[#E53238] text-white",
  },
  stuck: {
    label: "Price block",
    className: "bg-[#F5AF02] text-[#191919]",
  },
  priced_right: {
    label: "Selling",
    className: "bg-[#86B817] text-white",
  },
  sleeping: {
    label: "Quiet",
    className: "bg-[#eee] text-[#707070]",
  },
};

export function ChanceMeter({
  chance,
  big = false,
}: {
  chance: number;
  big?: boolean;
}) {
  const fill =
    chance >= 70 ? "#3665F3" : chance >= 40 ? "#F5AF02" : "#c41e3a";
  return (
    <div className={cn(big ? "space-y-1" : "space-y-0.5")}>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={cn(
            "font-semibold tabular-nums tracking-tight",
            big ? "text-[40px] leading-none text-[#191919]" : "text-[15px]",
          )}
          style={big ? undefined : { color: fill }}
        >
          {chance}%
        </span>
        <span className="text-[11px] font-medium text-[#707070]">
          chance to sell
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#eee]">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${chance}%`, background: fill }}
        />
      </div>
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
    <div className="space-y-3 rounded-xl bg-white p-3 ring-1 ring-[#e5e5e5]">
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
                onChange={(e) => setOffer(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder={
                  price ? (price * 0.9).toFixed(2) : "your price"
                }
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
          {derived ? (
            <p className="mt-1.5 text-[11px] text-[#707070]">
              {derived.requestedPct < 5 || derived.requestedPct > 20
                ? `eBay private offers are 5–20% · sends as ${usd(derived.usd, true)}`
                : `Buyer pays ${usd(derived.usd, true)} · ${derived.pct}% off`}
            </p>
          ) : (
            <p className="mt-1.5 text-[11px] text-[#707070]">
              Type the dollar amount you want the buyer to pay.
            </p>
          )}
        </div>
      ) : (
        <p className="text-[12px] text-[#707070]">
          No cart yet. Set the BIN you want — eBay only lets you send a private
          offer when someone has it in a cart.
        </p>
      )}

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
              if (
                !window.confirm(`Set this listing to ${usd(next, true)} on eBay?`)
              ) {
                return;
              }
              onDrop(next);
            }}
            className="h-10 shrink-0 rounded-full border border-[#111] bg-white px-4 text-[13px] font-semibold text-[#111] disabled:opacity-50"
          >
            {busy === `price-${listingId}` ? "Updating…" : "Set price"}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-[#707070]">
          This is the live Buy It Now on eBay — any number you want.
        </p>
      </div>
    </div>
  );
}

export function OpportunityList({
  deals,
  selectedId,
  onPick,
}: {
  deals: DealCard[];
  selectedId: string | null;
  onPick: (listingId: string) => void;
}) {
  if (deals.length === 0) {
    return (
      <p className="px-4 py-10 text-[14px] text-[#707070]">
        No live opportunities yet.
      </p>
    );
  }
  return (
    <ul>
      {deals.map((deal) => {
        const tone = SIGNAL[deal.signal];
        const selected = deal.listingId === selectedId;
        return (
          <li key={deal.listingId}>
            <button
              type="button"
              onClick={() => onPick(deal.listingId)}
              className={cn(
                "flex w-full gap-3 border-b border-[#eee] px-4 py-3 text-left transition",
                selected ? "bg-[#eef4ff]" : "hover:bg-[#f7f7f7]",
              )}
            >
              <div className="size-[92px] shrink-0 overflow-hidden rounded-md bg-white ring-1 ring-[#e5e5e5]">
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
              </div>
              <div className="min-w-0 flex-1">
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
                {deal.price != null ? (
                  <p className="mt-1 text-[18px] font-semibold tabular-nums text-[#191919]">
                    <span className="text-[11px] font-semibold">US </span>
                    {usd(deal.price, true)}
                  </p>
                ) : null}
                <div className="mt-1.5">
                  <ChanceMeter chance={deal.chance} />
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] text-[#707070]">
                  {deal.why}
                  {deal.vsStore === "lower" ? " · priced lower" : ""}
                  {deal.vsStore === "higher" ? " · priced high" : ""}
                </p>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
