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
      initial={reduce ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE }}
      className="relative overflow-hidden rounded-[32px] bg-[#0e0e0e] text-white"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(244,201,40,0.22),transparent_50%)]" />
      {!reduce ? (
        <motion.div
          className="pointer-events-none absolute -right-16 top-0 size-56 rounded-full bg-[#f4c928]/10 blur-3xl"
          animate={{ opacity: [0.3, 0.55, 0.3], x: [0, -12, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : null}

      <div className="relative flex flex-col gap-8 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] text-[#f4c928] uppercase">
            <LiveDot />
            Money Machine
          </p>
          <h2 className="mt-3 font-display text-[2.75rem] leading-[0.95] tracking-tight sm:text-[3.4rem]">
            Piloto
            <span className="italic text-[#f4c928]"> automático</span>
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/60">
            Un interruptor. Higlou ordena oportunidades de tus mercados, arma la
            cola de dinero y aprende. No compra ni publica solo — todavía.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-[11px] text-white/45">
            <span className="rounded-full border border-white/10 px-2.5 py-1">Find Winners</span>
            <span className="rounded-full border border-white/10 px-2.5 py-1">Amazon → eBay</span>
            <span className="rounded-full border border-white/10 px-2.5 py-1">Rank SELL / AFF</span>
          </div>
        </div>

        <div className="flex w-full max-w-sm flex-col gap-3">
          <button
            type="button"
            onClick={() => toggle(!on)}
            className={cn(
              "group relative flex h-16 items-center justify-between overflow-hidden rounded-2xl px-5 text-left transition",
              on ? "bg-[#f4c928] text-[#141414]" : "bg-white/8 text-white hover:bg-white/12",
            )}
          >
            {!reduce && on ? (
              <motion.span
                className="absolute inset-y-0 w-1/3 bg-white/25"
                animate={{ left: ["-30%", "110%"] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
              />
            ) : null}
            <span className="relative">
              <span className="block text-[11px] font-semibold tracking-[0.16em] uppercase opacity-70">
                Estado
              </span>
              <span className="block text-lg font-semibold">
                {on ? "ENCENDIDO" : "APAGADO"}
              </span>
            </span>
            <Power className="relative size-6 opacity-80" />
          </button>

          <button
            type="button"
            disabled={!on || busy}
            onClick={() => void runCycle()}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/15 text-sm font-semibold disabled:opacity-35"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Radar className="size-4" />}
            Run cycle
          </button>
          <Link
            href="/winners"
            className="text-center text-[12px] font-medium text-[#f4c928] underline-offset-4 hover:underline"
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
            className="relative border-t border-amber-400/20 bg-amber-400/10 px-6 py-3 text-sm text-amber-50"
          >
            {emptyHint}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {result?.actions?.length ? (
        <div className="relative border-t border-white/10">
          <div className="flex items-center justify-between px-6 py-3">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-white/40 uppercase">
              Cola · {result.queued} · {result.scanned} escaneados
            </p>
          </div>
          <ul className="divide-y divide-white/8">
            {result.actions.map((action: AutopilotAction, i) => (
              <motion.li
                key={action.asin}
                initial={reduce ? false : { opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.04 * i, duration: 0.35, ease: EASE }}
                className="flex flex-wrap items-center gap-3 px-6 py-3.5"
              >
                {action.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={action.imageUrl}
                    alt=""
                    className="size-12 rounded-xl bg-white object-contain p-1"
                  />
                ) : (
                  <span className="size-12 rounded-xl bg-white/8" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{action.title}</p>
                  <p className="text-[12px] text-white/45">
                    {action.asin} · score {action.moneyScore ?? "—"} · keep{" "}
                    {money(action.estimatedProfit)}
                  </p>
                  <p className="text-[12px] text-[#f4c928]">{action.primaryAction}</p>
                </div>
                <span className="rounded-lg bg-white/8 px-2 py-1 text-[10px] font-semibold tracking-wide">
                  {action.recommendation}
                </span>
                <Link
                  href="/winners"
                  className="rounded-xl bg-[#f4c928] px-3 py-2 text-[12px] font-semibold text-[#141414]"
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
