"use client";

import { useMemo } from "react";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  applyVariantSelection,
  isVariantSelected,
  variationCounts,
  type ListingVariationSet,
} from "@/lib/listing/variations";
import type { ListingVariation } from "@/types/product";

const SIZE_RANK: Record<string, number> = {
  xxs: 0,
  xs: 1,
  s: 2,
  small: 2,
  m: 3,
  medium: 3,
  l: 4,
  large: 4,
  xl: 5,
  xxl: 6,
  "2xl": 6,
  xxxl: 7,
  "3xl": 7,
  "1x": 8,
  "2x": 9,
  "3x": 10,
  "4x": 11,
  "5x": 12,
};

function sizeRank(value: string): number {
  const key = value.trim().toLowerCase().replace(/\s+/g, "");
  if (key in SIZE_RANK) return SIZE_RANK[key]!;
  const n = Number(key.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? 40 + n : 80;
}

function sortAxisValues(values: string[]): string[] {
  return [...values].sort((a, b) => {
    const diff = sizeRank(a) - sizeRank(b);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
}

export function VariationPicker({
  set,
  onChange,
  compact = false,
  disabled = false,
}: {
  set: ListingVariationSet;
  onChange: (next: ListingVariationSet) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  const groupAxis = set.axisNames[0] || "Option";
  const chipAxis =
    set.axisNames.find((name) => name !== groupAxis) || "";
  const { total, selected } = variationCounts(set);

  const groups = useMemo(() => {
    const map = new Map<string, ListingVariation[]>();
    for (const variant of set.variants) {
      const key = String(variant.aspects[groupAxis] || "Other").trim() || "Other";
      const list = map.get(key) || [];
      list.push(variant);
      map.set(key, list);
    }
    return [...map.entries()].map(([name, variants]) => ({
      name,
      variants,
      imageUrl: variants.find((row) => row.imageUrls[0])?.imageUrls[0] || "",
      selectedCount: variants.filter(isVariantSelected).length,
    }));
  }, [groupAxis, set.variants]);

  const toggleAsin = (asin: string, next: boolean) => {
    const selectedAsins = set.variants
      .filter((row) => (row.asin === asin ? next : isVariantSelected(row)))
      .map((row) => row.asin);
    onChange(applyVariantSelection(set, selectedAsins));
  };

  const toggleGroup = (name: string, next: boolean) => {
    const selectedAsins = set.variants
      .filter((row) => {
        const group = String(row.aspects[groupAxis] || "Other").trim() || "Other";
        if (group === name) return next;
        return isVariantSelected(row);
      })
      .map((row) => row.asin);
    onChange(applyVariantSelection(set, selectedAsins));
  };

  return (
    <div className={cn("space-y-3", compact && "space-y-2")}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[15px] font-medium tracking-tight text-[#141414]">
            Options for your store
          </p>
          <p className="mt-0.5 text-[13px] text-[#707070]">
            Amazon has {total}. {selected} will go live on eBay
            {chipAxis ? ` as ${groupAxis.toLowerCase()} × ${chipAxis.toLowerCase()}` : ""}.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              onChange(applyVariantSelection(set, set.variants.map((row) => row.asin)))
            }
            className="text-[12px] font-medium text-[#141414] underline-offset-2 hover:underline disabled:opacity-40"
          >
            All
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(applyVariantSelection(set, []))}
            className="text-[12px] font-medium text-[#707070] underline-offset-2 hover:underline disabled:opacity-40"
          >
            None
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {groups.map((group) => {
          const allOn = group.selectedCount === group.variants.length;
          const chipValues = chipAxis
            ? sortAxisValues([
                ...new Set(
                  group.variants
                    .map((row) => String(row.aspects[chipAxis] || "").trim())
                    .filter(Boolean),
                ),
              ])
            : [];
          return (
            <div
              key={group.name}
              className={cn(
                "rounded-xl border border-[#e8e8e8] bg-white p-3",
                group.selectedCount === 0 && "opacity-70",
              )}
            >
              <div className="flex items-center gap-3">
                {group.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={group.imageUrl}
                    alt=""
                    className="size-12 shrink-0 rounded-lg bg-[#f6f6f6] object-contain"
                  />
                ) : (
                  <div className="size-12 shrink-0 rounded-lg bg-[#f6f6f6]" />
                )}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleGroup(group.name, !allOn)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                      allOn
                        ? "border-[#141414] bg-[#f4c928] text-[#141414]"
                        : "border-[#ccc] bg-white",
                    )}
                  >
                    {allOn ? <Check className="size-3" /> : null}
                  </span>
                  <span className="truncate text-[14px] font-medium text-[#141414]">
                    {group.name}
                  </span>
                  <span className="shrink-0 text-[12px] text-[#707070]">
                    {group.selectedCount}/{group.variants.length}
                  </span>
                </button>
              </div>

              {chipAxis && chipValues.length ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5 pl-[60px]">
                  {chipValues.map((value) => {
                    const match = group.variants.find(
                      (row) => String(row.aspects[chipAxis] || "").trim() === value,
                    );
                    if (!match) return null;
                    const on = isVariantSelected(match);
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={disabled}
                        aria-pressed={on}
                        onClick={() => toggleAsin(match.asin, !on)}
                        className={cn(
                          "h-8 min-w-9 rounded-lg border px-2.5 text-[12px] font-medium",
                          on
                            ? "border-[#141414] bg-[#f4c928] text-[#141414]"
                            : "border-[#ddd] bg-white text-[#707070] hover:border-[#141414]",
                        )}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="text-[12px] text-[#707070]">
        {selected >= 2
          ? "eBay will show a dropdown for the options you keep."
          : "Pick two or more for a dropdown. One option lists as a single item."}
      </p>
    </div>
  );
}

export function VariationPickerDialog({
  open,
  set,
  onChange,
  onConfirm,
}: {
  open: boolean;
  set: ListingVariationSet | null;
  onChange: (next: ListingVariationSet) => void;
  onConfirm: () => void;
}) {
  if (!set) return null;
  const { selected, total } = variationCounts(set);
  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[min(92vh,720px)] w-[min(96vw,34rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <DialogHeader className="shrink-0 border-b border-[#eee] px-5 py-4 text-left">
          <DialogTitle className="text-[17px] font-medium tracking-tight">
            Choose what goes to your store
          </DialogTitle>
          <DialogDescription className="text-[13px] text-[#707070]">
            Higlou found every Amazon color and size. Uncheck anything you are
            not stocking yet.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <VariationPicker set={set} onChange={onChange} />
        </div>
        <DialogFooter className="sm:justify-between">
          <p className="text-[12px] text-[#707070]">
            {selected} of {total} selected
          </p>
          <button
            type="button"
            onClick={onConfirm}
            className="h-10 rounded-lg bg-[#f4c928] px-4 text-[13px] font-semibold text-[#141414]"
          >
            {selected >= 2
              ? `Use ${selected} options`
              : selected === 1
                ? "List this one"
                : "Continue without options"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
