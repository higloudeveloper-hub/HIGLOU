"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import {
  ChevronDown,
  ExternalLink,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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

const TOGGLE_MAP: Record<string, keyof MoneyMachinePrefs> = {
  money_engine: "moneyEngine",
  amazon_associates: "affiliateEngine",
  smart_links: "smartLinks",
  autopilot: "autopilot",
  openai: "openaiPref",
  google_vision: "visionPref",
  keepa: "keepaPref",
};

function statusTone(status: ServiceRow["status"]) {
  if (status === "ready" || status === "connected")
    return "bg-emerald-500/15 text-emerald-800";
  if (status === "optional") return "bg-sky-500/10 text-sky-900";
  if (status === "warn") return "bg-amber-500/15 text-amber-900";
  return "bg-rose-500/10 text-rose-900";
}

function statusLabel(status: ServiceRow["status"]) {
  if (status === "ready") return "Listo";
  if (status === "connected") return "Conectado";
  if (status === "optional") return "Opcional";
  if (status === "warn") return "Revisar";
  return "Falta";
}

function HowToAnimation({
  steps,
  active,
}: {
  steps: Array<{ title: string; detail: string }>;
  active: boolean;
}) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!active) return;
    setStep(0);
    const id = window.setInterval(() => {
      setStep((s) => (s + 1) % Math.max(steps.length, 1));
    }, 2200);
    return () => window.clearInterval(id);
  }, [active, steps.length]);

  if (!steps.length) return null;

  return (
    <div className="relative mt-3 overflow-hidden rounded-2xl border border-[#e8e8e8] bg-[#fafafa] p-4">
      <div className="mb-3 flex gap-1.5">
        {steps.map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i === step ? "bg-[#f4c928]" : "bg-[#e5e5e5]",
            )}
          />
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="min-h-[72px]"
        >
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[#9b9b9b] uppercase">
            Paso {step + 1} de {steps.length}
          </p>
          <p className="mt-1 text-[15px] font-semibold text-[#191919]">
            {steps[step]?.title}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-[#707070]">
            {steps[step]?.detail}
          </p>
        </motion.div>
      </AnimatePresence>
      <motion.div
        className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-[#f4c928]/20"
        animate={active ? { scale: [1, 1.15, 1], opacity: [0.35, 0.55, 0.35] } : {}}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

export function MoneyMachineSetupForm() {
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
      toast.success("Saved");
      await reload();
    } catch {
      toast.error("Could not save");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !data || !prefs) {
    return (
      <div className="flex items-center gap-2 rounded-3xl border border-border/80 bg-surface px-5 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Checking APIs and connections…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-[28px] border border-[#e5e5e5] bg-[#141414] p-5 text-white sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-[#f4c928] uppercase">
              <Sparkles className="size-3.5" />
              Money Machine setup
            </p>
            <h2 className="mt-1 font-display text-3xl tracking-tight">
              Panel de APIs
            </h2>
            <p className="mt-2 max-w-xl text-sm text-white/65">
              Todo lo que la máquina necesita para buscar dinero en tus mercados.
              Interruptores aquí; secretos fuertes (OpenAI, Keepa, Vision) viven en
              Vercel. Associate Tag sí lo pegas abajo.
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 px-4 py-3 text-right">
            <p className="text-[11px] tracking-[0.14em] text-white/50 uppercase">
              Listo
            </p>
            <p className="font-display text-3xl tabular-nums text-[#f4c928]">
              {data.readyPct}%
            </p>
          </div>
        </div>
        {data.missingRequired.length ? (
          <p className="mt-4 rounded-xl bg-amber-500/15 px-3 py-2 text-[13px] text-amber-100">
            Aún faltan piezas clave: {data.missingRequired.join(", ")}. Abre cada
            tarjeta y sigue la animación.
          </p>
        ) : (
          <p className="mt-4 rounded-xl bg-emerald-500/15 px-3 py-2 text-[13px] text-emerald-100">
            Piezas clave OK. Alimenta Find Winners y usa Autopilot en Money Center.
          </p>
        )}
      </div>

      <div className="space-y-3">
        {data.services.map((svc) => {
          const open = openId === svc.id;
          const prefKey = TOGGLE_MAP[svc.id] as keyof MoneyMachinePrefs | undefined;
          const toggled =
            prefKey && typeof prefs[prefKey] === "boolean"
              ? Boolean(prefs[prefKey])
              : false;

          return (
            <div
              key={svc.id}
              className="overflow-hidden rounded-[24px] border border-[#e5e5e5] bg-white"
            >
              <button
                type="button"
                onClick={() => setOpenId(open ? null : svc.id)}
                className="flex w-full items-start gap-3 px-4 py-4 text-left sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[15px] font-semibold text-[#191919]">
                      {svc.title}
                    </p>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
                        statusTone(svc.status),
                      )}
                    >
                      {statusLabel(svc.status)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[13px] text-[#707070]">{svc.subtitle}</p>
                  <p className="mt-1 text-[12px] text-[#9b9b9b]">
                    Para: {svc.requiredFor}
                    {svc.detail ? ` · ${svc.detail}` : ""}
                  </p>
                </div>
                <ChevronDown
                  className={cn(
                    "mt-1 size-4 shrink-0 text-[#9b9b9b] transition",
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
                    transition={{ duration: 0.28 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-4 border-t border-[#eee] px-4 py-4 sm:px-5">
                      {svc.toggleable && prefKey ? (
                        <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#f7f7f7] px-3 py-3">
                          <div>
                            <p className="text-[13px] font-semibold">Usar en la máquina</p>
                            <p className="text-[12px] text-[#707070]">
                              Preferencia Higlou (además del flag en Vercel)
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
                        <div className="space-y-2 rounded-2xl border border-[#e8e8e8] p-3">
                          <Label className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#9b9b9b]">
                            Amazon Associate Tracking ID
                          </Label>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Input
                              value={prefs.associateTag}
                              placeholder="tu-tienda-20"
                              onChange={(e) =>
                                setPrefs({ ...prefs, associateTag: e.target.value })
                              }
                              className="h-10"
                            />
                            <Button
                              type="button"
                              disabled={saving}
                              onClick={() =>
                                void save({ associateTag: prefs.associateTag })
                              }
                              className="h-10 shrink-0 bg-[#f4c928] text-[#141414] hover:bg-[#f4c928]/90"
                            >
                              Guardar tag
                            </Button>
                          </div>
                          <p className="text-[12px] text-[#707070]">
                            No es tu Seller ID. Es el tag de Affiliates para links con
                            comisión.
                          </p>
                        </div>
                      ) : null}

                      <HowToAnimation steps={svc.howTo} active={open} />

                      {svc.docsUrl ? (
                        <Link
                          href={svc.docsUrl}
                          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#3665F3]"
                        >
                          Abrir guía / pantalla
                          <ExternalLink className="size-3.5" />
                        </Link>
                      ) : null}
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-dashed border-[#d8d8d8] px-4 py-3 text-[13px] text-[#707070]">
        <strong className="text-[#191919]">Resumen de APIs que suelen faltar:</strong>{" "}
        Keepa (winners), Amazon Associates tag (afiliados), migration SQL Money
        tables, y a veces Google Vision. eBay/Amazon seller se conectan en la pestaña
        Stores.
      </div>
    </div>
  );
}
