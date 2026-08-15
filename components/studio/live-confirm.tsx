"use client";

import { useEffect } from "react";
import { usd } from "@/lib/studio/use-ebay-sales";
import { cn } from "@/lib/utils";

export type PremiumBody = {
  action: "offer" | "offer_all" | "price";
  listingId?: string;
  listingIds?: string[];
  discountPercentage?: number;
  price?: number;
};

export type LiveConfirmOp = {
  key: string;
  body: PremiumBody;
  ok: string;
  title: string;
  explain: string;
  facts: { label: string; value: string }[];
  confirmLabel: string;
};

export function offerConfirm(opts: {
  listingId: string;
  title: string;
  bin: number | null;
  pct: number;
  ok: string;
}): LiveConfirmOp {
  const offerUsd =
    opts.bin != null
      ? Math.round(opts.bin * (1 - opts.pct / 100) * 100) / 100
      : null;
  return {
    key: `offer-${opts.listingId}`,
    body: {
      action: "offer",
      listingId: opts.listingId,
      discountPercentage: opts.pct,
    },
    ok: opts.ok,
    title: "Send this private offer?",
    explain:
      "eBay will email shoppers who already have this item in their cart a private price. Your public Buy It Now does not change. The offer lasts 2 days and buyers cannot counter.",
    facts: [
      { label: "Listing", value: opts.title || opts.listingId },
      {
        label: "Public BIN",
        value: opts.bin != null ? `US ${usd(opts.bin, true)}` : "Unchanged",
      },
      {
        label: "Private offer",
        value:
          offerUsd != null
            ? `US ${usd(offerUsd, true)} · ${opts.pct}% off`
            : `${opts.pct}% off`,
      },
      { label: "Who sees it", value: "Only people with this item in their cart" },
    ],
    confirmLabel: "Yes, send offer",
  };
}

export function priceConfirm(opts: {
  listingId: string;
  title: string;
  from: number | null;
  to: number;
  ok: string;
}): LiveConfirmOp {
  return {
    key: `price-${opts.listingId}`,
    body: {
      action: "price",
      listingId: opts.listingId,
      price: opts.to,
    },
    ok: opts.ok,
    title: "Change the live Buy It Now?",
    explain:
      "This revises the listing on eBay. Anyone shopping can see and buy at the new public price. It is not a private offer — the old price is replaced.",
    facts: [
      { label: "Listing", value: opts.title || opts.listingId },
      {
        label: "Current BIN",
        value: opts.from != null ? `US ${usd(opts.from, true)}` : "—",
      },
      { label: "New public price", value: `US ${usd(opts.to, true)}` },
    ],
    confirmLabel: "Yes, change price",
  };
}

export function offerAllConfirm(opts: {
  listingIds: string[];
  titles: string[];
  pct: number;
  ok: string;
}): LiveConfirmOp {
  return {
    key: "offer-all",
    body: {
      action: "offer_all",
      listingIds: opts.listingIds,
      discountPercentage: opts.pct,
    },
    ok: opts.ok,
    title: "Offer every cart?",
    explain: `Higlou will send a private ${opts.pct}% offer to shoppers who already have these items in their cart. Public Buy It Now prices stay the same. Each offer lasts 2 days and cannot be countered.`,
    facts: [
      {
        label: "Listings",
        value: `${opts.listingIds.length} item${opts.listingIds.length === 1 ? "" : "s"} in carts`,
      },
      { label: "Discount", value: `${opts.pct}% off each` },
      { label: "Public BIN", value: "Unchanged" },
      ...opts.titles.slice(0, 5).map((title, i) => ({
        label: `Item ${i + 1}`,
        value: title,
      })),
    ],
    confirmLabel: "Yes, send all offers",
  };
}

export function LiveConfirm({
  op,
  busy,
  onCancel,
  onAccept,
}: {
  op: LiveConfirmOp;
  busy: boolean;
  onCancel: () => void;
  onAccept: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div
      className="absolute inset-0 z-40 grid place-items-center bg-[#191919]/45 p-4"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-confirm-title"
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_-24px_rgba(0,0,0,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[#e5e5e5] px-5 py-3">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-[#707070] uppercase">
            Confirm on eBay
          </p>
          <h2
            id="live-confirm-title"
            className="mt-1 text-[17px] font-semibold tracking-tight text-[#191919]"
          >
            {op.title}
          </h2>
        </div>
        <div className="space-y-3 px-5 py-4">
          <p className="text-[13px] leading-relaxed text-[#565959]">{op.explain}</p>
          <dl className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-[#f7f7f7]">
            {op.facts.map((fact) => (
              <div
                key={fact.label}
                className="flex items-start justify-between gap-4 border-b border-[#eee] px-3.5 py-2 last:border-0"
              >
                <dt className="shrink-0 text-[11px] font-semibold tracking-wide text-[#707070] uppercase">
                  {fact.label}
                </dt>
                <dd className="min-w-0 text-right text-[13px] font-medium text-[#191919]">
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="flex gap-2 border-t border-[#e5e5e5] bg-[#f7f7f7] px-5 py-3">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="h-10 flex-1 rounded-md border border-[#ccc] bg-white text-[13px] font-semibold text-[#191919] disabled:opacity-50"
          >
            No, cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onAccept}
            className={cn(
              "h-10 flex-1 rounded-md bg-[#141414] text-[13px] font-semibold text-white disabled:opacity-50",
            )}
          >
            {busy ? "Working…" : op.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
