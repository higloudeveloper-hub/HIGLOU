"use client";

import { AppShell } from "@/components/layout/app-shell";
import { FindWinnersStudio } from "@/components/studio/find-winners-studio";

export default function WinnersPage() {
  return (
    <AppShell hideHeader flush>
      <FindWinnersStudio />
    </AppShell>
  );
}
