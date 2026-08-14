"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Store } from "lucide-react";
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
  const templateMeta =
    DESCRIPTION_TEMPLATES.find((t) => t.id === templateId) ||
    DESCRIPTION_TEMPLATES[0];
  const [open, setOpen] = useState(!compact);

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

  if (compact && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2.5 rounded-xl border border-border/70 bg-background px-3 py-2 text-left transition hover:bg-muted/40"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
          <Store className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px]">
          <span className="font-semibold">
            {storeName.trim() || "Your store"}
          </span>
          <span className="text-muted-foreground">
            {" "}
            · {templateMeta.name}
          </span>
        </span>
        <span className="hidden gap-1 sm:flex">
          {[
            templateMeta.suggestedColors.headerBackground,
            templateMeta.suggestedColors.accent,
            templateMeta.suggestedColors.panelBackground,
          ].map((color) => (
            <span
              key={color}
              className="size-2.5 rounded-full border border-black/10"
              style={{ background: color }}
            />
          ))}
        </span>
        <span className="inline-flex shrink-0 items-center gap-0.5 text-[12px] font-medium text-muted-foreground">
          Change
          <ChevronDown className="size-3.5" />
        </span>
      </button>
    );
  }

  return (
    <section
      className={cn(
        "rounded-2xl border border-border/70 bg-background",
        compact ? "p-3" : "p-5",
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Store className="size-4" />
            Store look
          </div>
          {!compact ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Name and HTML template go into the eBay draft description.
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/settings#branding"
            className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            More options
          </Link>
          {compact ? (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs font-semibold text-foreground"
            >
              Done
            </button>
          ) : null}
        </div>
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
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-muted/40 text-foreground hover:border-foreground/40",
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Store name</Label>
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
            placeholder="e.g. Higlou Store"
            autoComplete="organization"
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Header name</Label>
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
            className="h-9"
          />
        </div>
      </div>

      <div className={cn("space-y-2", compact ? "mt-3" : "mt-4")}>
        <Label className="text-xs">HTML template</Label>
        <div
          className={cn(
            "grid gap-2",
            compact ? "grid-cols-2 sm:grid-cols-5" : "sm:grid-cols-2 lg:grid-cols-3",
          )}
        >
          {DESCRIPTION_TEMPLATES.map((template) => {
            const active = templateId === template.id;
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => selectTemplate(template.id)}
                className={cn(
                  "rounded-xl border text-left transition",
                  compact ? "p-2" : "p-3",
                  active
                    ? "border-foreground bg-foreground text-background shadow-sm"
                    : "border-border bg-muted/30 hover:border-foreground/40",
                )}
              >
                <div className={cn("font-semibold", compact ? "text-[12px]" : "text-sm")}>
                  {template.name}
                </div>
                {!compact ? (
                  <div
                    className={cn(
                      "mt-1 text-[11px] leading-snug",
                      active ? "text-background/70" : "text-muted-foreground",
                    )}
                  >
                    {template.tagline}
                  </div>
                ) : null}
                <div className="mt-1.5 flex gap-1">
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
