"use client";

import { useEffect, useState } from "react";
import { MoneyMachineHome } from "@/components/studio/money-machine-home";

type ProductRow = {
  id: string;
  title: string;
};

export function ReturningHome({
  name,
  drafts,
  ebayConnected,
}: {
  name: string | null;
  listingCount: number;
  drafts: ProductRow[];
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
      nextDraft={drafts[0] ? { id: drafts[0].id, title: drafts[0].title } : null}
      ebayConnected={ebayConnected}
      setupHref={ebayConnected ? null : "/settings#ebay-store"}
    />
  );
}
