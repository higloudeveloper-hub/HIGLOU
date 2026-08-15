"use client";

import { BadgeCheck } from "lucide-react";

function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function HomeWallet({
  available,
  compact = false,
}: {
  available: number;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="hidden min-w-[128px] text-right sm:block">
        <p className="text-[11px] text-white/70">Available</p>
        <p className="text-[15px] font-medium tabular-nums tracking-tight">
          {money(available)}
        </p>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-b border-[#e5e5e5] bg-white px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] text-[#707070]">Available balance</p>
        <span className="inline-flex items-center gap-1 text-[12px] text-[#141414]">
          <BadgeCheck className="size-3.5" strokeWidth={1.75} />
          Verified
        </span>
      </div>
      <p className="mt-1 text-[28px] font-medium tabular-nums tracking-tight text-[#141414] leading-none">
        {money(available)}
      </p>
      <p className="mt-2 text-[12px] text-[#8a8a8a]">
        USD · Higlou business payouts · ••2048
      </p>
    </div>
  );
}
