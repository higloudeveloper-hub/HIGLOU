"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  Link2,
  Radar,
  Share2,
  Sparkles,
  Store,
  Wand2,
  Zap,
} from "lucide-react";
import { FacebookFMark } from "@/components/brand/store-marks";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;
const LOCAL_KEY = "higlou-onboarding-v2";

type StageId =
  | "welcome"
  | "winners"
  | "market"
  | "affiliate"
  | "listing"
  | "ready";

const STAGES: Array<{
  id: StageId;
  kicker: string;
  title: string;
  body: string;
  cta: string;
}> = [
  {
    id: "welcome",
    kicker: "Higlou Studio",
    title: "Tu máquina de dinero empieza acá",
    body: "Encontrás productos, los ponés en tu tienda y los promocionás. Todo en un solo flujo.",
    cta: "Ver cómo funciona",
  },
  {
    id: "winners",
    kicker: "Find Winners",
    title: "Escaneá oportunidades reales",
    body: "Higlou busca spreads Amazon → eBay y demanda Keepa. Tocá Escanear y aparecen winners con keep neto.",
    cta: "Siguiente",
  },
  {
    id: "market",
    kicker: "Market",
    title: "El floor de deals listos",
    body: "Los verificados llegan al Market. Un click los mete a tu tienda como draft listo para publicar.",
    cta: "Siguiente",
  },
  {
    id: "affiliate",
    kicker: "Affiliate + Facebook",
    title: "Compartí y cobrá comisión",
    body: "Creá links Associates y publicá Ads, Carrusel o Vitrina en tu Page. El tráfico vuelve a vos.",
    cta: "Siguiente",
  },
  {
    id: "listing",
    kicker: "Listings",
    title: "Una foto. Listing profesional",
    body: "Subí fotos y Higlou arma título, specs y descripción. Publicá en eBay y seguí el keep.",
    cta: "Siguiente",
  },
  {
    id: "ready",
    kicker: "Listo",
    title: "Ya sabés el juego",
    body: "Escaneá · reclamá · compartí · listá. Entrá al Home y mirá la money machine en vivo.",
    cta: "Entrar al Home",
  },
];

