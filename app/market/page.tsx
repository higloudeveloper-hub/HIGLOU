"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { DropMarketStudio } from "@/components/market/drop-market";

function MarketFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center bg-[#f7f7f7] text-[13px] text-[#8a8a8a]">
      Cargando Market…
    </div>
  );
}

export default function MarketPage() {
  // Page scroll — Home keeps the locked live-panel shell.
  return (
    <AppShell hideHeader contentClassName="!p-0">
      <Suspense fallback={<MarketFallback />}>
        <DropMarketStudio />
      </Suspense>
    </AppShell>
  );
}
