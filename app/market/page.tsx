"use client";

import { AppShell } from "@/components/layout/app-shell";
import { DropMarketStudio } from "@/components/market/drop-market";

export default function MarketPage() {
  // Page scroll — Home keeps the locked live-panel shell.
  return (
    <AppShell hideHeader contentClassName="!p-0">
      <DropMarketStudio />
    </AppShell>
  );
}
