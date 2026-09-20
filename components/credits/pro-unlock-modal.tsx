"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Crown, Loader2, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import {
  PRO_FEATURES,
  PRO_PLAN,
  type ProFeatureId,
} from "@/lib/credits/pro";

const EASE = [0.22, 1, 0.36, 1] as const;

export function ProUnlockModal({
  open,
  featureId,
  balance,
  busy,
  onCancel,
  onUnlockFeature,
  onUnlockPro,
}: {
  open: boolean;
  featureId: ProFeatureId;
  balance: number;
  busy?: "feature" | "pro" | null;
  onCancel: () => void;
  onUnlockFeature: () => void;
  onUnlockPro: () => void;
}) {
  const reduce = useReducedMotion();
  const feature = PRO_FEATURES[featureId];
  const canFeature = balance >= feature.unlockCredits;
  const canPro = balance >= PRO_PLAN.unlockCredits;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[95] flex items-end justify-center p-3 sm:items-center sm:p-6"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="Cerrar"
            className="absolute inset-0 bg-[#0c0c0c]/55 backdrop-blur-[3px]"
            onClick={onCancel}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Función Pro"
            initial={reduce ? false : { y: 36, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={reduce ? undefined : { y: 20, opacity: 0 }}
            transition={{ duration: 0.32, ease: EASE }}
            className="relative z-[1] w-full max-w-lg overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white shadow-[0_30px_100px_rgba(0,0,0,0.28)]"
          >
            <div className="bg-[#3665F3] px-5 py-5 text-white">
              <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.16em] uppercase">
                <Crown className="size-3.5 text-[#f4c928]" />
                Solo Pro
              </p>
              <p className="mt-2 text-[22px] font-semibold tracking-tight">
                {feature.title}
              </p>
              <p className="mt-1.5 text-[14px] text-white/85">{feature.tease}</p>
            </div>

            <div className="px-5 py-4">
              <p className="text-[12px] font-semibold tracking-[0.12em] text-[#8a8a8a] uppercase">
                Beneficios
              </p>
              <ul className="mt-2 space-y-2">
                {feature.benefits.map((b) => (
                  <li
                    key={b}
                    className="flex items-start gap-2 text-[13px] text-[#191919]"
                  >
                    <Check className="mt-0.5 size-4 shrink-0 text-[#1f7a4d]" />
                    {b}
                  </li>
                ))}
              </ul>

              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={Boolean(busy) || !canFeature}
                  onClick={onUnlockFeature}
                  className="inline-flex h-12 flex-col items-center justify-center rounded-xl bg-[#191919] px-3 text-white disabled:opacity-40"
                >
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
                    {busy === "feature" ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Zap className="size-3.5 text-[#f4c928]" />
                    )}
                    Unlock rápido
                  </span>
                  <span className="text-[11px] text-white/70">
                    {feature.unlockCredits} créditos · solo esto
                  </span>
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy) || !canPro}
                  onClick={onUnlockPro}
                  className="inline-flex h-12 flex-col items-center justify-center rounded-xl bg-[#3665F3] px-3 text-white disabled:opacity-40"
                >
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
                    {busy === "pro" ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="size-3.5" />
                    )}
                    Plan Pro
                  </span>
                  <span className="text-[11px] text-white/80">
                    {PRO_PLAN.unlockCredits} créditos · todo Pro
                  </span>
                </button>
              </div>

              {!canFeature ? (
                <p className="mt-3 text-center text-[12px] text-[#707070]">
                  Saldo {balance}.{" "}
                  <Link href="/credits" className="font-semibold text-[#3665F3]">
                    Recargá créditos
                  </Link>{" "}
                  o activá el pack Pro.
                </p>
              ) : (
                <p className="mt-3 text-center text-[12px] text-[#707070]">
                  Saldo actual: <strong className="text-[#191919]">{balance}</strong>
                </p>
              )}

              <button
                type="button"
                onClick={onCancel}
                className="mt-3 w-full py-2 text-[13px] font-medium text-[#707070] hover:text-[#191919]"
              >
                Ahora no
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
