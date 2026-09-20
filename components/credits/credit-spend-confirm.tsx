"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Coins, Loader2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  actionCostCopy,
  actionLabel,
} from "@/lib/credits/pro";
import type { CreditActionId } from "@/lib/credits/costs";
import { creditCost } from "@/lib/credits/costs";

const EASE = [0.22, 1, 0.36, 1] as const;

export function CreditSpendConfirm({
  open,
  action,
  balance,
  busy,
  detail,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  action: CreditActionId;
  balance: number;
  busy?: boolean;
  detail?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const reduce = useReducedMotion();
  const cost = creditCost(action);
  const after = balance - cost;
  const enough = after >= 0;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[90] flex items-end justify-center p-3 sm:items-center sm:p-6"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="Cerrar"
            className="absolute inset-0 bg-[#0c0c0c]/50 backdrop-blur-[2px]"
            onClick={onCancel}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar gasto de créditos"
            initial={reduce ? false : { y: 28, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={reduce ? undefined : { y: 16, opacity: 0 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="relative z-[1] w-full max-w-md overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white shadow-[0_24px_80px_rgba(0,0,0,0.2)]"
          >
            <div className="border-b border-[#e5e5e5] bg-[#f7f7f7] px-5 py-4">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-[#8a8a8a] uppercase">
                Antes de continuar
              </p>
              <p className="mt-1 text-[18px] font-semibold text-[#191919]">
                {actionLabel(action)}
              </p>
              {detail ? (
                <p className="mt-1 text-[13px] text-[#707070]">{detail}</p>
              ) : null}
            </div>
            <div className="space-y-3 px-5 py-4">
              <div className="flex items-center justify-between rounded-xl bg-[#f7f7f7] px-4 py-3">
                <span className="inline-flex items-center gap-2 text-[13px] text-[#707070]">
                  <Coins className="size-4 text-[#3665F3]" />
                  Costo
                </span>
                <strong className="text-[15px] text-[#191919]">
                  −{actionCostCopy(action)}
                </strong>
              </div>
              <div className="flex items-center justify-between text-[13px] text-[#707070]">
                <span>Tu saldo</span>
                <span className="tabular-nums text-[#191919]">{balance}</span>
              </div>
              <div className="flex items-center justify-between text-[13px] text-[#707070]">
                <span>Después</span>
                <span
                  className={cn(
                    "tabular-nums font-semibold",
                    enough ? "text-[#1f7a4d]" : "text-[#b42318]",
                  )}
                >
                  {enough ? after : "Insuficiente"}
                </span>
              </div>
            </div>
            <div className="flex gap-2 border-t border-[#e5e5e5] px-5 py-4">
              <button
                type="button"
                onClick={onCancel}
                className="h-11 flex-1 rounded-full border border-[#e5e5e5] text-[13px] font-semibold text-[#191919]"
              >
                Cancelar
              </button>
              {enough ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onConfirm}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[#3665F3] text-[13px] font-semibold text-white disabled:opacity-40"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                  Gastar {cost}
                </button>
              ) : (
                <Link
                  href="/credits"
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-[#191919] text-[13px] font-semibold text-white"
                >
                  Recargar
                </Link>
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
