"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import {
  Bot,
  ChevronDown,
  Database,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
  Radar,
  ShieldCheck,
  Sparkles,
  Store,
  Wand2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LiveDot } from "@/components/ui/studio";
import { cn } from "@/lib/utils";
import type { MoneyMachinePrefs } from "@/lib/monetization/machine-setup";

type ServiceRow = {
  id: string;
  title: string;
  subtitle: string;
  requiredFor: string;
  toggleable: boolean;
  configField?: "associate_tag" | null;
  howTo: Array<{ title: string; detail: string }>;
  docsUrl?: string;
  status: "ready" | "connected" | "missing" | "optional" | "warn";
  detail: string;
};

type Payload = {
  prefs: MoneyMachinePrefs;
  services: ServiceRow[];
  readyPct: number;
  missingRequired: string[];
};

const EASE = [0.22, 1, 0.36, 1] as const;

const TOGGLE_MAP: Record<string, keyof MoneyMachinePrefs> = {
  money_engine: "moneyEngine",
  amazon_associates: "affiliateEngine",
  smart_links: "smartLinks",
  autopilot: "autopilot",
  openai: "openaiPref",
  google_vision: "visionPref",
  keepa: "keepaPref",
};

const ICONS: Record<string, typeof Sparkles> = {
  supabase: Database,
  monetization_db: Database,
  ebay_seller: Store,
  amazon_seller: Store,
  openai: Wand2,
  google_vision: Radar,
  keepa: Radar,
  amazon_associates: KeyRound,
  smart_links: Link2,
  money_engine: Sparkles,
  autopilot: Bot,
};

function statusMeta(status: ServiceRow["status"]) {
  if (status === "ready" || status === "connected")
    return { label: status === "connected" ? "Conectado" : "Listo", tone: "ok" as const };
  if (status === "optional") return { label: "Opcional", tone: "opt" as const };
  if (status === "warn") return { label: "Revisar", tone: "warn" as const };
  return { label: "Falta", tone: "bad" as const };
}

function ReadyRing({ pct, reduce }: { pct: number; reduce: boolean }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <div className="relative size-[7.5rem]">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
        <motion.circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#f4c928"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={reduce ? false : { strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.1, ease: EASE }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="font-display text-3xl tabular-nums text-[#f4c928]">{pct}%</p>
          <p className="text-[10px] font-semibold tracking-[0.16em] text-white/45 uppercase">
            Listo
          </p>
        </div>
      </div>
    </div>
  );
}

