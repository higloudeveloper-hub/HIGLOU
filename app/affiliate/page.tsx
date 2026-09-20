"use client";

import { AppShell } from "@/components/layout/app-shell";
import { AffiliateStudio } from "@/components/affiliate/affiliate-studio";

export default function AffiliatePage() {
  return (
    <AppShell hideHeader flush>
      <AffiliateStudio />
    </AppShell>
  );
}
