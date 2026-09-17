"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

/** Sidebar entry for Money Center — hidden when MONEY_ENGINE_ENABLED is off. */
export function MoneyNavLink({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/money/status");
        if (!res.ok) return;
        const body = (await res.json()) as { enabled?: boolean };
        if (!cancelled) setEnabled(Boolean(body.enabled));
      } catch {
        /* keep hidden */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!enabled) return null;

  const active = pathname === "/money" || pathname.startsWith("/money/");
  return (
    <Link
      href="/money"
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors",
        active
          ? "bg-brand-soft text-foreground shadow-xs"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Wallet className="size-4 opacity-80" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">Money Center</span>
        <span className="block text-[11px] text-muted-foreground/80">
          Monetization
        </span>
      </span>
    </Link>
  );
}
