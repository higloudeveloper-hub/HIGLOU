"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { Loader2, Power, Radar, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RonActivity, RonPublicState } from "@/lib/ron/types";

const EASE = [0.22, 1, 0.36, 1] as const;

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
};

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
      /* keep last known — robot stays visible */
    }
  }, [busy]);

  // Adaptive poll: live while working, slow when idle
  useEffect(() => {
    void refresh();
    const ms = busy || state.working ? 1_800 : state.enabled ? 8_000 : 40_000;
    const id = window.setInterval(() => void refresh(), ms);
    return () => window.clearInterval(id);
  }, [refresh, busy, state.working, state.enabled]);

  // On enable: kick one cycle so you see RON move immediately
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
            toast.success("RON publicó solo", {
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

  // Heartbeat while on — every 3 min so opportunities don't sit idle
  useEffect(() => {
    if (!state.enabled || !authed) return;
    const id = window.setInterval(() => {
      setLiveLine("Ciclo automático…");
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
            toast.success("RON publicó solo", {
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
    }, 3 * 60_000);
    return () => window.clearInterval(id);
  }, [state.enabled, authed, refresh]);

  const toggle = async (enabled: boolean) => {
    if (!authed) {
      toast.message("Iniciá sesión para encender a RON");
      return;
    }
    setBusy(true);
    setLiveLine(enabled ? "Encendiendo…" : "Apagando…");
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
        enabled ? "RON encendido · trabaja solo" : "RON apagado",
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
    setLiveLine("RON en movimiento…");
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
        toast.success("RON publicó en tu Page", {
          action: body.postUrl
            ? {
                label: "Ver post",
                onClick: () => window.open(body.postUrl!, "_blank"),
              }
            : undefined,
        });
      } else if (!silent) {
        toast.message(body.skipped || "RON terminó el ciclo");
      }
    } finally {
      setBusy(false);
      setLiveLine(null);
      void refresh();
    }
  };

  const awake = state.enabled;
  const working = busy || state.working;
  const recent: RonActivity[] = state.activity.slice(0, 8);
  const bubbleText =
    liveLine ||
    (working ? state.statusMessage : null) ||
    (awake && state.statusMessage.startsWith("Listo")
      ? null
      : awake
        ? state.statusMessage
        : null);

  return (
    <>
      <div className="fixed right-4 bottom-4 z-[9999] flex flex-col items-end gap-2 md:right-6 md:bottom-6">
        <AnimatePresence>
          {bubbleText ? (
            <motion.div
              key={bubbleText}
              initial={reduce ? false : { opacity: 0, y: 8, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.96 }}
              transition={{ duration: 0.28, ease: EASE }}
              className="max-w-[220px] rounded-2xl border border-[#7f1d1d]/50 bg-[#1c0909]/95 px-3 py-2 text-[11px] leading-snug text-[#fecaca] shadow-lg backdrop-blur-sm"
            >
              <span className="mb-0.5 block text-[9px] font-semibold tracking-[0.16em] text-[#f87171] uppercase">
                {working ? "En vivo" : "RON"}
              </span>
              {bubbleText}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <motion.button
          type="button"
          aria-label="RON · agente Higlou"
          onClick={() => setOpen(true)}
          className="relative size-[4.25rem] rounded-full border-2 border-[#7f1d1d] bg-[#450a0a] p-1.5 shadow-[0_12px_40px_rgba(185,28,28,0.45)]"
          initial={reduce ? false : { scale: 0.7, opacity: 0 }}
          animate={
            working && !reduce
              ? {
                  scale: [1, 1.06, 1],
                  x: [0, -3, 3, -2, 0],
                  y: [0, -4, 0, -2, 0],
                  opacity: 1,
                }
              : { scale: 1, opacity: 1, x: 0, y: 0 }
          }
          transition={
            working
              ? { duration: 1.1, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.35 }
          }
          whileHover={reduce ? undefined : { scale: 1.06 }}
          whileTap={{ scale: 0.96 }}
        >
          {working ? (
            <motion.span
              className="pointer-events-none absolute inset-[-6px] rounded-full border-2 border-[#ef4444]/50"
              animate={{ scale: [1, 1.18, 1], opacity: [0.7, 0.15, 0.7] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            />
          ) : null}
          <RedRobot awake={awake} working={working} />
          {awake ? (
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 size-3 rounded-full border-2 border-white",
                working ? "bg-[#fbbf24]" : "bg-[#22c55e]",
              )}
            />
          ) : null}
        </motion.button>
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-[10000] flex items-end justify-end p-4 md:items-end md:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              className="absolute inset-0 bg-black/35"
              aria-label="Cerrar"
              onClick={() => setOpen(false)}
            />
            <motion.aside
              role="dialog"
              aria-label="RON agente"
              initial={reduce ? false : { y: 24, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 16, opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="relative z-10 flex max-h-[min(86dvh,620px)] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-[#7f1d1d]/40 bg-[#1c0909] text-white shadow-2xl"
            >
              <div className="flex items-start gap-3 border-b border-white/10 px-4 py-3.5">
                <motion.div
                  className="size-14 shrink-0 overflow-hidden rounded-2xl bg-[#450a0a] p-1"
                  animate={
                    working && !reduce
                      ? { rotate: [-4, 4, -4], y: [0, -2, 0] }
                      : { rotate: 0, y: 0 }
                  }
                  transition={{ duration: 0.9, repeat: Infinity }}
                >
                  <RedRobot awake={awake} working={working} />
                </motion.div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold tracking-[0.18em] text-[#fca5a5] uppercase">
                    Agente Higlou
                  </p>
                  <h2 className="text-[18px] font-semibold tracking-tight">
                    RON
                    {working ? (
                      <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide text-[#fbbf24] uppercase">
                        <span className="size-1.5 animate-pulse rounded-full bg-[#fbbf24]" />
                        trabajando
                      </span>
                    ) : null}
                  </h2>
                  <p className="mt-0.5 text-[12px] leading-snug text-white/65">
                    {state.statusMessage}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
                  aria-label="Cerrar panel"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="space-y-3 overflow-y-auto px-4 py-3">
                <p className="text-[13px] leading-relaxed text-white/75">
                  En cada escaneo general activa las 6 modalidades Keepa,
                  busca oportunidades reales y solo republica una vitrina si
                  ya está generando clicks — si no, publica variedad nueva.
                </p>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-2xl bg-white/5 px-2 py-2">
                    <p className="text-[10px] font-semibold tracking-wide text-[#fca5a5] uppercase">
                      Hoy
                    </p>
                    <p className="text-[16px] font-semibold">
                      {state.postsToday}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/5 px-2 py-2">
                    <p className="text-[10px] font-semibold tracking-wide text-[#fca5a5] uppercase">
                      Clicks
                    </p>
                    <p className="text-[16px] font-semibold">
                      {state.learning.clicksSeen}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/5 px-2 py-2">
                    <p className="text-[10px] font-semibold tracking-wide text-[#fca5a5] uppercase">
                      Ciclos
                    </p>
                    <p className="text-[16px] font-semibold">
                      {state.learning.cycles}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void toggle(!awake)}
                  className={cn(
                    "flex h-12 w-full items-center justify-between rounded-2xl px-4 text-left transition",
                    awake
                      ? "bg-[#dc2626] text-white"
                      : "bg-white/10 text-white hover:bg-white/15",
                  )}
                >
                  <span>
                    <span className="block text-[10px] font-semibold tracking-[0.14em] uppercase opacity-70">
                      Estado
                    </span>
                    <span className="block text-[14px] font-semibold">
                      {awake
                        ? working
                          ? "EN MOVIMIENTO"
                          : "ENCENDIDO · trabaja solo"
                        : "APAGADO"}
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
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 text-[13px] font-semibold text-white disabled:opacity-40"
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Radar className="size-4" />
                  )}
                  {working ? "Trabajando…" : "Trabajar ahora"}
                </button>

                <div className="flex flex-wrap gap-2 text-[11px]">
                  <Link
                    href="/facebook"
                    className="rounded-full border border-white/15 px-3 py-1.5 font-medium text-[#fca5a5] hover:bg-white/5"
                    onClick={() => setOpen(false)}
                  >
                    Facebook studio
                  </Link>
                  <Link
                    href="/settings#facebook-store"
                    className="rounded-full border border-white/15 px-3 py-1.5 font-medium text-[#fca5a5] hover:bg-white/5"
                    onClick={() => setOpen(false)}
                  >
                    Conectar Page
                  </Link>
                </div>

                {recent.length ? (
                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold tracking-[0.16em] text-[#fca5a5] uppercase">
                      Actividad en vivo
                    </p>
                    <ul className="space-y-1.5">
                      <AnimatePresence initial={false}>
                        {recent.map((a, i) => (
                          <motion.li
                            key={`${a.at}-${i}-${a.message.slice(0, 24)}`}
                            initial={
                              reduce ? false : { opacity: 0, x: 8 }
                            }
                            animate={{ opacity: 1, x: 0 }}
                            className={cn(
                              "rounded-xl px-3 py-2 text-[12px] leading-snug",
                              a.kind === "publish"
                                ? "bg-[#14532d]/50 text-[#bbf7d0]"
                                : a.kind === "error"
                                  ? "bg-[#7f1d1d]/40 text-[#fecaca]"
                                  : "bg-white/5 text-white/80",
                            )}
                          >
                            <span className="mr-1.5 font-semibold text-[#fca5a5]">
                              {a.kind}
                            </span>
                            {a.message}
                            {a.postUrl ? (
                              <a
                                href={a.postUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1 block font-semibold text-[#93c5fd] hover:underline"
                              >
                                Ver post
                              </a>
                            ) : null}
                          </motion.li>
                        ))}
                      </AnimatePresence>
                    </ul>
                  </div>
                ) : (
                  <p className="rounded-xl bg-white/5 px-3 py-2 text-[12px] text-white/55">
                    Encendé a RON o tocá “Trabajar ahora” para ver el ciclo en
                    vivo.
                  </p>
                )}

                {state.lastError ? (
                  <p className="rounded-xl border border-[#fca5a5]/30 bg-[#7f1d1d]/40 px-3 py-2 text-[12px] text-[#fecaca]">
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
