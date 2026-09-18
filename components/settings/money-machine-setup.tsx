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

function ReadyBar({ pct, reduce }: { pct: number; reduce: boolean }) {
  return (
    <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.14em] text-[#9b9b9b] uppercase">
            Checklist
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-[#191919]">
            {pct}%
          </p>
        </div>
        <p className="text-[12px] text-[#707070]">listo para operar</p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#efefef]">
        <motion.div
          className="h-full rounded-full bg-[#191919]"
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: EASE }}
        />
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
    }, 2600);
    return () => window.clearInterval(id);
  }, [active, reduce, steps.length]);

  if (!steps.length) return null;

  return (
    <div className="relative mt-3 overflow-hidden rounded-xl border border-[#e5e5e5] bg-[#f7f7f7] p-4">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] text-[#9b9b9b] uppercase">
          <LiveDot tone="muted" />
          Cómo configurarlo
        </p>
        <div className="flex gap-1">
          {steps.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1 w-4 rounded-full transition-colors",
                i === step ? "bg-[#191919]" : "bg-[#d8d8d8]",
              )}
            />
          ))}
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -6 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="min-h-[76px]"
        >
          <p className="text-[11px] text-[#9b9b9b]">
            Paso {step + 1} / {steps.length}
          </p>
          <p className="mt-1 text-[15px] font-semibold tracking-tight text-[#191919]">
            {steps[step]?.title}
          </p>
          <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-[#707070]">
            {steps[step]?.detail}
          </p>
        </motion.div>
      </AnimatePresence>
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
      <div className="flex min-h-[180px] items-center justify-center rounded-2xl border border-[#e5e5e5] bg-white">
        <Loader2 className="size-5 animate-spin text-[#9b9b9b]" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <motion.section
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="rounded-2xl border border-[#e5e5e5] bg-white p-5"
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xl">
            <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-[#9b9b9b] uppercase">
              <ShieldCheck className="size-3.5" />
              Money Machine · Setup
            </p>
            <h2 className="mt-1.5 text-[17px] font-semibold tracking-tight text-[#191919]">
              Panel de APIs
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-[#707070]">
              Interruptores aquí, secretos fuertes en Vercel, Associate Tag
              abajo. La máquina solo corre cuando el checklist está limpio.
            </p>
            {data.missingRequired.length ? (
              <p className="mt-3 inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[12px] text-amber-950">
                Faltan: {data.missingRequired.join(" · ")}
              </p>
            ) : (
              <p className="mt-3 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[12px] text-emerald-900">
                Núcleo listo — alimenta Find Winners y enciende Autopilot
              </p>
            )}
          </div>
          <div className="w-full sm:max-w-[220px]">
            <ReadyBar pct={data.readyPct} reduce={reduce} />
          </div>
        </div>
      </motion.section>

      {groups.map((group, gi) => (
        <motion.section
          key={group.id}
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 * (gi + 1), ease: EASE }}
          className="space-y-2.5"
        >
          <div className="flex items-end justify-between px-0.5">
            <h3 className="text-[14px] font-semibold tracking-tight text-[#191919]">
              {group.label}
            </h3>
            <p className="text-[11px] font-semibold tracking-[0.12em] text-[#9b9b9b] uppercase">
              {group.items.length} módulos
            </p>
          </div>

          <div className="space-y-2">
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
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.02 * si, duration: 0.3, ease: EASE }}
                  className={cn(
                    "overflow-hidden rounded-2xl border bg-white transition",
                    open ? "border-[#cfcfcf]" : "border-[#e5e5e5]",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : svc.id)}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#e5e5e5] bg-[#f7f7f7] text-[#191919]">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-semibold text-[#191919]">
                          {svc.title}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
                            meta.tone === "ok" && "bg-emerald-50 text-emerald-800",
                            meta.tone === "opt" && "bg-sky-50 text-sky-900",
                            meta.tone === "warn" && "bg-amber-50 text-amber-900",
                            meta.tone === "bad" && "bg-rose-50 text-rose-800",
                          )}
                        >
                          {meta.label}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[12.5px] text-[#707070]">
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
                        transition={{ duration: 0.28, ease: EASE }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-3 border-t border-[#f0f0f0] px-4 pb-4 pt-3">
                          <p className="text-[12px] text-[#8a8a8a]">
                            Para: <span className="text-[#444]">{svc.requiredFor}</span>
                          </p>

                          {svc.toggleable && prefKey ? (
                            <div className="flex items-center justify-between gap-3 rounded-xl border border-[#e5e5e5] bg-[#f7f7f7] px-3.5 py-3">
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
                            <div className="space-y-2 rounded-xl border border-[#e5e5e5] bg-white p-3.5">
                              <Label className="text-[10px] font-semibold tracking-[0.12em] text-[#9b9b9b] uppercase">
                                Amazon Associate Tracking ID
                              </Label>
                              <div className="flex flex-col gap-2 sm:flex-row">
                                <Input
                                  value={prefs.associateTag}
                                  placeholder="tu-tienda-20"
                                  onChange={(e) =>
                                    setPrefs({ ...prefs, associateTag: e.target.value })
                                  }
                                  className="h-10 rounded-xl border-[#e5e5e5] bg-white"
                                />
                                <Button
                                  type="button"
                                  disabled={saving}
                                  onClick={() =>
                                    void save({ associateTag: prefs.associateTag })
                                  }
                                  className="h-10 shrink-0 rounded-full bg-[#191919] px-5 font-semibold text-white hover:bg-[#191919]/90"
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
                              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#3665F3] underline-offset-4 hover:underline"
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
