"use client";

import { AppShell } from "@/components/layout/app-shell";
import { StatsControlCenter } from "@/components/studio/stats-control-center";

export default function StatsPage() {
  return (
    <AppShell hideHeader flush>
      <StatsControlCenter />
    </AppShell>
  );
}
