"use client";

import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { VariationPicker } from "@/components/listing/variation-picker";
import {
  variationCounts,
  variationSummary,
  type ListingVariationSet,
} from "@/lib/listing/variations";

export type BatchPriceItem = {
  id: string;
  title: string;
  imageUrl: string;
  store: "amazon" | "homedepot";
  sourcePrice: number | null;
  ebayPrice: number | null;
  status: "ready" | "publishing" | "live" | "error";
  error?: string;
  listingId?: string;
  ebayUrl?: string;
  variationCount?: number;
  variations?: ListingVariationSet | null;
};

export function BatchPricePublish({
  items,
  busy,
  progress,
  onPriceChange,
  onVariationsChange,
  onPublish,
  onClose,
}: {
  items: BatchPriceItem[];
  busy: boolean;
  progress?: string;
  onPriceChange: (id: string, price: number | null) => void;
  onVariationsChange?: (id: string, set: ListingVariationSet) => void;
  onPublish: () => void;
  onClose: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const ready = items.filter((row) => row.status !== "error");
  const priced = ready.filter((row) => row.ebayPrice && row.ebayPrice > 0);
  const live = items.filter((row) => row.status === "live").length;
  const canPublish =
    !busy && priced.length === ready.length && ready.length > 0 && live < ready.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="shrink-0 border-b border-[#e5e5e5] px-4 py-4">
        <p className="text-[15px] font-medium tracking-tight text-[#141414]">
          Set eBay prices, then they go live
        </p>
        <p className="mt-0.5 text-[13px] text-[#707070]">
          Higlou found every Amazon option. Open a product to uncheck colors
          or sizes you are not stocking.
        </p>
        {progress ? (
          <p className="mt-2 inline-flex items-center gap-2 text-[13px] text-[#141414]">
            <Loader2 className="size-3.5 animate-spin" />
            {progress}
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {items.map((row) => {
          const set = row.variations;
          const counts = variationCounts(set);
          const open = openId === row.id;
          return (
            <div key={row.id} className="border-b border-[#eee]">
              <div className="flex items-center gap-3 px-4 py-3">
                {row.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.imageUrl}
                    alt=""
                    className="size-14 shrink-0 bg-[#f6f6f6] object-contain"
                  />
                ) : (
                  <div className="size-14 shrink-0 bg-[#f6f6f6]" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-[#141414]">
                    {row.title || "Imported product"}
                  </p>
                  <p className="mt-0.5 text-[12px] text-[#707070]">
                    {row.store === "amazon" ? "Amazon" : "Home Depot"}
                    {set && counts.total >= 2
                      ? ` · ${variationSummary(set)}`
                      : row.variationCount && row.variationCount >= 2
                        ? ` · ${row.variationCount} variations`
                        : ""}
                    {row.sourcePrice ? ` · cost ${money(row.sourcePrice)}` : ""}
                    {row.status === "live" ? " · Live on eBay" : ""}
                    {row.status === "error" && row.error ? ` · ${row.error}` : ""}
                  </p>
                  {set && counts.total >= 2 && onVariationsChange ? (
                    <button
                      type="button"
                      disabled={busy || row.status === "live"}
                      onClick={() => setOpenId(open ? null : row.id)}
                      className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-[#141414]"
                    >
                      {open ? "Hide options" : "Choose options"}
                      <ChevronDown
                        className={cn("size-3.5", open && "rotate-180")}
                      />
                    </button>
                  ) : null}
                </div>
                <label className="flex shrink-0 items-center gap-1.5">
                  <span className="text-[11px] font-medium text-[#707070]">USD</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    disabled={busy || row.status === "live"}
                    value={row.ebayPrice ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        onPriceChange(row.id, null);
                        return;
                      }
                      const next = Number(raw);
                      onPriceChange(row.id, Number.isFinite(next) ? next : null);
                    }}
                    className={cn(
                      "h-10 w-[96px] border border-[#ccc] bg-white px-2 text-[14px] font-medium outline-none focus:border-[#141414]",
                      row.status === "error" && "border-destructive",
                    )}
                  />
                </label>
              </div>
              {open && set && onVariationsChange ? (
                <div className="border-t border-[#f2f2f2] bg-[#fafafa] px-4 py-3">
                  <VariationPicker
                    set={set}
                    compact
                    disabled={busy || row.status === "live"}
                    onChange={(next) => onVariationsChange(row.id, next)}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t border-[#e5e5e5] px-4 py-3">
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="h-11 px-4 text-[14px] font-medium text-[#707070]"
        >
          {live ? "Done" : "Cancel"}
        </button>
        <span className="min-w-0 flex-1 truncate text-[12px] text-[#707070]">
          {live
            ? `${live} live on eBay`
            : `${priced.length} of ${ready.length} priced`}
        </span>
        <button
          type="button"
          disabled={!canPublish}
          onClick={onPublish}
          className="h-11 bg-[#141414] px-5 text-[14px] font-medium text-white disabled:opacity-40"
        >
          {busy ? "Publishing…" : `Publish ${ready.length} on eBay`}
        </button>
      </div>
    </div>
  );
}

function money(value: number) {
  return `$${value.toFixed(2)}`;
}
