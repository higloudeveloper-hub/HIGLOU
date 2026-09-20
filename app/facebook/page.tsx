"use client";

import { AppShell } from "@/components/layout/app-shell";
import { FacebookAdsStudio } from "@/components/facebook/facebook-ads-studio";

export default function FacebookAdsPage() {
  return (
    <AppShell hideHeader flush>
      <FacebookAdsStudio />
    </AppShell>
  );
}
