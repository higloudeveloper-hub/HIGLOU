"use client";

import { useCallback, useEffect, useState } from "react";
import {
  emptySalesSnapshot,
  type SalesSnapshot,
} from "@/lib/ebay/sales-sync";

export const SALES_POLL_MS = 12_000;

export function usd(n: number, cents = false) {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  })}`;
}

export function useEbaySales() {
  const [snap, setSnap] = useState<SalesSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/ebay/sales", { cache: "no-store" });
      const body = (await res.json()) as SalesSnapshot;
      setSnap(body);
      setTick((n) => n + 1);
    } catch {
      setSnap(emptySalesSnapshot({ error: "Could not reach eBay sales" }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void reload();
    const t = window.setInterval(() => {
      if (!cancelled) void reload();
    }, SALES_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [reload]);

  return { snap, loading, tick, reload };
}
