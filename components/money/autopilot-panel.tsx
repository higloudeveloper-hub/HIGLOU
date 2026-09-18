"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Power } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AutopilotAction, AutopilotCycleResult } from "@/lib/monetization/autopilot";

const PILOT_KEY = "higlou.autopilot.on";

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

/**
 * One-switch Money Machine control.
 * ON = ready to run ranking cycles. Run = execute one safe autopilot pass.
 */
export function AutopilotPanel() {
  const [on, setOn] = useState(false);
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AutopilotCycleResult | null>(null);
  const [emptyHint, setEmptyHint] = useState<string | null>(null);

  useEffect(() => {
    try {
      setOn(localStorage.getItem(PILOT_KEY) === "1");
    } catch {
      /* ignore */
    }
    void (async () => {
      try {
        const res = await fetch("/api/money/autopilot");
        if (!res.ok) return;
        const body = (await res.json()) as { enabled?: boolean };
        setAvailable(Boolean(body.enabled));
      } catch {
        /* off */
      }
    })();
  }, []);

  const toggle = (next: boolean) => {
    setOn(next);
    try {
      localStorage.setItem(PILOT_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
    toast.message(
      next
        ? "Autopilot armed — press Run cycle to rank money opportunities"
        : "Autopilot off",
    );
  };

  const runCycle = useCallback(async () => {
    if (!on || busy) return;
    setBusy(true);
    setEmptyHint(null);
    try {
      const res = await fetch("/api/money/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "suggest_only",
          limit: 12,
          opportunityMode: "amazon_to_ebay",
        }),
      });
      const body = (await res.json()) as AutopilotCycleResult & {
        error?: string;
        emptyHint?: string | null;
        ok?: boolean;
      };
      if (!res.ok) {
        toast.error(body.error || "Autopilot cycle failed");
        return;
      }
      setResult(body);
      setEmptyHint(body.emptyHint || null);
      toast.success(
        body.queued
          ? `Autopilot queued ${body.queued} money actions`
          : "Autopilot ran — no strong actions yet",
      );
    } catch {
      toast.error("Autopilot cycle failed");
    } finally {
      setBusy(false);
    }
  }, [on, busy]);

  if (!available) return null;

  return (
    <section className="overflow-hidden rounded-3xl border border-border/80 bg-[#141414] text-white shadow-xs">
      <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-[#f4c928] uppercase">
            Money Machine
          </p>
          <h2 className="mt-1 font-display text-3xl tracking-tight sm:text-4xl">
            Piloto automático
          </h2>
          <p className="mt-2 text-sm text-white/70">
            Un interruptor. Higlou busca oportunidades en los mercados que ya
            tienes (Amazon → eBay y ledger), las ordena por dinero, y te deja la
            cola lista. No compra ni publica solo — todavía aprende contigo.
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          <button
            type="button"
            onClick={() => toggle(!on)}
            className={cn(
              "inline-flex h-14 items-center justify-center gap-3 rounded-2xl px-6 text-base font-semibold transition",
              on
                ? "bg-[#f4c928] text-[#141414]"
                : "bg-white/10 text-white hover:bg-white/15",
            )}
          >
            <Power className={cn("size-5", on && "text-[#141414]")} />
            {on ? "ENCENDIDO" : "APAGADO"}
          </button>
          <button
            type="button"
            disabled={!on || busy}
            onClick={() => void runCycle()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/20 px-4 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Run cycle
          </button>
          <Link
            href="/winners"
            className="text-center text-[12px] text-[#f4c928] underline-offset-2 hover:underline"
          >
            Abrir Find Winners (alimentar la máquina)
          </Link>
        </div>
      </div>

      <div className="border-t border-white/10 px-6 py-4">
        <div className="grid gap-2 text-[12px] text-white/60 sm:grid-cols-2">
          <p>✓ Escanea ledger / winners ya encontrados</p>
          <p>✓ Rank SELL / AFFILIATE / BOTH / WATCH</p>
          <p>✓ Guarda aprendizaje para el siguiente ciclo</p>
          <p>✗ No publica ni compra inventario solo</p>
        </div>
      </div>

      {emptyHint ? (
        <div className="border-t border-amber-500/30 bg-amber-500/10 px-6 py-3 text-sm text-amber-100">
          {emptyHint}
        </div>
      ) : null}

      {result?.actions?.length ? (
        <div className="border-t border-white/10">
          <div className="flex items-center justify-between px-6 py-3">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-white/50 uppercase">
              Cola de dinero · {result.queued} acciones · {result.scanned}{" "}
              escaneados
            </p>
          </div>
          <ul className="divide-y divide-white/10">
            {result.actions.map((action: AutopilotAction) => (
              <li
                key={action.asin}
                className="flex flex-wrap items-center gap-3 px-6 py-3"
              >
                {action.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={action.imageUrl}
                    alt=""
                    className="size-12 rounded-lg bg-white object-contain p-1"
                  />
                ) : (
                  <span className="size-12 rounded-lg bg-white/10" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{action.title}</p>
                  <p className="text-[12px] text-white/50">
                    {action.asin}
                    {action.brand ? ` · ${action.brand}` : ""} · score{" "}
                    {action.moneyScore ?? "—"} · keep{" "}
                    {money(action.estimatedProfit)}
                  </p>
                  <p className="text-[12px] text-[#f4c928]">
                    {action.primaryAction}
                  </p>
                </div>
                <span className="rounded-md bg-white/10 px-2 py-1 text-[11px] font-semibold tracking-wide">
                  {action.recommendation}
                </span>
                <Link
                  href="/winners"
                  className="rounded-lg bg-[#f4c928] px-3 py-2 text-[12px] font-semibold text-[#141414]"
                >
                  Ir
                </Link>
              </li>
            ))}
          </ul>
          <p className="px-6 py-3 text-[11px] text-white/40">
            {result.learningNote}
          </p>
        </div>
      ) : null}
    </section>
  );
}
