"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  STORE_BRANDING_DEFAULTS,
  cloneStoreBranding,
  type StoreBranding,
} from "@/config/store-branding";
import {
  DESCRIPTION_TEMPLATES,
  STORE_PRESETS,
  type DescriptionTemplateId,
} from "@/config/description-templates";
import { buildHiglouDescriptionHtml } from "@/lib/ebay/description-html";
import { sanitizeEbayHtml } from "@/lib/ebay/sanitize-html";
import { displayNameFromEbayUsername } from "@/lib/ebay/store-display-name";
import { LookLiveDemo } from "@/components/settings/look-live-demo";
import { cn } from "@/lib/utils";

const PREVIEW_CONTENT = {
  productTitle: "Milwaukee M18 FUEL 1/2 in. Hammer Drill",
  productIntroduction:
    "Brushless hammer drill. Label, box, and tool match the photos — this is how your store branding lands on eBay.",
  features: [
    "M18 FUEL brushless motor",
    "1/2 in. chuck · hammer drill",
    "New in box with original label",
  ],
  itemCondition: "New — unused, in original packaging",
  packageContents: ["Hammer drill", "Original box"],
  specs: [
    { label: "Brand", value: "Milwaukee" },
    { label: "MPN", value: "2804-20" },
    { label: "Voltage", value: "18 V" },
  ],
};

