"use client";

import { AppShell } from "@/components/layout/app-shell";
import { DropMarketStudio } from "@/components/market/drop-market";

export default function MarketPage() {
  return (
    <AppShell hideHeader>
      <div className="-mx-5 -mt-6 sm:-mx-10 sm:-mt-10">
        <DropMarketStudio />
      </div>
    </AppShell>
  );
}
