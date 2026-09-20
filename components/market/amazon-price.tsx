"use client";

import { cn } from "@/lib/utils";

/** Amazon-style price: $33⁹⁹ */
export function AmazonPrice({
  amount,
  className,
  size = "md",
}: {
  amount: number;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const safe = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  const dollars = Math.floor(safe);
  const cents = Math.round((safe - dollars) * 100)
    .toString()
    .padStart(2, "0");
  const sizes = {
    sm: { sym: "text-[11px]", dol: "text-[16px]", cent: "text-[10px]" },
    md: { sym: "text-[12px]", dol: "text-[21px]", cent: "text-[11px]" },
    lg: { sym: "text-[14px]", dol: "text-[28px]", cent: "text-[13px]" },
  }[size];

  return (
    <span
      className={cn(
        "inline-flex items-start font-semibold tabular-nums text-[#0f1111]",
        className,
      )}
    >
      <span className={cn("mt-[2px] leading-none", sizes.sym)}>$</span>
      <span className={cn("leading-none tracking-tight", sizes.dol)}>
        {dollars}
      </span>
      <span className={cn("mt-[1px] leading-none", sizes.cent)}>{cents}</span>
    </span>
  );
}

export function dealOffPercent(buy: number, sell: number, comps?: number) {
  const from = comps != null && comps > sell ? comps : buy > 0 && sell > buy ? sell : null;
  const to = comps != null && comps > sell ? sell : buy;
  if (from == null || from <= 0 || to <= 0 || to >= from) return null;
  return Math.round(((from - to) / from) * 100);
}
