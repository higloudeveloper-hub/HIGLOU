"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { Loader2, Power, Radar } from "lucide-react";
import { LiveDot } from "@/components/ui/studio";
import { cn } from "@/lib/utils";
import type { AutopilotAction, AutopilotCycleResult } from "@/lib/monetization/autopilot";

const PILOT_KEY = "higlou.autopilot.on";
const EASE = [0.22, 1, 0.36, 1] as const;

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

export function AutopilotPanel() {
  const reduce = useReducedMotion() ?? false;
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
    toast.message(next ? "Piloto armado" : "Piloto apagado");
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
      };
      if (!res.ok) {
        toast.error(body.error || "Autopilot cycle failed");
        return;
      }
      setResult(body);
      setEmptyHint(body.emptyHint || null);
      toast.success(
        body.queued
          ? `${body.queued} acciones en cola`
          : "Ciclo listo — sin acciones fuertes aún",
      );
    } catch {
      toast.error("Autopilot cycle failed");
    } finally {
      setBusy(false);
    }
  }, [on, busy]);

  if (!available) return null;

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white"
    >
      <div className="flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl">
          <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-[#9b9b9b] uppercase">
            <LiveDot tone={on ? "success" : "muted"} />
            Money Machine
          </p>
          <h2 className="mt-1.5 text-[17px] font-semibold tracking-tight text-[#191919]">
            Piloto automático
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-[#707070]">
            Ordena oportunidades de tus mercados y arma la cola. No compra ni
            publica solo — todavía.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-[#8a8a8a]">
            <span className="rounded-full border border-[#e5e5e5] bg-[#f7f7f7] px-2.5 py-1">
              Find Winners
            </span>
            <span className="rounded-full border border-[#e5e5e5] bg-[#f7f7f7] px-2.5 py-1">
              Amazon → eBay
            </span>
            <span className="rounded-full border border-[#e5e5e5] bg-[#f7f7f7] px-2.5 py-1">
              Rank SELL / AFF
            </span>
          </div>
        </div>

        <div className="flex w-full max-w-xs flex-col gap-2">
          <button
            type="button"
            onClick={() => toggle(!on)}
            className={cn(
              "flex h-12 items-center justify-between rounded-xl px-4 text-left transition",
              on
                ? "bg-[#191919] text-white"
                : "border border-[#e5e5e5] bg-[#f7f7f7] text-[#191919] hover:bg-[#efefef]",
            )}
          >
            <span>
              <span className="block text-[10px] font-semibold tracking-[0.14em] uppercase opacity-60">
                Estado
              </span>
              <span className="block text-sm font-semibold">
                {on ? "ENCENDIDO" : "APAGADO"}
              </span>
            </span>
            <Power className="size-5 opacity-70" />
          </button>

          <button
            type="button"
            disabled={!on || busy}
            onClick={() => void runCycle()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#e5e5e5] text-[13px] font-semibold text-[#191919] disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Radar className="size-4" />}
            Run cycle
          </button>
          <Link
            href="/winners"
            className="text-center text-[12px] font-medium text-[#3665F3] underline-offset-4 hover:underline"
          >
            Alimentar con Find Winners
          </Link>
        </div>
      </div>

      <AnimatePresence>
        {emptyHint ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-amber-200 bg-amber-50 px-5 py-2.5 text-[13px] text-amber-950"
          >
            {emptyHint}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {result?.actions?.length ? (
        <div className="border-t border-[#e5e5e5]">
          <div className="flex items-center justify-between px-5 py-2.5">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[#9b9b9b] uppercase">
              Cola · {result.queued} · {result.scanned} escaneados
            </p>
          </div>
          <ul className="divide-y divide-[#f0f0f0]">
            {result.actions.map((action: AutopilotAction, i) => (
              <motion.li
                key={action.asin}
                initial={reduce ? false : { opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.03 * i, duration: 0.3, ease: EASE }}
                className="flex flex-wrap items-center gap-3 px-5 py-3"
              >
                {action.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={action.imageUrl}
                    alt=""
                    className="size-11 rounded-lg border border-[#e5e5e5] bg-white object-contain p-1"
                  />
                ) : (
                  <span className="size-11 rounded-lg border border-[#e5e5e5] bg-[#f7f7f7]" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#191919]">
                    {action.title}
                  </p>
                  <p className="text-[12px] text-[#8a8a8a]">
                    {action.asin} · score {action.moneyScore ?? "—"} · keep{" "}
                    {money(action.estimatedProfit)}
                  </p>
                  <p className="text-[12px] text-[#3665F3]">{action.primaryAction}</p>
                </div>
                <span className="rounded-lg border border-[#e5e5e5] bg-[#f7f7f7] px-2 py-1 text-[10px] font-semibold tracking-wide text-[#707070]">
                  {action.recommendation}
                </span>
                <Link
                  href="/winners"
                  className="rounded-full bg-[#191919] px-3 py-1.5 text-[12px] font-semibold text-white"
                >
                  Ir
                </Link>
              </motion.li>
            ))}
          </ul>
        </div>
      ) : null}
    </motion.section>
  );
}
