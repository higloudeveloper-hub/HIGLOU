"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import {
  ArrowRight,
  Coins,
  Search,
  Share2,
  Sparkles,
  Store,
  Zap,
} from "lucide-react";
import { CREDIT_ACTIONS, WELCOME_BONUS_CREDITS } from "@/lib/credits/costs";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;
const LOCAL_KEY = "higlou-onboarding-v2";

const STEPS = [
  {
    id: "welcome",
    kicker: "Bienvenido",
    title: "Higlou corre con créditos",
    body: "Recargás cuando quieras. Cada acción (scan, claim, AI, Facebook) descuenta créditos. Stripe llega después — hoy podés probar con el pack de bienvenida.",
  },
  {
    id: "fuel",
    kicker: "Combustible",
    title: `Te regalamos ${WELCOME_BONUS_CREDITS} créditos`,
    body: "Alcanza para escanear winners, agregar productos y compartir. Cuando se acaben, recargás en un clic.",
  },
  {
    id: "path",
    kicker: "Tu ruta",
    title: "Tres caminos para ganar",
    body: "Find Winners encuentra ofertas. Market las muestra. Affiliate + Facebook Ads las venden con tu link.",
  },
] as const;

export function OnboardingStudio() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      // Claim welcome bonus as soon as onboarding opens
      await fetch("/api/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "welcome" }),
      }).catch(() => null);
      const res = await fetch("/api/credits", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { wallet?: { balance?: number } };
      setBalance(Number(body.wallet?.balance) || 0);
    })();
  }, []);

  const finish = async () => {
    setBusy(true);
    try {
      await fetch("/api/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "onboarded" }),
      });
      try {
        window.localStorage.setItem(LOCAL_KEY, "1");
      } catch {
        /* ignore */
      }
      toast.success("Listo — a buscar winners");
      router.push("/home");
    } finally {
      setBusy(false);
    }
  };

  const current = STEPS[step]!;
  const last = step === STEPS.length - 1;

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-[#0c0c0c] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_500px_at_20%_-10%,rgba(244,201,40,0.28),transparent_55%),radial-gradient(700px_400px_at_90%_20%,rgba(54,101,243,0.25),transparent_50%),radial-gradient(600px_400px_at_50%_100%,rgba(24,119,242,0.15),transparent_45%)]"
      />

      <header className="relative z-[1] flex items-center justify-between px-5 py-4 sm:px-8">
        <p className="text-[12px] font-bold tracking-[0.18em] uppercase">
          Higlou
        </p>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] font-semibold">
          <Coins className="size-3.5 text-[#f4c928]" />
          <span className="tabular-nums">{balance ?? "…"}</span>
          <span className="text-white/50">créditos</span>
        </div>
      </header>

      <main className="relative z-[1] mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-10 sm:px-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -12 }}
            transition={{ duration: 0.45, ease: EASE }}
          >
            <p className="text-[11px] font-bold tracking-[0.2em] text-[#f4c928] uppercase">
              {current.kicker}
            </p>
            <h1 className="mt-3 font-display text-[42px] leading-[0.95] tracking-tight sm:text-[56px]">
              {current.title}
            </h1>
            <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-white/70">
              {current.body}
            </p>
          </motion.div>
        </AnimatePresence>

        {step === 1 ? (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 grid gap-2 sm:grid-cols-2"
          >
            {Object.values(CREDIT_ACTIONS).map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <span className="text-[13px] text-white/85">{a.label}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#f4c928]/15 px-2 py-0.5 text-[11px] font-bold text-[#f4c928]">
                  <Zap className="size-3" />
                  {a.cost}
                </span>
              </div>
            ))}
          </motion.div>
        ) : null}

        {step === 2 ? (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 grid gap-3 sm:grid-cols-3"
          >
            {[
              {
                href: "/winners",
                icon: Search,
                title: "Find Winners",
                hint: `${CREDIT_ACTIONS.winners_scan.cost} créditos / scan`,
              },
              {
                href: "/market",
                icon: Store,
                title: "Market",
                hint: `${CREDIT_ACTIONS.market_claim.cost} créditos / claim`,
              },
              {
                href: "/facebook",
                icon: Share2,
                title: "Facebook Ads",
                hint: `${CREDIT_ACTIONS.facebook_share.cost} créditos / post`,
              },
            ].map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-[#f4c928]/40 hover:bg-white/10"
              >
                <card.icon className="size-5 text-[#f4c928]" />
                <p className="mt-3 text-[15px] font-semibold">{card.title}</p>
                <p className="mt-1 text-[12px] text-white/55">{card.hint}</p>
              </Link>
            ))}
          </motion.div>
        ) : null}

        <div className="mt-10 flex items-center gap-2">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === step ? "w-8 bg-[#f4c928]" : "w-3 bg-white/20",
              )}
            />
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (last) void finish();
              else setStep((n) => n + 1);
            }}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-[#f4c928] px-6 text-[14px] font-bold text-[#141414]"
          >
            {last ? (
              <>
                <Sparkles className="size-4" />
                Entrar al Home
              </>
            ) : (
              <>
                Siguiente
                <ArrowRight className="size-4" />
              </>
            )}
          </button>
          {!last ? (
            <button
              type="button"
              onClick={() => void finish()}
              className="text-[13px] text-white/45 hover:text-white"
            >
              Saltar
            </button>
          ) : (
            <Link
              href="/credits"
              className="text-[13px] font-semibold text-white/70 hover:text-white"
            >
              Ver packs
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