type Room = "look" | "voice";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function StoreBrandingForm() {
  const [branding, setBranding] = useState<StoreBranding>(
    cloneStoreBranding(STORE_BRANDING_DEFAULTS),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [room, setRoom] = useState<Room>("look");
  const [ebayStoreName, setEbayStoreName] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/settings/branding");
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error || "Failed to load branding");
        }
        const data = (await res.json()) as { branding: StoreBranding };
        setBranding(cloneStoreBranding(data.branding));
      } catch (error) {
        toast.message("Using default store branding", {
          description:
            error instanceof Error ? error.message : "Could not load branding",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/ebay/store-name");
        if (!res.ok) return;
        const body = (await res.json()) as {
          storeName?: string | null;
          username?: string | null;
        };
        const name =
          body.storeName?.trim() ||
          (body.username ? displayNameFromEbayUsername(body.username) : "");
        if (name) setEbayStoreName(name);
      } catch {
        /* optional */
      }
    })();
  }, []);

  const previewHtml = useMemo(
    () =>
      sanitizeEbayHtml(buildHiglouDescriptionHtml(PREVIEW_CONTENT, branding)),
    [branding],
  );

  const applyPreset = (presetId: string) => {
    const preset = STORE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setBranding((prev) =>
      cloneStoreBranding({
        ...prev,
        templateId: preset.branding.templateId,
        colors: { ...preset.branding.colors },
        slogan: preset.branding.slogan,
        thankYouMessage: preset.branding.thankYouMessage.replace(
          preset.branding.storeName,
          prev.storeName.trim() || preset.branding.storeName,
        ),
        thankYouSubtext: preset.branding.thankYouSubtext,
        shippingInformation: preset.branding.shippingInformation,
        footerText: preset.branding.footerText.replace(
          preset.branding.storeName,
          prev.storeName.trim() || preset.branding.storeName,
        ),
        returnPolicyText: prev.returnPolicyText,
        warrantyInformation: prev.warrantyInformation,
        logoUrl: prev.logoUrl,
        includeReturnsSection: false,
      }),
    );
  };

  const selectTemplate = (templateId: DescriptionTemplateId) => {
    const meta = DESCRIPTION_TEMPLATES.find((t) => t.id === templateId);
    setBranding((prev) => ({
      ...prev,
      templateId,
      colors: meta ? { ...meta.suggestedColors } : prev.colors,
    }));
  };

  const useEbayName = () => {
    if (!ebayStoreName) return;
    setBranding((prev) => ({
      ...prev,
      storeName: ebayStoreName,
      storeNameDisplay: ebayStoreName.toUpperCase(),
      thankYouMessage: `Thank You for Shopping With ${ebayStoreName}`,
      footerText: `Shop with confidence at ${ebayStoreName}.`,
    }));
    toast.success(`Using ${ebayStoreName} from eBay`);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(branding),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || "Save failed");
      }
      const data = (await res.json()) as { branding: StoreBranding };
      setBranding(cloneStoreBranding(data.branding));
      try {
        localStorage.setItem(
          "higlou-active-branding",
          JSON.stringify(data.branding),
        );
      } catch {
        /* ignore */
      }
      toast.success("Look saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading look…
      </div>
    );
  }

  const fromEbay = Boolean(
    ebayStoreName &&
      branding.storeName.trim().toLowerCase() ===
        ebayStoreName.trim().toLowerCase(),
  );

  return (
    <div className="space-y-6">
      <LookLiveDemo
        storeName={branding.storeNameDisplay || branding.storeName}
        slogan={branding.slogan}
        headerBg={branding.colors.headerBackground}
        headerText={branding.colors.headerText}
        accent={branding.colors.accent}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Adjust the look
            </h2>
            <p className="text-[13px] text-muted-foreground">
              Colors and template paint the eBay listing on the right.
            </p>
          </div>
          <Button
            onClick={() => void save()}
            disabled={saving}
            className="rounded-xl"
          >
            {saving ? "Saving…" : "Save look"}
          </Button>
        </div>

        <div className="rounded-[24px] border border-border/80 bg-surface p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Store name
              </p>
              <p className="mt-0.5 truncate text-[18px] font-semibold tracking-tight">
                {branding.storeName.trim() || "Your store"}
              </p>
              {fromEbay ? (
                <p className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-muted-foreground">
                  <Store className="size-3" /> From connected eBay
                </p>
              ) : null}
            </div>
            {ebayStoreName && !fromEbay ? (
              <button
                type="button"
                onClick={useEbayName}
                className="shrink-0 rounded-full border border-border px-3 py-1.5 text-[12px] font-medium hover:bg-muted"
              >
                Use {ebayStoreName}
              </button>
            ) : null}
          </div>
          <div className="mt-4">
            <Field label="Name buyers see">
              <Input
                value={branding.storeName}
                onChange={(e) =>
                  setBranding((prev) => ({
                    ...prev,
                    storeName: e.target.value,
                    storeNameDisplay: e.target.value.toUpperCase(),
                  }))
                }
                className="h-10 rounded-xl"
              />
            </Field>
          </div>
        </div>

        <div
          role="tablist"
          className="grid grid-cols-2 rounded-2xl border border-border bg-surface p-1"
        >
          {(
            [
              ["look", "Template & colors"],
              ["voice", "Words buyers see"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={room === id}
              onClick={() => setRoom(id)}
              className={cn(
                "rounded-xl py-2 text-[13px] font-semibold transition",
                room === id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {room === "look" ? (
          <div className="space-y-4 rounded-[24px] border border-border/80 bg-surface p-4 sm:p-5">
            <Field label="Style">
              <div className="flex flex-wrap gap-1.5">
                {STORE_PRESETS.map((preset) => {
                  const active = branding.templateId === preset.branding.templateId;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset.id)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                        active
                          ? "border-foreground bg-foreground text-background"
                          : "border-border hover:border-foreground/40",
                      )}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="HTML template">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {DESCRIPTION_TEMPLATES.map((template) => {
                  const active = branding.templateId === template.id;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => selectTemplate(template.id)}
                      className={cn(
                        "overflow-hidden rounded-2xl border text-left transition",
                        active
                          ? "border-foreground ring-2 ring-foreground/15"
                          : "border-border hover:border-foreground/40",
                      )}
                    >
                      <span
                        className="block px-3 py-4 text-center font-display text-[15px] tracking-tight"
                        style={{
                          background: template.suggestedColors.headerBackground,
                          color: template.suggestedColors.headerText,
                        }}
                      >
                        {branding.storeNameDisplay || "YOUR STORE"}
                      </span>
                      <span className="flex items-center justify-between px-3 py-2">
                        <span className="text-[12px] font-semibold">
                          {template.name.replace(" Commerce", "")}
                        </span>
                        {active ? (
                          <Check className="size-3.5" strokeWidth={3} />
                        ) : (
                          <span className="flex gap-1">
                            {[
                              template.suggestedColors.accent,
                              template.suggestedColors.headerBackground,
                            ].map((color) => (
                              <span
                                key={`${template.id}-${color}`}
                                className="size-2.5 rounded-full border border-black/10"
                                style={{ background: color }}
                              />
                            ))}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Colors">
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["accent", "Accent"],
                    ["headerBackground", "Header"],
                    ["headerText", "Text"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 rounded-xl border border-border px-2 py-2"
                  >
                    <input
                      type="color"
                      className="size-8 cursor-pointer rounded-md border-0 bg-transparent p-0"
                      value={branding.colors[key]}
                      onChange={(e) =>
                        setBranding((prev) => ({
                          ...prev,
                          colors: { ...prev.colors, [key]: e.target.value },
                        }))
                      }
                    />
                    <span className="text-[11px] font-medium">{label}</span>
                  </label>
                ))}
              </div>
            </Field>
          </div>
        ) : (
          <div className="space-y-3 rounded-[24px] border border-border/80 bg-surface p-4 sm:p-5">
            <Field label="Slogan">
              <Input
                value={branding.slogan}
                onChange={(e) =>
                  setBranding((prev) => ({ ...prev, slogan: e.target.value }))
                }
                className="h-10 rounded-xl"
              />
            </Field>
            <Field label="Thank you">
              <Input
                value={branding.thankYouMessage}
                onChange={(e) =>
                  setBranding((prev) => ({
                    ...prev,
                    thankYouMessage: e.target.value,
                  }))
                }
                className="h-10 rounded-xl"
              />
            </Field>
            <Field label="Thank you subtext">
              <Input
                value={branding.thankYouSubtext}
                onChange={(e) =>
                  setBranding((prev) => ({
                    ...prev,
                    thankYouSubtext: e.target.value,
                  }))
                }
                className="h-10 rounded-xl"
              />
            </Field>
            <Field label="Shipping note">
              <Textarea
                value={branding.shippingInformation}
                onChange={(e) =>
                  setBranding((prev) => ({
                    ...prev,
                    shippingInformation: e.target.value,
                  }))
                }
                className="min-h-[72px] rounded-xl"
              />
            </Field>
            <Field label="Footer">
              <Input
                value={branding.footerText}
                onChange={(e) =>
                  setBranding((prev) => ({ ...prev, footerText: e.target.value }))
                }
                className="h-10 rounded-xl"
              />
            </Field>
          </div>
        )}
      </div>

      <aside className="lg:sticky lg:top-20">
        <div className="overflow-hidden rounded-[24px] border border-border/80 bg-muted/40 shadow-[0_20px_50px_-40px_rgba(20,16,8,0.5)]">
          <div className="flex items-center justify-between border-b border-border/60 bg-surface px-4 py-3">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                Description HTML
              </p>
              <p className="text-[13px] font-medium">
                {branding.storeNameDisplay || branding.storeName || "Your store"}
              </p>
            </div>
            <span
              className="size-3 rounded-full"
              style={{ background: branding.colors.accent }}
            />
          </div>
          <div
            className="max-h-[min(58vh,520px)] overflow-auto bg-white p-3"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      </aside>
      </div>
    </div>
  );
}
