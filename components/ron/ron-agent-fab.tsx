"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { Loader2, Power, Radar, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildMoneyHint,
  buildNextAction,
  derivePipelineFromStatus,
  emptyOpsSnapshot,
  isShoppingPeakWindow,
} from "@/lib/ron/marketplace-logic";
import type { RonActivity, RonPublicState } from "@/lib/ron/types";

const EASE = [0.22, 1, 0.36, 1] as const;

const PIPELINE = [
  { id: "scan", label: "Keepa" },
  { id: "rank", label: "Rank" },
  { id: "pack", label: "Pack" },
  { id: "publish", label: "FB" },
] as const;

function RedRobot({
  awake,
  working,
}: {
  awake: boolean;
  working: boolean;
}) {
  return (
    <svg viewBox="0 0 64 72" className="size-full" aria-hidden>
      <ellipse cx="32" cy="68" rx="16" ry="3" fill="#000" opacity="0.18" />
      <motion.line
        x1="32"
        y1="10"
        x2="32"
        y2="2"
        stroke="#b91c1c"
        strokeWidth="2.5"
        strokeLinecap="round"
        animate={awake ? { y2: [2, 0, 2] } : undefined}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.circle
        cx="32"
        cy="2"
        r="3"
        fill="#ef4444"
        animate={
          working
            ? { opacity: [1, 0.35, 1], scale: [1, 1.35, 1] }
            : awake
              ? { opacity: [1, 0.45, 1], scale: [1, 1.15, 1] }
              : { opacity: 0.5 }
        }
        transition={{ duration: working ? 0.55 : 1.2, repeat: Infinity }}
      />
      <rect x="14" y="12" width="36" height="28" rx="10" fill="#dc2626" />
      <rect x="14" y="12" width="36" height="28" rx="10" fill="url(#ronShine)" />
      <motion.circle
        cx="24"
        cy="26"
        r="5"
        fill="#fff"
        animate={
          working
            ? { scaleY: [1, 0.15, 1], x: [0, 1.5, 0] }
            : awake
              ? { y: [0, -1, 0] }
              : undefined
        }
        transition={{ duration: working ? 0.4 : 2.4, repeat: Infinity }}
      />
      <motion.circle
        cx="40"
        cy="26"
        r="5"
        fill="#fff"
        animate={
          working
            ? { scaleY: [1, 0.15, 1], x: [0, -1.5, 0] }
            : awake
              ? { y: [0, -1, 0] }
              : undefined
        }
        transition={{
          duration: working ? 0.4 : 2.4,
          repeat: Infinity,
          delay: 0.08,
        }}
      />
      <circle cx="24" cy="26" r="2.2" fill="#191919" />
      <circle cx="40" cy="26" r="2.2" fill="#191919" />
      {awake ? (
        <path
          d="M26 34 Q32 38 38 34"
          stroke="#7f1d1d"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
      ) : (
        <line
          x1="26"
          y1="34"
          x2="38"
          y2="34"
          stroke="#7f1d1d"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
      <rect x="18" y="42" width="28" height="22" rx="8" fill="#b91c1c" />
      <rect
        x="26"
        y="48"
        width="12"
        height="8"
        rx="2"
        fill="#fca5a5"
        opacity="0.9"
      />
      <motion.circle
        cx="32"
        cy="52"
        r="2"
        fill={working ? "#fbbf24" : awake ? "#22c55e" : "#78716c"}
        animate={working ? { opacity: [1, 0.25, 1] } : undefined}
        transition={{ duration: 0.55, repeat: Infinity }}
      />
      <motion.rect
        x="8"
        y="46"
        width="8"
        height="14"
        rx="4"
        fill="#dc2626"
        animate={working ? { rotate: [-12, 12, -12] } : undefined}
        style={{ originX: "12px", originY: "46px" }}
        transition={{ duration: 0.55, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.rect
        x="48"
        y="46"
        width="8"
        height="14"
        rx="4"
        fill="#dc2626"
        animate={working ? { rotate: [12, -12, 12] } : undefined}
        style={{ originX: "52px", originY: "46px" }}
        transition={{ duration: 0.55, repeat: Infinity, ease: "easeInOut" }}
      />
      <defs>
        <linearGradient id="ronShine" x1="14" y1="12" x2="50" y2="40">
          <stop offset="0%" stopColor="#f87171" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#991b1b" stopOpacity="0.2" />
        </linearGradient>
      </defs>
    </svg>
  );
}

const DEFAULT_STATE: RonPublicState = {
  enabled: false,
  mode: "auto",
  statusMessage: "Listo para encender",
  lastRunAt: null,
  lastPostAt: null,
  lastError: null,
  postsToday: 0,
  learning: {
    niches: {},
    formats: { ads: 1, carousel: 1.2, vitrina: 1.4 },
    asins: {},
    strategies: {
      velocity: 1.2,
      amazon_oos: 1.1,
      price_drop: 1.15,
      seller_vacuum: 1.05,
      rising_price: 1,
      hot_deals: 1.25,
    },
    clicksSeen: 0,
    cycles: 0,
  },
  activity: [],
  working: false,
  ops: emptyOpsSnapshot(),
};

function kindLabel(kind: RonActivity["kind"]): string {
  switch (kind) {
    case "publish":
      return "POST";
    case "scan":
      return "SCAN";
    case "learn":
      return "LEARN";
    case "skip":
      return "HOLD";
    case "error":
      return "ERR";
    case "wake":
      return "WAKE";
    default:
      return "OPS";
  }
}

function timeShort(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "--:--";
  }
}

export function RonAgentFab() {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<RonPublicState>(DEFAULT_STATE);
  const [busy, setBusy] = useState(false);
  const [authed, setAuthed] = useState(true);
  const [liveLine, setLiveLine] = useState<string | null>(null);
  const kickedRef = useRef(false);
  const lastPostToastRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/ron", { cache: "no-store" });
      if (res.status === 401) {
        setAuthed(false);
        setState(DEFAULT_STATE);
        return;
      }
      setAuthed(true);
      if (!res.ok) return;
      const body = (await res.json()) as { state?: RonPublicState };
      if (body.state) {
        setState(body.state);
        if (body.state.working) {
          setLiveLine(body.state.statusMessage);
        } else if (!busy) {
          setLiveLine(null);
        }
      }
    } catch {
      /* keep last known */
    }
  }, [busy]);

  useEffect(() => {
    void refresh();
    const peak = isShoppingPeakWindow();
    const ms =
      busy || state.working
        ? 1_800
        : state.enabled
          ? peak
            ? 2 * 60_000
            : 4 * 60_000
          : 45_000;
    const id = window.setInterval(() => void refresh(), ms);
    return () => window.clearInterval(id);
  }, [refresh, busy, state.working, state.enabled]);

  useEffect(() => {
    if (!state.enabled || !authed || kickedRef.current) return;
    kickedRef.current = true;
    const t = window.setTimeout(() => {
      void fetch("/api/ron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run: true, force: true, enabled: true }),
      })
        .then(async (res) => {
          if (!res.ok) return;
          const body = (await res.json()) as {
            state?: RonPublicState;
            published?: boolean;
            postUrl?: string | null;
          };
          if (body.state) setState(body.state);
          if (body.published && body.postUrl !== lastPostToastRef.current) {
            lastPostToastRef.current = body.postUrl || "ok";
            toast.success("RON publicó una oportunidad", {
              action: body.postUrl
                ? {
                    label: "Ver",
                    onClick: () => window.open(body.postUrl!, "_blank"),
                  }
                : undefined,
            });
          }
        })
        .catch(() => undefined)
        .finally(() => void refresh());
    }, 1_200);
    return () => window.clearTimeout(t);
  }, [state.enabled, authed, refresh]);

  useEffect(() => {
    if (!state.enabled || !authed) return;
    const peak = isShoppingPeakWindow();
    const every = peak ? 2 * 60_000 : 5 * 60_000;
    const id = window.setInterval(() => {
      setLiveLine("Ciclo marketplace…");
      void fetch("/api/ron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run: true }),
      })
        .then(async (res) => {
          if (!res.ok) return;
          const body = (await res.json()) as {
            state?: RonPublicState;
            published?: boolean;
            postUrl?: string | null;
          };
          if (body.state) setState(body.state);
          if (body.published) {
            toast.success("RON publicó una oportunidad", {
              action: body.postUrl
                ? {
                    label: "Ver",
                    onClick: () => window.open(body.postUrl!, "_blank"),
                  }
                : undefined,
            });
          }
        })
        .catch(() => undefined)
        .finally(() => {
          setLiveLine(null);
          void refresh();
        });
    }, every);
    return () => window.clearInterval(id);
  }, [state.enabled, authed, refresh]);

  const toggle = async (enabled: boolean) => {
    if (!authed) {
      toast.message("Iniciá sesión para encender a RON");
      return;
    }
    setBusy(true);
    setLiveLine(enabled ? "Encendiendo motor…" : "Apagando…");
    try {
      const res = await fetch("/api/ron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, mode: "auto" }),
      });
      const body = (await res.json()) as {
        state?: RonPublicState;
        error?: string;
      };
      if (!res.ok) {
        toast.error(body.error || "No se pudo actualizar RON");
        return;
      }
      if (body.state) setState(body.state);
      toast.message(
        enabled ? "RON ON · genera dinero solo" : "RON apagado",
      );
      if (enabled) {
        kickedRef.current = false;
        void runNow(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const runNow = async (silent = false) => {
    if (!authed) {
      toast.message("Iniciá sesión para que RON trabaje");
      return;
    }
    setBusy(true);
    setOpen(true);
    setLiveLine("Escaneando oportunidades…");
    try {
      const res = await fetch("/api/ron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run: true, force: true, enabled: true }),
      });
      const body = (await res.json()) as {
        state?: RonPublicState;
        published?: boolean;
        postUrl?: string | null;
        skipped?: string;
        error?: string;
      };
      if (body.state) setState(body.state);
      if (!res.ok) {
        toast.error(body.error || "RON no pudo trabajar");
        return;
      }
      if (body.published) {
        toast.success("Oportunidad publicada en tu Page", {
          action: body.postUrl
            ? {
                label: "Ver post",
                onClick: () => window.open(body.postUrl!, "_blank"),
              }
            : undefined,
        });
      } else if (!silent) {
        toast.message(body.skipped || "Ciclo terminado · sin publish");
      }
    } finally {
      setBusy(false);
      setLiveLine(null);
      void refresh();
    }
  };

  const awake = state.enabled;
  const working = busy || state.working;
  const recent = state.activity.slice(0, 7);
  const peak =
    state.ops?.peakWindow ??
    state.learning.opsSnapshot?.peakWindow ??
    isShoppingPeakWindow();
  const pipeline = derivePipelineFromStatus(state.statusMessage, working);
  const ops = useMemo(() => {
    const base = state.ops || state.learning.opsSnapshot || emptyOpsSnapshot();
    return {
      ...base,
      peakWindow: peak,
      pipeline: working ? pipeline : base.pipeline || pipeline,
      moneyHint:
        liveLine ||
        base.moneyHint ||
        buildMoneyHint({
          postsToday: state.postsToday,
          clicksSeen: state.learning.clicksSeen,
          freshAsins: base.freshAsins,
          peakWindow: peak,
        }),
      nextAction:
        base.nextAction ||
        buildNextAction({
          enabled: awake,
          working,
          peakWindow: peak,
          freshAsins: base.freshAsins,
          lastError: state.lastError,
        }),
    };
  }, [
    state.ops,
    state.learning.opsSnapshot,
    state.postsToday,
    state.learning.clicksSeen,
    state.lastError,
    peak,
    pipeline,
    working,
    awake,
    liveLine,
  ]);

  const stageIndex = PIPELINE.findIndex((p) => p.id === ops.pipeline);

  return (
    <>
      <div className="fixed right-4 bottom-4 z-[9999] flex flex-col items-end gap-2 md:right-6 md:bottom-6">
        <AnimatePresence>
          {working || (awake && liveLine) ? (
            <motion.div
              key={liveLine || state.statusMessage}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="max-w-[200px] border border-[#7f1d1d]/45 bg-[#120606]/95 px-3 py-1.5 text-[10px] tracking-wide text-[#fecaca] shadow-lg backdrop-blur-md"
            >
              <span className="mr-1.5 font-[family-name:var(--font-instrument-serif)] text-[12px] text-[#f87171]">
                RON
              </span>
              {liveLine || "Motor activo"}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <motion.button
          type="button"
          aria-label="RON · money machine"
          onClick={() => setOpen(true)}
          className="relative size-[4.5rem] overflow-hidden border-2 border-[#9f1239] bg-[#1a0505] p-1.5 shadow-[0_16px_48px_rgba(127,29,29,0.55)]"
          style={{ borderRadius: "22% 28% 24% 30%" }}
          initial={reduce ? false : { scale: 0.7, opacity: 0 }}
          animate={
            working && !reduce
              ? {
                  scale: [1, 1.05, 1],
                  y: [0, -3, 0],
                  opacity: 1,
                }
              : { scale: 1, opacity: 1, y: 0 }
          }
          transition={
            working
              ? { duration: 1.15, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.35 }
          }
          whileHover={reduce ? undefined : { scale: 1.05 }}
          whileTap={{ scale: 0.96 }}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(248,113,113,0.35),transparent_55%)]" />
          {working ? (
            <motion.span
              className="pointer-events-none absolute inset-[-5px] border border-[#ef4444]/40"
              style={{ borderRadius: "22% 28% 24% 30%" }}
              animate={{ opacity: [0.7, 0.15, 0.7], scale: [1, 1.08, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            />
          ) : null}
          <RedRobot awake={awake} working={working} />
          <span
            className={cn(
              "absolute top-1 right-1 size-2.5 border border-white/80",
              working ? "bg-[#fbbf24]" : awake ? "bg-[#22c55e]" : "bg-[#57534e]",
            )}
          />
        </motion.button>
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-[10000] flex items-end justify-end p-3 sm:p-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              className="absolute inset-0 bg-[#0a0404]/70 backdrop-blur-[2px]"
              aria-label="Cerrar"
              onClick={() => setOpen(false)}
            />
            <motion.aside
              role="dialog"
              aria-label="RON money machine"
              initial={reduce ? false : { y: 28, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ duration: 0.38, ease: EASE }}
              className="relative z-10 flex max-h-[min(90dvh,680px)] w-full max-w-[420px] flex-col overflow-hidden border border-[#7f1d1d]/50 bg-[#0c0404] text-white shadow-[0_24px_80px_rgba(0,0,0,0.65)]"
            >
              {/* Hero brand plane */}
              <div className="relative overflow-hidden border-b border-[#7f1d1d]/35">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(220,38,38,0.35),transparent_55%),linear-gradient(160deg,#1a0606_0%,#0c0404_55%,#140808_100%)]" />
                <div className="absolute inset-0 opacity-[0.07] [background-image:repeating-linear-gradient(0deg,transparent,transparent_11px,rgba(255,255,255,0.35)_12px)]" />
                <div className="relative flex items-start gap-3 px-4 pt-4 pb-3">
                  <motion.div
                    className="size-[4.25rem] shrink-0 overflow-hidden border border-[#9f1239]/60 bg-[#2a0a0a] p-1"
                    animate={
                      working && !reduce
                        ? { y: [0, -3, 0] }
                        : { y: 0 }
                    }
                    transition={{ duration: 1.1, repeat: Infinity }}
                  >
                    <RedRobot awake={awake} working={working} />
                  </motion.div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold tracking-[0.22em] text-[#f87171] uppercase">
                      Money machine
                    </p>
                    <h2 className="font-[family-name:var(--font-instrument-serif)] text-[34px] leading-none tracking-tight text-[#fecaca]">
                      RON
                    </h2>
                    <p className="mt-1.5 text-[12px] leading-snug text-white/70">
                      {ops.moneyHint}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="border border-white/10 p-1.5 text-white/55 hover:bg-white/5 hover:text-white"
                    aria-label="Cerrar panel"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {/* Pipeline */}
                <div className="relative grid grid-cols-4 gap-1 px-4 pb-3">
                  {PIPELINE.map((step, i) => {
                    const active =
                      working && (stageIndex === i || (stageIndex < 0 && i === 0));
                    const done = stageIndex > i;
                    return (
                      <div
                        key={step.id}
                        className={cn(
                          "border px-1.5 py-1.5 text-center text-[9px] font-semibold tracking-[0.14em] uppercase",
                          active
                            ? "border-[#f87171] bg-[#7f1d1d]/50 text-[#fecaca]"
                            : done
                              ? "border-[#14532d]/60 bg-[#14532d]/25 text-[#86efac]"
                              : "border-white/10 bg-black/20 text-white/40",
                        )}
                      >
                        {step.label}
                        {active ? (
                          <span className="mt-0.5 block size-1 mx-auto animate-pulse rounded-full bg-[#fbbf24]" />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3 overflow-y-auto px-4 py-3">
                {/* KPIs */}
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { k: "Posts", v: state.postsToday },
                    { k: "Clicks", v: state.learning.clicksSeen },
                    { k: "Fresh", v: ops.freshAsins },
                    { k: "Score", v: ops.lastMoneyScore || "—" },
                  ].map((m) => (
                    <div
                      key={m.k}
                      className="border border-white/10 bg-black/25 px-1.5 py-2 text-center"
                    >
                      <p className="text-[9px] font-semibold tracking-[0.16em] text-[#f87171] uppercase">
                        {m.k}
                      </p>
                      <p className="font-[family-name:var(--font-instrument-serif)] text-[20px] leading-none text-[#fecaca]">
                        {m.v}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-2 border border-white/10 bg-black/30 px-3 py-2">
                  <div>
                    <p className="text-[9px] font-semibold tracking-[0.16em] text-[#f87171] uppercase">
                      Ventana US
                    </p>
                    <p className="text-[13px] font-semibold text-white">
                      {peak ? "PICO · publicar" : "Off-peak · deals fuertes"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "size-2.5",
                      peak ? "bg-[#22c55e]" : "bg-[#a8a29e]",
                    )}
                  />
                </div>

                <p className="border-l-2 border-[#dc2626] pl-3 text-[12px] leading-relaxed text-white/75">
                  {ops.nextAction}
                </p>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void toggle(!awake)}
                  className={cn(
                    "flex h-12 w-full items-center justify-between px-4 text-left transition",
                    awake
                      ? "bg-[#dc2626] text-white"
                      : "border border-white/15 bg-white/5 text-white hover:bg-white/10",
                  )}
                >
                  <span>
                    <span className="block text-[9px] font-semibold tracking-[0.16em] uppercase opacity-70">
                      Autopilot
                    </span>
                    <span className="block text-[14px] font-semibold">
                      {awake
                        ? working
                          ? "EJECUTANDO"
                          : "ON · trabaja solo"
                        : "OFF"}
                    </span>
                  </span>
                  {busy ? (
                    <Loader2 className="size-5 animate-spin opacity-80" />
                  ) : (
                    <Power className="size-5 opacity-80" />
                  )}
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runNow(false)}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 border border-[#9f1239]/50 bg-[#2a0a0a] text-[13px] font-semibold text-[#fecaca] disabled:opacity-40"
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Radar className="size-4" />
                  )}
                  {working ? "Ciclo en curso…" : "Forzar ciclo ahora"}
                </button>

                <div className="flex flex-wrap gap-2 text-[11px]">
                  <Link
                    href="/facebook"
                    className="border border-white/15 px-3 py-1.5 font-medium text-[#fca5a5] hover:bg-white/5"
                    onClick={() => setOpen(false)}
                  >
                    Facebook studio
                  </Link>
                  <Link
                    href="/settings#facebook-store"
                    className="border border-white/15 px-3 py-1.5 font-medium text-[#fca5a5] hover:bg-white/5"
                    onClick={() => setOpen(false)}
                  >
                    Page token
                  </Link>
                </div>

                <div>
                  <p className="mb-1.5 text-[9px] font-semibold tracking-[0.18em] text-[#f87171] uppercase">
                    Ops log
                  </p>
                  {recent.length ? (
                    <ul className="divide-y divide-white/10 border border-white/10">
                      {recent.map((a, i) => (
                        <li
                          key={`${a.at}-${i}-${a.message.slice(0, 20)}`}
                          className="flex gap-2 px-2.5 py-2 text-[11px] leading-snug"
                        >
                          <span className="w-10 shrink-0 tabular-nums text-white/40">
                            {timeShort(a.at)}
                          </span>
                          <span
                            className={cn(
                              "w-11 shrink-0 font-semibold tracking-wide",
                              a.kind === "publish"
                                ? "text-[#86efac]"
                                : a.kind === "error"
                                  ? "text-[#fca5a5]"
                                  : "text-[#f87171]",
                            )}
                          >
                            {kindLabel(a.kind)}
                          </span>
                          <span className="min-w-0 flex-1 text-white/80">
                            {a.message}
                            {a.postUrl ? (
                              <a
                                href={a.postUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1 block font-semibold text-[#93c5fd] hover:underline"
                              >
                                Ver publicación →
                              </a>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="border border-dashed border-white/15 px-3 py-3 text-[12px] text-white/45">
                      Encendé el autopilot. RON escanea Keepa, rankea ROI y
                      publica solo.
                    </p>
                  )}
                </div>

                {state.lastError ? (
                  <p className="border border-[#fca5a5]/35 bg-[#7f1d1d]/35 px-3 py-2 text-[12px] text-[#fecaca]">
                    {state.lastError}
                  </p>
                ) : null}
              </div>
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
