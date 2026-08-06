"use client";

import Link from "next/link";
import { Store } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DESCRIPTION_TEMPLATES,
  STORE_PRESETS,
  type DescriptionTemplateId,
} from "@/config/description-templates";
import type { StoreBranding } from "@/config/store-branding";
import { cn } from "@/lib/utils";

function withSafeColors(branding: StoreBranding): StoreBranding["colors"] {
  return {
    headerBackground: branding.colors?.headerBackground || "#111111",
    headerText: branding.colors?.headerText || "#ffffff",
    bodyText: branding.colors?.bodyText || "#1d1d1f",
    accent: branding.colors?.accent || "#f4c928",
    panelBackground: branding.colors?.panelBackground || "#f7f7f7",
    border: branding.colors?.border || "#e5e5e5",
  };
}

export function StoreTemplatePicker({
  branding,
  onChange,
  compact = false,
}: {
  branding: StoreBranding;
  onChange: (next: StoreBranding) => void;
  compact?: boolean;
}) {
  // Keep empty strings editable — never coerce to "My Store" in the input value
  // (that made typed text collide with the fallback, e.g. "HMy Store").
  const storeName = branding.storeName ?? "";
  const storeNameDisplay = branding.storeNameDisplay ?? "";
  const templateId = branding.templateId || "classic";
  const colors = withSafeColors(branding);

  const baseForUpdate = (): StoreBranding => ({
    ...branding,
    storeName,
    storeNameDisplay,
    templateId,
    colors,
  });

  const selectTemplate = (nextTemplateId: DescriptionTemplateId) => {
    const meta = DESCRIPTION_TEMPLATES.find((t) => t.id === nextTemplateId);
    onChange({
      ...baseForUpdate(),
      templateId: nextTemplateId,
      colors: meta ? { ...meta.suggestedColors } : { ...colors },
    });
  };

  const applyPreset = (presetId: string) => {
    const preset = STORE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    onChange({
      ...baseForUpdate(),
      ...preset.branding,
      colors: { ...preset.branding.colors },
      returnPolicyText: branding.returnPolicyText,
      warrantyInformation: branding.warrantyInformation,
      logoUrl: branding.logoUrl,
      includeReturnsSection: false,
    });
  };

  return (
    <section
      className={cn(
        "rounded-2xl border border-zinc-200 bg-white",
        compact ? "p-4" : "p-5",
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
            <Store className="size-4" />
            Tienda y plantilla HTML
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            El nombre y el diseño van en la descripción del draft de eBay.
          </p>
        </div>
        <Link
          href="/settings#branding"
          className="shrink-0 text-xs font-medium text-zinc-600 underline-offset-2 hover:text-zinc-950 hover:underline"
        >
          Más opciones
        </Link>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {STORE_PRESETS.map((preset) => {
          const active = storeName === preset.branding.storeName;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset.id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                active
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-400",
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Nombre de la tienda</Label>
          <Input
            value={storeName}
            onChange={(e) => {
              const nextName = e.target.value;
              const displaySynced =
                !storeNameDisplay.trim() ||
                storeNameDisplay === storeName.toUpperCase();
              onChange({
                ...baseForUpdate(),
                storeName: nextName,
                storeNameDisplay: displaySynced
                  ? nextName.toUpperCase()
                  : storeNameDisplay,
                thankYouMessage: `Thank You for Shopping With ${nextName.trim() || "Our Store"}`,
                footerText: `Shop with confidence at ${nextName.trim() || "Our Store"}.`,
              });
            }}
            placeholder="Ej. Higlou Store"
            autoComplete="organization"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Nombre en el header</Label>
          <Input
            value={storeNameDisplay}
            onChange={(e) =>
              onChange({
                ...baseForUpdate(),
                storeNameDisplay: e.target.value,
              })
            }
            placeholder="HIGLOU STORE"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <Label className="text-xs">Plantilla HTML</Label>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {DESCRIPTION_TEMPLATES.map((template) => {
            const active = templateId === template.id;
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => selectTemplate(template.id)}
                className={cn(
                  "rounded-xl border p-3 text-left transition",
                  active
                    ? "border-zinc-900 bg-zinc-900 text-white shadow-sm"
                    : "border-zinc-200 bg-zinc-50 hover:border-zinc-400",
                )}
              >
                <div className="text-sm font-semibold">{template.name}</div>
                <div
                  className={cn(
                    "mt-1 text-[11px] leading-snug",
                    active ? "text-zinc-300" : "text-zinc-500",
                  )}
                >
                  {template.tagline}
                </div>
                <div className="mt-2 flex gap-1">
                  {[
                    template.suggestedColors.headerBackground,
                    template.suggestedColors.accent,
                    template.suggestedColors.panelBackground,
                  ].map((color) => (
                    <span
                      key={`${template.id}-${color}`}
                      className="h-2.5 w-2.5 rounded-full border border-black/10"
                      style={{ background: color }}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
