"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import {
  Coins,
  Loader2,
  Sparkles,
  Zap,
} from "lucide-react";
import { StudioFrame } from "@/components/layout/studio-frame";
import { CREDIT_ACTIONS, CREDIT_PACKS, WELCOME_BONUS_CREDITS } from "@/lib/credits/costs";
import { cn } from "@/lib/utils";

type Wallet = {
  balance: number;
  lifetimeGranted: number;
  lifetimeSpent: number;
  onboarded: boolean;
  welcomeBonusClaimed: boolean;
  ready: boolean;
  note?: string;
};

type LedgerRow = {
  id: string;
  delta: number;
  action: string;
  reason: string | null;
  created_at: string;
};

const EASE = [0.22, 1, 0.36, 1] as const;

export function CreditsStudio() {
  const reduce = useReducedMotion();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyPack, setBusyPack] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/credits", { cache: "no-store" });
      const body = (await res.json()) as {
        wallet?: Wallet;
        ledger?: LedgerRow[];
      };
      setWallet(body.wallet || null);
      setLedger(body.ledger || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const recharge = async (packId: string) => {
    setBusyPack(packId);
    try {
      const res = await fetch("/api/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "recharge", packId }),
      });
      const body = (await res.json()) as {
        error?: string;
        granted?: number;
        wallet?: Wallet;
      };
      if (!res.ok) {
        toast.error(body.error || "No se pudo recargar");
        return;
      }
      if (body.wallet) setWallet(body.wallet);
      toast.success(`+${body.granted} créditos añadidos`);
      await load();
    } finally {
      setBusyPack(null);
    }
  };

  const actions = Object.values(CREDIT_ACTIONS);

  return (
    <StudioFrame
      kicker="Wallet"
      title="Créditos"
      hint="Recargá · cada acción descuenta · Stripe después"
      scroll
      action={
        <Link
          href="/onboarding"
          className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[#ddd7cd] bg-white px-3.5 text-[12px] font-semibold text-[#141414]"
        >
          Ver onboarding
        </Link>
      }
    >
      <div className="relative overflow-hidden bg-[#0c0c0c] text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(244,201,40,0.28),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(54,101,243,0.2),_transparent_50%)]"
        />
        <div className="relative mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <p className="text-[11px] font-bold tracking-[0.2em] text-[#f4c928] uppercase">
              Tu combustible
            </p>
            <h2 className="mt-2 font-display text-[48px] leading-none tracking-tight sm:text-[64px]">
              {loading ? "…" : wallet?.balance ?? 0}
              <span className="ml-2 text-[22px] text-white/50 sm:text-[28px]">
                créditos
              </span>
            </h2>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/70">
              Cada acción te avisa cuánto gasta antes de cobrar. Funciones Pro
              (carrusel, suministro, import masivo) se desbloquean con créditos
              o el pack Pro.
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-[12px] text-white/55">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5">
                <Sparkles className="size-3.5 text-[#f4c928]" />
                Welcome {WELCOME_BONUS_CREDITS} al empezar
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5">
                Gastados {wallet?.lifetimeSpent ?? 0}
              </span>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="space-y-6 bg-[#f6f4f0] p-5 sm:p-7">
        {wallet?.note ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
            {wallet.note}
          </p>
        ) : null}

        <div>
          <p className="text-[10px] font-bold tracking-[0.14em] text-[#8a847c] uppercase">
            Recargar
          </p>
          <p className="mt-1 text-[15px] font-semibold text-[#141414]">
            Packs listos · pago Stripe en camino
          </p>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {CREDIT_PACKS.map((pack, i) => (
              <motion.div
                key={pack.id}
                initial={reduce ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, ease: EASE }}
                className={cn(
                  "relative flex flex-col rounded-[1.35rem] border bg-white p-5",
                  pack.popular
                    ? "border-[#f4c928] shadow-[0_12px_40px_rgba(244,201,40,0.18)]"
                    : "border-[#ebe7e0]",
                )}
              >
                {pack.popular ? (
                  <span className="absolute -top-2.5 left-5 rounded-full bg-[#141414] px-2.5 py-1 text-[10px] font-bold tracking-wide text-[#f4c928] uppercase">
                    Más elegido
                  </span>
                ) : null}
                <p className="text-[13px] font-semibold text-[#8a847c]">
                  {pack.name}
                </p>
                <p className="mt-2 font-display text-[40px] leading-none text-[#141414]">
                  {pack.credits}
                </p>
                <p className="mt-1 text-[12px] text-[#8a847c]">créditos</p>
                <p className="mt-3 text-[13px] text-[#6b6560]">{pack.blurb}</p>
                <p className="mt-4 text-[22px] font-semibold tabular-nums text-[#141414]">
                  ${pack.priceUsd}
                </p>
                <button
                  type="button"
                  disabled={busyPack === pack.id}
                  onClick={() => void recharge(pack.id)}
                  className={cn(
                    "mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-full text-[13px] font-semibold text-white",
                    pack.popular ? "bg-[#141414]" : "bg-[#3665F3]",
                  )}
                >
                  {busyPack === pack.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Coins className="size-4" />
                  )}
                  Recargar ahora
                </button>
                <p className="mt-2 text-center text-[10px] text-[#b8b0a4]">
                  Mock · Stripe Checkout después
                </p>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[1.35rem] border border-[#ebe7e0] bg-white p-5">
            <p className="text-[10px] font-bold tracking-[0.14em] text-[#8a847c] uppercase">
              Qué cuesta
            </p>
            <ul className="mt-3 divide-y divide-[#efeae2]">
              {actions.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 py-2.5 text-[13px]"
                >
                  <span className="text-[#141414]">{a.label}</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#fff4cc] px-2.5 py-1 text-[11px] font-bold text-[#5c4813]">
                    <Zap className="size-3" />
                    {a.cost}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-[1.35rem] border border-[#ebe7e0] bg-white p-5">
            <p className="text-[10px] font-bold tracking-[0.14em] text-[#8a847c] uppercase">
              Movimientos
            </p>
            {ledger.length === 0 ? (
              <p className="mt-4 text-[13px] text-[#8a847c]">
                Todavía no hay movimientos. Recargá o usá Find Winners.
              </p>
            ) : (
              <ul className="mt-2 max-h-64 divide-y divide-[#efeae2] overflow-y-auto">
                <AnimatePresence initial={false}>
                  {ledger.map((row) => (
                    <motion.li
                      key={row.id}
                      initial={reduce ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center justify-between gap-3 py-2.5 text-[13px]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-[#141414]">
                          {row.reason || row.action}
                        </span>
                        <span className="text-[11px] text-[#8a847c]">
                          {new Date(row.created_at).toLocaleString()}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "font-semibold tabular-nums",
                          row.delta >= 0 ? "text-[#1f7a4d]" : "text-[#141414]",
                        )}
                      >
                        {row.delta >= 0 ? "+" : ""}
                        {row.delta}
                      </span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>
        </div>
      </div>
    </StudioFrame>
  );
}
