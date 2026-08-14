"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { motion } from "motion/react";
import {
  Barcode,
  ChevronDown,
  Eye,
  FileSpreadsheet,
  Loader2,
  Palette,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ListingPipeline } from "@/components/studio/listing-pipeline";
import { LiveDot } from "@/components/ui/studio";
import { cn } from "@/lib/utils";

export type AiProviderSettings = {
  openaiEnabled: boolean;
  googleVisionEnabled: boolean;
  barcodeEnabled: boolean;
  googleVisionMode: "off" | "fallback" | "always";
  googleVisionMaxImages: number;
  documentTextFallback: boolean;
  allowImproveOcr: boolean;
  maxAnalysisImages: number;
  minConfidence: number;
  barcodeEnhancedContrast: boolean;
  barcodeTryRotation: boolean;
  preferBarcodeOverOcr: boolean;
  validateUpcEanChecksum: boolean;
  /** Commercial UX: automatic hides technical decisions */
  analysisMode: "automatic" | "custom";
};

export const AI_SETTINGS_STORAGE_KEY = "higlou-ai-settings";

const DEFAULTS: AiProviderSettings = {
  openaiEnabled: true,
  googleVisionEnabled: true,
  barcodeEnabled: true,
  googleVisionMode: "fallback",
  googleVisionMaxImages: 4,
  documentTextFallback: true,
  allowImproveOcr: true,
  maxAnalysisImages: 12,
  minConfidence: 0.6,
  barcodeEnhancedContrast: true,
  barcodeTryRotation: true,
  preferBarcodeOverOcr: true,
  validateUpcEanChecksum: true,
  analysisMode: "automatic",
};

type ServiceCard = {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  status: "connected" | "ready" | "missing" | "checking";
};

type HealthResponse = {
  ok: boolean;
  summary: string;
  checks: Array<{
    id: string;
    label: string;
    status: "ok" | "warn" | "fail";
    detail: string;
  }>;
};

type CostsSnapshot = {
  snapshot?: {
    productsProcessed: number;
    openAICost: number;
    googleVisionCost: number;
    ocrUnits: number;
  };
  budget?: { monthlyProductTarget: number };
  projection?: { estimatedAiCostToDate: number };
};

export function readAiProviderSettings(): AiProviderSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = { ...DEFAULTS, ...JSON.parse(raw) } as AiProviderSettings;
    if (parsed.analysisMode === "automatic") {
      return {
        ...parsed,
        openaiEnabled: true,
        googleVisionEnabled: true,
        barcodeEnabled: true,
        googleVisionMode: "fallback",
      };
    }
    return parsed;
  } catch {
    return DEFAULTS;
  }
}

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