export function OnboardingStudio() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Silent welcome bonus — never the pitch of this tour
    void fetch("/api/credits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "welcome" }),
    }).catch(() => null);
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
      toast.success("Bienvenido — a escanear winners");
      router.push("/home");
    } finally {
      setBusy(false);
    }
  };

  const current = STAGES[step]!;
  const last = step === STAGES.length - 1;

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-[#07080c] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 55% at 50% -15%, rgba(54,101,243,0.42), transparent 58%), radial-gradient(ellipse 45% 40% at 95% 85%, rgba(244,201,40,0.14), transparent 52%), radial-gradient(ellipse 35% 30% at 5% 70%, rgba(54,101,243,0.18), transparent 55%)",
        }}
      />
      {!reduce ? <AmbientOrbs /> : null}
      {!reduce ? <FloatingDust /> : null}

      <header className="relative z-[1] flex items-center justify-between px-5 py-4 sm:px-8">
        <motion.div
          className="flex items-center gap-2"
          initial={reduce ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <span className="grid size-7 place-items-center rounded-lg bg-[#f4c928] text-[12px] font-black text-[#141414]">
            H
          </span>
          <p className="text-[13px] font-semibold tracking-tight">Higlou</p>
        </motion.div>
        <button
          type="button"
          onClick={() => void finish()}
          className="text-[12px] font-medium text-white/45 transition hover:text-white"
        >
          Saltar tour
        </button>
      </header>

      <main className="relative z-[1] mx-auto grid w-full max-w-6xl flex-1 items-center gap-8 px-5 py-6 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:py-10">
        <div>
          <div className="mb-6 flex flex-wrap gap-1.5">
            {STAGES.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === step
                    ? "w-9 bg-[#3665F3] shadow-[0_0_12px_rgba(54,101,243,0.8)]"
                    : i < step
                      ? "w-4 bg-white/45"
                      : "w-3 bg-white/15",
                )}
                aria-label={s.kicker}
              />
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={
                reduce ? false : { opacity: 0, y: 28, filter: "blur(8px)" }
              }
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={
                reduce
                  ? undefined
                  : { opacity: 0, y: -18, filter: "blur(6px)" }
              }
              transition={{ duration: 0.5, ease: EASE }}
            >
              <motion.p
                className="text-[11px] font-semibold tracking-[0.22em] text-[#8eb0ff] uppercase"
                initial={reduce ? false : { opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.08, duration: 0.4 }}
              >
                {current.kicker}
              </motion.p>
              <h1 className="mt-3 max-w-xl text-[36px] leading-[1.02] font-semibold tracking-tight sm:text-[48px]">
                {current.title}
              </h1>
              <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-white/65">
                {current.body}
              </p>
            </motion.div>
          </AnimatePresence>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <motion.button
              type="button"
              disabled={busy}
              whileHover={reduce ? undefined : { scale: 1.03 }}
              whileTap={reduce ? undefined : { scale: 0.97 }}
              onClick={() => {
                if (last) void finish();
                else setStep((n) => n + 1);
              }}
              className="relative inline-flex h-12 items-center gap-2 overflow-hidden rounded-full bg-[#3665F3] px-6 text-[14px] font-semibold text-white shadow-[0_12px_40px_rgba(54,101,243,0.5)]"
            >
              {!reduce ? (
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                  animate={{ x: ["-120%", "120%"] }}
                  transition={{
                    duration: 2.2,
                    repeat: Infinity,
                    repeatDelay: 1.4,
                    ease: "easeInOut",
                  }}
                />
              ) : null}
              <span className="relative z-[1] inline-flex items-center gap-2">
                {last ? <Sparkles className="size-4 text-[#f4c928]" /> : null}
                {current.cta}
                {!last ? <ArrowRight className="size-4" /> : null}
              </span>
            </motion.button>
            {step > 0 && !last ? (
              <button
                type="button"
                onClick={() => setStep((n) => Math.max(0, n - 1))}
                className="text-[13px] text-white/45 transition hover:text-white"
              >
                Atrás
              </button>
            ) : null}
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          {!reduce ? (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute -inset-6 rounded-[2.5rem] bg-[#3665F3]/20 blur-3xl"
              animate={{ opacity: [0.25, 0.55, 0.25], scale: [0.96, 1.04, 0.96] }}
              transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
            />
          ) : null}
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id + "-stage"}
              initial={
                reduce ? false : { opacity: 0, scale: 0.9, rotateX: 8, y: 24 }
              }
              animate={{ opacity: 1, scale: 1, rotateX: 0, y: 0 }}
              exit={
                reduce
                  ? undefined
                  : { opacity: 0, scale: 0.94, y: -16, filter: "blur(4px)" }
              }
              transition={{ duration: 0.45, ease: EASE }}
              style={{ transformPerspective: 1200 }}
              className="relative overflow-hidden rounded-[1.75rem] border border-white/12 bg-[#10131a]/95 shadow-[0_40px_100px_rgba(0,0,0,0.6)] backdrop-blur-xl"
            >
              <div className="flex items-center gap-1.5 border-b border-white/8 px-4 py-3">
                <span className="size-2 rounded-full bg-[#ff5f57]/80" />
                <span className="size-2 rounded-full bg-[#febc2e]/80" />
                <span className="size-2 rounded-full bg-[#28c840]/80" />
                <span className="ml-2 text-[11px] font-medium tracking-wide text-white/35 uppercase">
                  Live preview
                </span>
                <motion.span
                  className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-[#7ddea8]"
                  animate={reduce ? undefined : { opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.8, repeat: Infinity }}
                >
                  <span className="size-1.5 rounded-full bg-[#7ddea8]" />
                  LIVE
                </motion.span>
              </div>
              <div className="relative aspect-[4/5] p-5 sm:aspect-[5/4] lg:aspect-square">
                <StageVisual id={current.id} reduce={Boolean(reduce)} />
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function AmbientOrbs() {
  return (
    <>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 size-[560px] -translate-x-1/2 rounded-full bg-[#3665F3]/25 blur-3xl"
        animate={{ opacity: [0.3, 0.55, 0.3], scale: [1, 1.1, 1] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute right-[-10%] bottom-[10%] size-[320px] rounded-full bg-[#f4c928]/12 blur-3xl"
        animate={{ opacity: [0.15, 0.35, 0.15], x: [0, -30, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
    </>
  );
}

function FloatingDust() {
  const dots = Array.from({ length: 14 }, (_, i) => i);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {dots.map((i) => {
        const left = 6 + ((i * 17) % 88);
        const top = 8 + ((i * 23) % 80);
        const size = 2 + (i % 3);
        return (
          <motion.span
            key={i}
            className="absolute rounded-full bg-white/30"
            style={{ left: `${left}%`, top: `${top}%`, width: size, height: size }}
            animate={{
              y: [0, -18 - (i % 5) * 4, 0],
              opacity: [0.15, 0.55, 0.15],
            }}
            transition={{
              duration: 3.5 + (i % 4),
              delay: i * 0.18,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        );
      })}
    </div>
  );
}

function StageVisual({ id, reduce }: { id: StageId; reduce: boolean }) {
  if (id === "welcome") return <WelcomeStage reduce={reduce} />;
  if (id === "winners") return <WinnersStage reduce={reduce} />;
  if (id === "market") return <MarketStage reduce={reduce} />;
  if (id === "affiliate") return <AffiliateStage reduce={reduce} />;
  if (id === "listing") return <ListingStage reduce={reduce} />;
  return <ReadyStage reduce={reduce} />;
}

function WelcomeStage({ reduce }: { reduce: boolean }) {
  const nodes = [
    { label: "Find", icon: Radar, x: "8%", y: "16%", delay: 0.05 },
    { label: "Market", icon: Store, x: "62%", y: "12%", delay: 0.15 },
    { label: "Ads", icon: Share2, x: "68%", y: "58%", delay: 0.25 },
    { label: "List", icon: Wand2, x: "10%", y: "62%", delay: 0.2 },
  ] as const;

  return (
    <div className="relative size-full">
      {!reduce ? (
        <motion.div
          aria-hidden
          className="absolute top-1/2 left-1/2 size-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#3665F3]/40"
          animate={{ scale: [1, 1.35, 1], opacity: [0.55, 0, 0.55] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
        />
      ) : null}
      {!reduce ? (
        <motion.div
          aria-hidden
          className="absolute top-1/2 left-1/2 size-56 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10"
          animate={{ scale: [1, 1.2, 1], opacity: [0.35, 0, 0.35] }}
          transition={{
            duration: 2.4,
            delay: 0.5,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      ) : null}

      <motion.div
        className="absolute top-1/2 left-1/2 grid size-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-3xl bg-[#3665F3] shadow-[0_0_70px_rgba(54,101,243,0.65)]"
        animate={
          reduce
            ? undefined
            : { rotate: [0, 5, -5, 0], scale: [1, 1.04, 1] }
        }
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      >
        <Sparkles className="size-9 text-white" />
      </motion.div>

      {nodes.map((n) => {
        const Icon = n.icon;
        return (
          <motion.div
            key={n.label}
            className="absolute flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[12px] font-semibold backdrop-blur-md"
            style={{ left: n.x, top: n.y }}
            initial={reduce ? false : { opacity: 0, scale: 0.5, y: 12 }}
            animate={
              reduce
                ? { opacity: 1, scale: 1 }
                : { opacity: 1, scale: 1, y: [0, -6, 0] }
            }
            transition={
              reduce
                ? { delay: n.delay }
                : {
                    delay: n.delay,
                    y: {
                      duration: 2.8 + n.delay,
                      repeat: Infinity,
                      ease: "easeInOut",
                    },
                  }
            }
          >
            <Icon className="size-3 text-[#8eb0ff]" />
            {n.label}
          </motion.div>
        );
      })}

      {!reduce
        ? nodes.map((n, i) => (
            <motion.span
              key={`beam-${n.label}`}
              className="pointer-events-none absolute top-1/2 left-1/2 h-px origin-left bg-gradient-to-r from-[#3665F3] to-transparent"
              style={{ width: "32%", rotate: `${i * 55 - 35}deg` }}
              animate={{ opacity: [0.15, 0.85, 0.15], scaleX: [0.7, 1, 0.7] }}
              transition={{
                duration: 2.2,
                delay: i * 0.22,
                repeat: Infinity,
              }}
            />
          ))
        : null}

      <motion.p
        className="absolute inset-x-0 bottom-1 text-center text-[11px] font-medium tracking-wide text-white/40"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        Un flujo · cuatro motores
      </motion.p>
    </div>
  );
}

function WinnersStage({ reduce }: { reduce: boolean }) {
  const cards = [
    { title: "Ryobi kit", keep: "+$28", delay: 0.35 },
    { title: "Milwaukee bit", keep: "+$19", delay: 0.55 },
    { title: "DeWalt pack", keep: "+$34", delay: 0.75 },
  ];

  return (
    <div className="relative flex size-full flex-col justify-between overflow-hidden">
      {!reduce ? (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -top-8 left-1/2 size-48 -translate-x-1/2 rounded-full border-2 border-[#3665F3]/30"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, rgba(54,101,243,0.45) 40deg, transparent 80deg)",
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "linear" }}
        />
      ) : null}

      <div className="relative z-[1] flex items-center gap-2 rounded-xl bg-[#3665F3] px-3 py-2.5 shadow-[0_8px_30px_rgba(54,101,243,0.45)]">
        <motion.span
          className="size-2 rounded-full bg-white"
          animate={reduce ? undefined : { opacity: [1, 0.25, 1] }}
          transition={{ duration: 0.9, repeat: Infinity }}
        />
        <Radar className="size-3.5 text-white/90" />
        <span className="text-[12px] font-semibold">Escaneando Keepa…</span>
        <motion.span
          className="ml-auto text-[11px] font-bold text-white/80"
          animate={reduce ? undefined : { opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        >
          3 hits
        </motion.span>
      </div>

      <ul className="relative z-[1] mt-4 space-y-2">
        {cards.map((c) => (
          <motion.li
            key={c.title}
            initial={reduce ? false : { opacity: 0, x: 40, scale: 0.92 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ delay: c.delay, type: "spring", stiffness: 260, damping: 20 }}
            className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3.5 py-3 backdrop-blur-sm"
          >
            <div className="flex items-center gap-3">
              <motion.span
                className="size-10 rounded-xl bg-gradient-to-br from-[#3665F3]/50 to-white/10"
                animate={reduce ? undefined : { rotate: [0, 6, -4, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              />
              <span className="text-[13px] font-semibold">{c.title}</span>
            </div>
            <motion.span
              className="rounded-full bg-[#1f7a4d]/30 px-2.5 py-1 text-[12px] font-bold text-[#7ddea8]"
              initial={reduce ? false : { scale: 0.6 }}
              animate={{ scale: 1 }}
              transition={{ delay: c.delay + 0.15, type: "spring" }}
            >
              {c.keep}
            </motion.span>
          </motion.li>
        ))}
      </ul>

      <motion.p
        className="relative z-[1] mt-3 text-center text-[12px] text-white/45"
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1 }}
      >
        Winners con keep real · listos para importar
      </motion.p>
    </div>
  );
}

function MarketStage({ reduce }: { reduce: boolean }) {
  return (
    <div className="relative flex size-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white/70">
          <Store className="size-3.5 text-[#f4c928]" />
          Floor live
        </span>
        <motion.span
          className="rounded-full bg-[#f4c928]/15 px-2 py-0.5 text-[11px] font-bold text-[#f4c928]"
          animate={reduce ? undefined : { scale: [1, 1.06, 1] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        >
          3 deals
        </motion.span>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-2">
        {[
          { title: "Hot drop · keep +$41", span: true, delay: 0.05 },
          { title: "Deal 1 · +$22", span: false, delay: 0.18 },
          { title: "Deal 2 · +$17", span: false, delay: 0.28 },
          { title: "Deal 3 · +$29", span: false, delay: 0.38 },
        ].map((item, i) => (
          <motion.div
            key={item.title}
            initial={reduce ? false : { opacity: 0, y: 28, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              delay: item.delay,
              type: "spring",
              stiffness: 240,
              damping: 18,
            }}
            className={cn(
              "relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-3",
              item.span && "col-span-2",
            )}
          >
            {i === 0 && !reduce ? (
              <motion.span
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                animate={{ x: ["-100%", "100%"] }}
                transition={{
                  duration: 1.8,
                  delay: 0.6,
                  repeat: Infinity,
                  repeatDelay: 2,
                }}
              />
            ) : null}
            <div
              className={cn(
                "rounded-xl bg-gradient-to-br from-[#3665F3]/45 to-white/5",
                item.span ? "aspect-[2.4/1]" : "aspect-square",
              )}
            />
            <p className="mt-2 truncate text-[12px] font-semibold">{item.title}</p>
            {i === 0 ? (
              <motion.button
                type="button"
                className="mt-2 inline-flex h-8 items-center gap-1 rounded-full bg-white px-3 text-[11px] font-bold text-[#141414]"
                animate={reduce ? undefined : { scale: [1, 1.05, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <Check className="size-3 text-[#1f7a4d]" />
                A tu tienda
              </motion.button>
            ) : null}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function AffiliateStage({ reduce }: { reduce: boolean }) {
  return (
    <div className="flex size-full flex-col justify-between gap-3">
      <motion.div
        className="rounded-2xl border border-white/10 bg-[#1877F2]/18 p-4"
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        <div className="flex items-center gap-2">
          <FacebookFMark className="size-4" />
          <span className="text-[13px] font-semibold">Page preview</span>
          <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/60">
            Vitrina
          </span>
        </div>
        <p className="mt-3 text-[12px] text-white/70">
          Ofertas verificadas · deslizá y tocá el que te guste.
        </p>
        <div className="mt-3 flex gap-2 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-24 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/10"
              initial={reduce ? false : { x: 50, opacity: 0, rotate: 4 }}
              animate={
                reduce
                  ? { x: 0, opacity: 1 }
                  : { x: 0, opacity: 1, rotate: 0, y: [0, -4, 0] }
              }
              transition={
                reduce
                  ? { delay: 0.12 * i }
                  : {
                      delay: 0.12 * i,
                      y: {
                        duration: 2 + i * 0.3,
                        repeat: Infinity,
                        ease: "easeInOut",
                      },
                    }
              }
            >
              <div className="aspect-square bg-gradient-to-br from-white/30 to-[#1877F2]/20" />
              <p className="truncate px-1.5 py-1 text-[10px]">Item {i + 1}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <motion.div
        className="flex items-center gap-3 rounded-2xl border border-[#f4c928]/30 bg-[#f4c928]/12 px-4 py-3"
        initial={reduce ? false : { opacity: 0, y: 14, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.4, type: "spring", stiffness: 220 }}
      >
        <motion.span
          className="grid size-9 place-items-center rounded-xl bg-[#f4c928]/20"
          animate={reduce ? undefined : { rotate: [0, -8, 8, 0] }}
          transition={{ duration: 2.5, repeat: Infinity }}
        >
          <Link2 className="size-4 text-[#f4c928]" />
        </motion.span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold">Smart link listo</p>
          <p className="truncate text-[11px] text-white/55">
            higlou.app/go/oferta
          </p>
        </div>
        <motion.span
          className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold text-[#7ddea8]"
          initial={reduce ? false : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.7, type: "spring" }}
        >
          +comisión
        </motion.span>
      </motion.div>
    </div>
  );
}

function ListingStage({ reduce }: { reduce: boolean }) {
  const lines = [
    { label: "Título eBay…", w: "88%" },
    { label: "Item specifics…", w: "72%" },
    { label: "Descripción…", w: "95%" },
  ];

  return (
    <div className="flex size-full flex-col gap-3">
      <div className="flex gap-3">
        <motion.div
          className="relative size-24 overflow-hidden rounded-2xl bg-gradient-to-br from-white/35 to-[#3665F3]/40"
          animate={reduce ? undefined : { y: [0, -6, 0], rotate: [0, 2, -2, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        >
          {!reduce ? (
            <motion.span
              aria-hidden
              className="absolute inset-0 bg-gradient-to-t from-[#07080c]/40 to-transparent"
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          ) : null}
        </motion.div>
        <div className="flex-1 space-y-2.5 pt-1">
          {lines.map((line, i) => (
            <div key={line.label} className="space-y-1">
              <p className="text-[10px] font-medium text-white/35">{line.label}</p>
              <motion.div
                className="h-3 overflow-hidden rounded-full bg-white/10"
                initial={reduce ? false : { width: "18%", opacity: 0.35 }}
                animate={{ width: line.w, opacity: 1 }}
                transition={{ delay: 0.2 + i * 0.28, duration: 0.75, ease: EASE }}
              >
                <motion.div
                  className="h-full w-1/3 bg-gradient-to-r from-transparent via-white/45 to-transparent"
                  animate={reduce ? undefined : { x: ["-100%", "320%"] }}
                  transition={{
                    delay: 0.45 + i * 0.28,
                    duration: 1.15,
                    repeat: Infinity,
                    repeatDelay: 1.4,
                  }}
                />
              </motion.div>
            </div>
          ))}
        </div>
      </div>

      <motion.div
        className="mt-auto flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.85 }}
      >
        <motion.span
          animate={reduce ? undefined : { rotate: [0, 15, -10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <Wand2 className="size-4 text-[#8eb0ff]" />
        </motion.span>
        <p className="text-[13px] text-white/75">
          AI escribe el listing mientras mirás
        </p>
      </motion.div>
    </div>
  );
}

function ReadyStage({ reduce }: { reduce: boolean }) {
  const checks = [
    "Find Winners",
    "Market floor",
    "Affiliate + Ads",
    "Listings",
  ];

  return (
    <div className="relative flex size-full flex-col items-center justify-center overflow-hidden text-center">
      {!reduce
        ? Array.from({ length: 10 }, (_, i) => (
            <motion.span
              key={i}
              aria-hidden
              className="absolute size-1.5 rounded-full bg-[#f4c928]"
              style={{
                left: `${12 + ((i * 19) % 76)}%`,
                top: `${18 + ((i * 13) % 60)}%`,
              }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{
                opacity: [0, 1, 0],
                scale: [0, 1.4, 0],
                y: [0, -24 - (i % 4) * 8],
              }}
              transition={{
                duration: 1.6,
                delay: 0.3 + i * 0.08,
                repeat: Infinity,
                repeatDelay: 1.8,
              }}
            />
          ))
        : null}

      <motion.div
        className="relative grid size-20 place-items-center rounded-full bg-[#3665F3] shadow-[0_0_55px_rgba(54,101,243,0.55)]"
        initial={reduce ? false : { scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 16 }}
      >
        {!reduce ? (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full border-2 border-[#3665F3]/50"
            animate={{ scale: [1, 1.55], opacity: [0.7, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
          />
        ) : null}
        <Check className="size-9 text-white" strokeWidth={2.5} />
      </motion.div>

      <ul className="relative z-[1] mt-8 w-full max-w-xs space-y-2 text-left">
        {checks.map((c, i) => (
          <motion.li
            key={c}
            className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5 text-[13px] font-medium"
            initial={reduce ? false : { opacity: 0, x: -18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.12, ease: EASE }}
          >
            <motion.span
              initial={reduce ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.28 + i * 0.12, type: "spring" }}
            >
              <Check className="size-4 text-[#7ddea8]" />
            </motion.span>
            {c}
          </motion.li>
        ))}
      </ul>

      <motion.p
        className="relative z-[1] mt-5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#8eb0ff]"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
      >
        <Zap className="size-3.5 text-[#f4c928]" />
        Money machine unlocked
      </motion.p>
    </div>
  );
}
