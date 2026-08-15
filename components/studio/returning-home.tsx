"use client";

import { useEffect, useState } from "react";
import { MoneyMachineHome, type HomeDraft } from "@/components/studio/money-machine-home";
import type { ReadyListing } from "@/components/studio/ready-catalog";

export function ReturningHome({
  name,
  drafts,
  ebayConnected,
  readyListings,
}: {
  name: string | null;
  listingCount: number;
  drafts: HomeDraft[];
  exportsList: unknown[];
  ebayConnected: boolean;
  readyListings?: ReadyListing[];
}) {
  const [storeName, setStoreName] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/ebay/store-name");
        if (!res.ok) return;
        const body = (await res.json()) as { storeName?: string | null };
        if (body.storeName) setStoreName(body.storeName);
      } catch {
        /* optional */
      }
    })();
  }, []);

  return (
    <MoneyMachineHome
      name={name}
      storeName={storeName}
      drafts={drafts}
      readyListings={readyListings}
      ebayConnected={ebayConnected}
    />
  );
}