export function AiSettingsForm() {
  const [settings, setSettings] = useState<AiProviderSettings>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [costs, setCosts] = useState<CostsSnapshot | null>(null);
  const [csvCount, setCsvCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setSettings(readAiProviderSettings());
        setHydrated(true);
      }
    });

    void fetch("/api/costs")
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        setCosts((await res.json()) as CostsSnapshot);
      })
      .catch(() => undefined);

    void fetch("/api/csv-history")
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { files?: unknown[] };
        if (!cancelled) setCsvCount(body.files?.length ?? 0);
      })
      .catch(() => undefined);

    void (async () => {
      setHealthLoading(true);
      try {
        const res = await fetch("/api/system/health");
        if (!res.ok || cancelled) return;
        setHealth((await res.json()) as HealthResponse);
      } catch {
        /* silent boot check */
      } finally {
        if (!cancelled) setHealthLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const serviceCards: ServiceCard[] = useMemo(() => {
    const byId = new Map(health?.checks.map((c) => [c.id, c]) ?? []);
    const mapStatus = (
      id: string,
      fallback: ServiceCard["status"],
    ): ServiceCard["status"] => {
      if (healthLoading && !health) return "checking";
      const check = byId.get(id);
      if (!check) return fallback;
      if (check.status === "ok") return id === "barcode" ? "ready" : "connected";
      if (check.status === "warn") return "ready";
      return "missing";
    };

    return [
      {
        id: "openai",
        title: "OpenAI",
        subtitle: "Understands products & writes listings",
        icon: Sparkles,
        status: mapStatus("openai", "connected"),
      },
      {
        id: "google_vision",
        title: "Text Recognition",
        subtitle: "Reads labels and packaging text",
        icon: Eye,
        status: mapStatus("google_vision", "connected"),
      },
      {
        id: "barcode",
        title: "Barcode Scanner",
        subtitle: "Reads UPC / EAN codes locally",
        icon: Barcode,
        status: mapStatus("barcode", "ready"),
      },
      {
        id: "template",
        title: "CSV Template",
        subtitle: "Official eBay draft format",
        icon: FileSpreadsheet,
        status: mapStatus("template", "ready"),
      },
      {
        id: "branding",
        title: "Store Branding",
        subtitle: "Higlou Store presentation",
        icon: Palette,
        status: mapStatus("branding", "ready"),
      },
    ];
  }, [health, healthLoading]);

  const overallReady = useMemo(() => {
    if (!health) return true;
    return health.checks
      .filter((c) => ["openai", "supabase", "template", "env"].includes(c.id))
      .every((c) => c.status === "ok");
  }, [health]);

  const save = (next?: AiProviderSettings) => {
    const value = next ?? settings;
    localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(value));
    setSettings(value);
    toast.success("AI preferences saved");
  };

  const setAutomatic = () => {
    const next: AiProviderSettings = {
      ...settings,
      analysisMode: "automatic",
      openaiEnabled: true,
      googleVisionEnabled: true,
      barcodeEnabled: true,
      googleVisionMode: "fallback",
      documentTextFallback: true,
      allowImproveOcr: true,
    };
    save(next);
  };

  const runHealthCheck = async () => {
    setHealthLoading(true);
    try {
      const res = await fetch("/api/system/health");
      const body = (await res.json()) as HealthResponse;
      if (!res.ok) {
        toast.error("System check failed to run");
        return;
      }
      setHealth(body);
      toast.success(body.summary);
    } catch {
      toast.error("System check failed to run");
    } finally {
      setHealthLoading(false);
    }
  };

  if (!hydrated) {
    return <p className="text-sm text-zinc-500">Loading AI analysis…</p>;
  }

  const products = costs?.snapshot?.productsProcessed ?? 0;
  const target = costs?.budget?.monthlyProductTarget ?? 500;
  const aiCost = costs?.projection?.estimatedAiCostToDate ?? 0;
  const ocrUnits = costs?.snapshot?.ocrUnits ?? 0;
  const timeSavedHours = Number((products * 0.25).toFixed(1));

  return (
    <div className="space-y-6">
      <ListingPipeline compact />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            <LiveDot tone={overallReady ? "success" : "brand"} />
            Engine
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">
            {overallReady ? "Ready to write listings" : "Something needs a look"}
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Photos in → draft → eBay. Automatic unless you open operators.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-full border border-border bg-surface p-0.5">
            <button
              type="button"
              onClick={setAutomatic}
              className={cn(
                "rounded-full px-3 py-1.5 text-[12px] font-semibold",
                settings.analysisMode === "automatic"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground",
              )}
            >
              Automatic
            </button>
            <button
              type="button"
              onClick={() => {
                save({ ...settings, analysisMode: "custom" });
                setAdvancedOpen(true);
              }}
              className={cn(
                "rounded-full px-3 py-1.5 text-[12px] font-semibold",
                settings.analysisMode === "custom"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground",
              )}
            >
              Custom
            </button>
          </div>
          <Button
            type="button"
            onClick={() => void runHealthCheck()}
            disabled={healthLoading}
            className="rounded-xl"
          >
            {healthLoading ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Checking
              </>
            ) : (
              "Run check"
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {serviceCards.map((card, i) => {
          const Icon = card.icon;
          const banner = i === 0;
          return (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className={cn(
                "relative overflow-hidden rounded-[24px] border border-border/70 bg-surface p-4 shadow-[0_16px_40px_-32px_rgba(20,16,8,0.45)]",
                banner && "col-span-2 min-h-[148px] bg-foreground text-background",
              )}
            >
              {healthLoading || banner ? (
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b to-transparent [animation:higlou-scan_2s_ease-in-out_infinite]",
                    banner ? "from-brand/40" : "from-brand/25",
                  )}
                />
              ) : null}
              <div className="flex items-start justify-between gap-2">
                <span
                  className={cn(
                    "grid size-10 place-items-center rounded-2xl",
                    banner
                      ? "bg-brand text-foreground"
                      : "bg-foreground text-brand",
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <StatusPill status={card.status} invert={banner} />
              </div>
              <p className="mt-4 text-[15px] font-semibold tracking-tight">
                {card.title}
              </p>
              <p
                className={cn(
                  "mt-1 text-[12.5px]",
                  banner ? "text-background/65" : "text-muted-foreground",
                )}
              >
                {card.subtitle}
              </p>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="col-span-2 overflow-hidden rounded-[24px] bg-foreground p-5 text-background">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-background/50 uppercase">
            This month
          </p>
          <p className="mt-2 font-display text-4xl tracking-tight">
            {products}
            <span className="text-lg text-background/45"> / {target}</span>
          </p>
          <p className="mt-1 text-[13px] text-background/60">Products analyzed</p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-background/15">
            <motion.div
              className="h-full bg-brand"
              initial={{ width: 0 }}
              animate={{
                width: `${Math.min(100, (products / Math.max(target, 1)) * 100)}%`,
              }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>
        <UsageTile label="AI cost" value={money(aiCost)} />
        <UsageTile label="Labels read" value={`${ocrUnits}`} />
        <UsageTile label="CSVs" value={String(csvCount)} />
        <UsageTile label="Hours saved" value={`${timeSavedHours}`} />
      </div>

      {healthLoading ? (
        <div className="rounded-[24px] border border-border/70 bg-surface px-5 py-4">
          <p className="inline-flex items-center gap-2 text-[13px] font-medium">
            <Loader2 className="size-4 animate-spin" />
            Checking photos → AI → eBay…
          </p>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full w-1/3 bg-brand-gradient"
              animate={{ x: ["-20%", "280%"] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
            />
          </div>
        </div>
      ) : health && !health.ok ? (
        <div className="rounded-[24px] border border-amber-200 bg-amber-50/70 p-4">
          <p className="text-[13px] font-semibold text-amber-900">
            {health.summary}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {health.checks.map((check) => (
              <div
                key={check.id}
                className="flex items-start gap-2 rounded-xl bg-white/70 px-3 py-2"
              >
                <span
                  className={cn(
                    "mt-1 size-2 shrink-0 rounded-full",
                    check.status === "ok"
                      ? "bg-success"
                      : check.status === "warn"
                        ? "bg-amber-400"
                        : "bg-destructive",
                  )}
                />
                <div className="min-w-0">
                  <p className="text-[12.5px] font-medium">{check.label}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {check.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : health?.ok ? (
        <p className="inline-flex items-center gap-2 px-1 text-[13px] text-muted-foreground">
          <LiveDot tone="success" />
          {health.summary}
        </p>
      ) : null}

      <div className="rounded-[24px] border border-border/80 bg-surface">
        <button
          type="button"
          className="flex w-full items-center justify-between px-5 py-4 text-left"
          onClick={() => setAdvancedOpen((o) => !o)}
        >
          <div>
            <p className="text-sm font-semibold">Operators</p>
            <p className="text-[12px] text-muted-foreground">
              Advanced AI, CSV template, budget — most sellers skip this.
            </p>
          </div>
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition",
              advancedOpen && "rotate-180",
            )}
          />
        </button>
        {advancedOpen ? (
          <div className="space-y-5 border-t border-border/60 px-5 py-5">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Providers
              </p>
              <ToggleRow
                label="OpenAI"
                checked={settings.openaiEnabled}
                onChange={(checked) =>
                  setSettings((s) => ({
                    ...s,
                    analysisMode: "custom",
                    openaiEnabled: checked,
                  }))
                }
              />
              <ToggleRow
                label="Text Recognition"
                checked={settings.googleVisionEnabled}
                onChange={(checked) =>
                  setSettings((s) => ({
                    ...s,
                    analysisMode: "custom",
                    googleVisionEnabled: checked,
                  }))
                }
              />
              <ToggleRow
                label="Barcode Scanner"
                checked={settings.barcodeEnabled}
                onChange={(checked) =>
                  setSettings((s) => ({
                    ...s,
                    analysisMode: "custom",
                    barcodeEnabled: checked,
                  }))
                }
              />
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Text Recognition Mode
              </p>
              {(
                [
                  {
                    value: "off" as const,
                    label: "Off",
                    hint: "Skip text recognition unless explicitly requested",
                  },
                  {
                    value: "fallback" as const,
                    label: "Smart (recommended)",
                    hint: "Used when labels or missing fields need help",
                  },
                  {
                    value: "always" as const,
                    label: "Always",
                    hint: "Run on selected images every time",
                  },
                ] as const
              ).map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-start gap-3 rounded-2xl border border-zinc-200 p-3 text-sm"
                >
                  <input
                    type="radio"
                    className="mt-1"
                    name="text-recognition-mode"
                    checked={settings.googleVisionMode === option.value}
                    onChange={() =>
                      setSettings((s) => ({
                        ...s,
                        analysisMode: "custom",
                        googleVisionMode: option.value,
                      }))
                    }
                  />
                  <span>
                    <span className="font-medium text-zinc-900">
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-zinc-500">
                      {option.hint}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Max text-recognition images</Label>
                <Input
                  type="number"
                  min={1}
                  max={8}
                  value={settings.googleVisionMaxImages}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      analysisMode: "custom",
                      googleVisionMaxImages: Number(e.target.value || 4),
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Max photos sent to AI</Label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={settings.maxAnalysisImages}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      analysisMode: "custom",
                      maxAnalysisImages: Number(e.target.value || 12),
                    }))
                  }
                />
              </div>
            </div>

            <ToggleRow
              label="Extra text-recognition fallback"
              checked={settings.documentTextFallback}
              onChange={(checked) =>
                setSettings((s) => ({
                  ...s,
                  analysisMode: "custom",
                  documentTextFallback: Boolean(checked),
                }))
              }
            />
            <ToggleRow
              label="Allow Improve Text button"
              checked={settings.allowImproveOcr}
              onChange={(checked) =>
                setSettings((s) => ({
                  ...s,
                  allowImproveOcr: Boolean(checked),
                }))
              }
            />
            <ToggleRow
              label="Prefer barcode when both match"
              checked={settings.preferBarcodeOverOcr}
              onChange={(checked) =>
                setSettings((s) => ({
                  ...s,
                  preferBarcodeOverOcr: Boolean(checked),
                }))
              }
            />
            <ToggleRow
              label="Validate barcode check digits"
              checked={settings.validateUpcEanChecksum}
              onChange={(checked) =>
                setSettings((s) => ({
                  ...s,
                  validateUpcEanChecksum: Boolean(checked),
                }))
              }
            />

            <Button type="button" onClick={() => save()} className="rounded-full">
              Save advanced settings
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatusPill({
  status,
  invert = false,
}: {
  status: "connected" | "ready" | "missing" | "checking";
  invert?: boolean;
}) {
  const label =
    status === "connected"
      ? "Connected"
      : status === "ready"
        ? "Ready"
        : status === "checking"
          ? "Checking"
          : "Setup needed";
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-medium",
        invert && status !== "missing"
          ? "bg-background/15 text-background"
          : status === "missing"
            ? "bg-rose-50 text-rose-700"
            : status === "checking"
              ? "bg-zinc-100 text-zinc-600"
              : "bg-emerald-50 text-emerald-700",
      )}
    >
      {label}
    </span>
  );
}

function UsageTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-border/70 bg-surface p-4 shadow-[0_16px_40px_-32px_rgba(20,16,8,0.45)]">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-100 px-3 py-2.5">
      <Label className="text-sm text-zinc-800">{label}</Label>
      <Switch checked={checked} onCheckedChange={(v) => onChange(Boolean(v))} />
    </div>
  );
}
