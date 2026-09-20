"use client";

import { AppShell } from "@/components/layout/app-shell";
import { DropMarketStudio } from "@/components/market/drop-market";

export default function MarketPage() {
  return (
    <AppShell hideHeader flush>
      <DropMarketStudio />
    </AppShell>
  );
}
