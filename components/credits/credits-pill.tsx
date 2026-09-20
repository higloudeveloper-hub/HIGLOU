"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Coins, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function CreditsPill({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/credits", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as {
        wallet?: { balance?: number };
      };
      setBalance(Number(body.wallet?.balance) || 0);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  return (
    <Link
      href="/credits"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-[#f0d78a] bg-[linear-gradient(135deg,#fff8e1,#ffe08a)] px-2.5 py-1.5 text-[12px] font-bold text-[#5c4813] shadow-[0_1px_0_rgba(255,255,255,0.7)_inset] transition hover:brightness-[1.03]",
        className,
      )}
      title="Tus créditos"
    >
      {loading ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Coins className="size-3.5 text-[#c8920a]" />
      )}
      <span className="tabular-nums">
        {loading ? "…" : balance ?? 0}
      </span>
      {!compact ? <span className="font-semibold opacity-70">créditos</span> : null}
    </Link>
  );
}
