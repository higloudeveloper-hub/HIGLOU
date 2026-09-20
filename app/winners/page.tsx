"use client";

import { AppShell } from "@/components/layout/app-shell";
import { FindWinnersStudio } from "@/components/studio/find-winners-studio";

export default function WinnersPage() {
  // Page scroll — Home keeps the locked live-panel shell.
  return (
    <AppShell hideHeader contentClassName="!p-0">
      <FindWinnersStudio />
    </AppShell>
  );
}
