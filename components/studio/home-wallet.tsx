"use client";

import { Wallet } from "lucide-react";

function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
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
      <div className="hidden min-w-[140px] text-right sm:block">
        <p className="text-[10px] font-medium tracking-[0.14em] text-white/70 uppercase">
          Wallet
        </p>
        <p className="text-[16px] font-semibold tabular-nums tracking-tight">
          {money(available)}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-4 mb-3 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_1px_3px_rgba(15,17,17,0.08)]">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#141414] text-white">
        <Wallet className="size-4" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium tracking-[0.12em] text-[#8a8a8a] uppercase">
          Available
        </p>
        <p className="text-[22px] font-semibold tabular-nums tracking-tight text-[#141414]">
          {money(available)}
        </p>
      </div>
      <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-[#707070]">
        <span className="relative flex size-1.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-[#3665F3]/70" />
          <span className="relative size-1.5 rounded-full bg-[#3665F3]" />
        </span>
        Live
      </span>
    </div>
  );
}
