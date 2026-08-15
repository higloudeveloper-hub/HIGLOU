"use client";

import { useEffect, useState } from "react";
import { MoneyMachineHome, type HomeDraft } from "@/components/studio/money-machine-home";

export function ReturningHome({
  name,
  drafts,
  ebayConnected,
}: {
  name: string | null;
  listingCount: number;
  drafts: HomeDraft[];
  exportsList: unknown[];
  ebayConnected: boolean;
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
      ebayConnected={ebayConnected}
    />
  );
}