function HowToReel({
  steps,
  active,
  reduce,
}: {
  steps: Array<{ title: string; detail: string }>;
  active: boolean;
  reduce: boolean;
}) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!active || reduce || steps.length < 2) return;
    setStep(0);
    const id = window.setInterval(() => {
      setStep((s) => (s + 1) % steps.length);
    }, 2400);
    return () => window.clearInterval(id);
  }, [active, reduce, steps.length]);

  if (!steps.length) return null;

  return (
    <div className="relative mt-4 overflow-hidden rounded-[22px] border border-black/5 bg-gradient-to-br from-[#111] via-[#1a1a1a] to-[#0c0c0c] p-4 text-white">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.18em] text-[#f4c928] uppercase">
          <LiveDot />
          Cómo configurarlo
        </p>
        <div className="flex gap-1">
          {steps.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1 w-5 rounded-full transition-colors",
                i === step ? "bg-[#f4c928]" : "bg-white/15",
              )}
            />
          ))}
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={reduce ? false : { opacity: 0, y: 12, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={reduce ? undefined : { opacity: 0, y: -8, filter: "blur(4px)" }}
          transition={{ duration: 0.4, ease: EASE }}
          className="min-h-[88px]"
        >
          <p className="text-[11px] text-white/40">
            Paso {step + 1} / {steps.length}
          </p>
          <p className="mt-1 font-display text-[1.65rem] leading-tight tracking-tight">
            {steps[step]?.title}
          </p>
          <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-white/65">
            {steps[step]?.detail}
          </p>
        </motion.div>
      </AnimatePresence>
      {!reduce ? (
        <motion.div
          className="pointer-events-none absolute -right-10 top-1/2 size-40 -translate-y-1/2 rounded-full bg-[#f4c928]/15 blur-2xl"
          animate={{ opacity: [0.25, 0.5, 0.25], scale: [1, 1.08, 1] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : null}
    </div>
  );
}

export function MoneyMachineSetupForm() {
  const reduce = useReducedMotion() ?? false;
  const [data, setData] = useState<Payload | null>(null);
  const [prefs, setPrefs] = useState<MoneyMachinePrefs | null>(null);
  const [openId, setOpenId] = useState<string | null>("amazon_associates");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/money-machine", { cache: "no-store" });
      if (!res.ok) {
        toast.error("Could not load Money Machine setup");
        return;
      }
      const body = (await res.json()) as Payload;
      setData(body);
      setPrefs(body.prefs);
    } catch {
      toast.error("Could not load Money Machine setup");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const groups = useMemo(() => {
    if (!data) return [];
    const core = data.services.filter((s) =>
      ["money_engine", "autopilot", "smart_links", "amazon_associates"].includes(s.id),
    );
    const markets = data.services.filter((s) =>
      ["ebay_seller", "amazon_seller", "keepa"].includes(s.id),
    );
    const brain = data.services.filter((s) =>
      ["openai", "google_vision", "supabase", "monetization_db"].includes(s.id),
    );
    return [
      { id: "core", label: "Núcleo Money", items: core },
      { id: "markets", label: "Mercados", items: markets },
      { id: "brain", label: "Cerebro & datos", items: brain },
    ];
  }, [data]);

  const save = async (patch: Partial<MoneyMachinePrefs>) => {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setSaving(true);
    try {
      const res = await fetch("/api/settings/money-machine", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const body = (await res.json()) as { error?: string; prefs?: MoneyMachinePrefs };
      if (!res.ok) {
        toast.error(body.error || "Could not save");
        await reload();
        return;
      }
      if (body.prefs) setPrefs(body.prefs);
      toast.success("Guardado");
      await reload();
    } catch {
      toast.error("Could not save");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !data || !prefs) {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded-[28px] border border-[#e8e8e8] bg-white">
        <Loader2 className="size-5 animate-spin text-[#9b9b9b]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.section
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: EASE }}
        className="relative overflow-hidden rounded-[32px] bg-[#101010] px-5 py-6 text-white sm:px-8 sm:py-8"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(244,201,40,0.18),transparent_55%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.5)_1px,transparent_1px)] [background-size:28px_28px]" />

        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] text-[#f4c928] uppercase">
              <ShieldCheck className="size-3.5" />
              Money Machine · Setup
            </p>
            <h2 className="mt-3 font-display text-[2.6rem] leading-[0.95] tracking-tight sm:text-[3.25rem]">
              Panel de APIs
              <span className="block italic text-[#f4c928]">premium</span>
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-white/65">
              Organiza cada conexión como un instrumento. Interruptores aquí,
              secretos fuertes en Vercel, Associate Tag pegado abajo. La máquina
              solo corre cuando el checklist está limpio.
            </p>
            {data.missingRequired.length ? (
              <p className="mt-4 inline-flex rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-[12px] text-amber-100">
                Faltan: {data.missingRequired.join(" · ")}
              </p>
            ) : (
              <p className="mt-4 inline-flex rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-[12px] text-emerald-100">
                Núcleo listo — alimenta Find Winners y enciende Autopilot
              </p>
            )}
          </div>
          <ReadyRing pct={data.readyPct} reduce={reduce} />
        </div>
      </motion.section>

      {groups.map((group, gi) => (
        <motion.section
          key={group.id}
          initial={reduce ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08 * (gi + 1), ease: EASE }}
          className="space-y-3"
        >
          <div className="flex items-end justify-between px-1">
            <h3 className="font-display text-2xl tracking-tight text-[#191919]">
              {group.label}
            </h3>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[#9b9b9b] uppercase">
              {group.items.length} módulos
            </p>
          </div>

          <div className="space-y-2.5">
            {group.items.map((svc, si) => {
              const open = openId === svc.id;
              const prefKey = TOGGLE_MAP[svc.id] as keyof MoneyMachinePrefs | undefined;
              const toggled =
                prefKey && typeof prefs[prefKey] === "boolean"
                  ? Boolean(prefs[prefKey])
                  : false;
              const meta = statusMeta(svc.status);
              const Icon = ICONS[svc.id] || Sparkles;

              return (
                <motion.div
                  key={svc.id}
                  layout
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.03 * si, duration: 0.35, ease: EASE }}
                  className={cn(
                    "overflow-hidden rounded-[26px] border bg-white transition-shadow",
                    open
                      ? "border-[#f4c928]/50 shadow-[0_18px_50px_-28px_rgba(0,0,0,0.35)]"
                      : "border-[#ececec] hover:border-[#ddd]",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : svc.id)}
                    className="flex w-full items-center gap-3.5 px-4 py-4 text-left sm:px-5"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#111] text-[#f4c928]">
                      <Icon className="size-4.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-semibold text-[#191919]">
                          {svc.title}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
                            meta.tone === "ok" && "bg-emerald-500/12 text-emerald-800",
                            meta.tone === "opt" && "bg-sky-500/10 text-sky-900",
                            meta.tone === "warn" && "bg-amber-500/12 text-amber-900",
                            meta.tone === "bad" && "bg-rose-500/10 text-rose-800",
                          )}
                        >
                          {meta.label}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] text-[#707070]">
                        {svc.subtitle}
                        {svc.detail ? ` · ${svc.detail}` : ""}
                      </span>
                    </span>
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-[#aaa] transition-transform",
                        open && "rotate-180",
                      )}
                    />
                  </button>

                  <AnimatePresence initial={false}>
                    {open ? (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.32, ease: EASE }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-4 border-t border-[#f0f0f0] px-4 pb-5 pt-4 sm:px-5">
                          <p className="text-[12.5px] text-[#8a8a8a]">
                            Para: <span className="text-[#444]">{svc.requiredFor}</span>
                          </p>

                          {svc.toggleable && prefKey ? (
                            <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#f6f6f6] px-3.5 py-3.5">
                              <div>
                                <p className="text-[13px] font-semibold text-[#191919]">
                                  Usar en la máquina
                                </p>
                                <p className="text-[12px] text-[#707070]">
                                  Preferencia Higlou (además del flag Vercel)
                                </p>
                              </div>
                              <Switch
                                checked={toggled}
                                disabled={saving}
                                onCheckedChange={(v) =>
                                  void save({ [prefKey]: v } as Partial<MoneyMachinePrefs>)
                                }
                              />
                            </div>
                          ) : null}

                          {svc.configField === "associate_tag" ? (
                            <div className="space-y-2 rounded-[20px] border border-[#eee] bg-[#fcfcfc] p-3.5">
                              <Label className="text-[11px] font-semibold tracking-[0.12em] text-[#9b9b9b] uppercase">
                                Amazon Associate Tracking ID
                              </Label>
                              <div className="flex flex-col gap-2 sm:flex-row">
                                <Input
                                  value={prefs.associateTag}
                                  placeholder="tu-tienda-20"
                                  onChange={(e) =>
                                    setPrefs({ ...prefs, associateTag: e.target.value })
                                  }
                                  className="h-11 rounded-xl border-[#e5e5e5] bg-white"
                                />
                                <Button
                                  type="button"
                                  disabled={saving}
                                  onClick={() =>
                                    void save({ associateTag: prefs.associateTag })
                                  }
                                  className="h-11 shrink-0 rounded-xl bg-[#f4c928] px-5 font-semibold text-[#141414] hover:bg-[#f4c928]/90"
                                >
                                  Guardar tag
                                </Button>
                              </div>
                            </div>
                          ) : null}

                          <HowToReel steps={svc.howTo} active={open} reduce={reduce} />

                          {svc.docsUrl ? (
                            <Link
                              href={svc.docsUrl}
                              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#191919] underline-offset-4 hover:underline"
                            >
                              Abrir guía
                              <ExternalLink className="size-3.5" />
                            </Link>
                          ) : null}
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </motion.section>
      ))}
    </div>
  );
}
