"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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

const PREVIEW_CONTENT = {
  productTitle: "Sample Product Title — Queen Comforter Set",
  productIntroduction:
    "A clean sample description so you can preview how your store branding and HTML template will look on eBay.",
  features: [
    "Professional store-branded layout",
    "Inline styles safe for Seller Hub",
    "Highlights your shop name automatically",
  ],
  itemCondition: "New — unused, in original packaging",
  packageContents: ["Main item", "Accessories as shown"],
  specs: [
    { label: "Brand", value: "Sample Brand" },
    { label: "Size", value: "Queen" },
    { label: "Color", value: "Yellow" },
  ],
};

export function StoreBrandingForm() {
  const [branding, setBranding] = useState<StoreBranding>(
    cloneStoreBranding(STORE_BRANDING_DEFAULTS),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

  const previewHtml = useMemo(
    () =>
      sanitizeEbayHtml(
        buildHiglouDescriptionHtml(PREVIEW_CONTENT, branding),
      ),
    [branding],
  );

  const applyPreset = (presetId: string) => {
    const preset = STORE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setBranding((prev) =>
      cloneStoreBranding({
        ...prev,
        ...preset.branding,
        colors: { ...preset.branding.colors },
        returnPolicyText: prev.returnPolicyText,
        warrantyInformation: prev.warrantyInformation,
        logoUrl: prev.logoUrl,
        includeReturnsSection: false,
      }),
    );
    toast.success(`Applied ${preset.label} preset`);
  };

  const selectTemplate = (templateId: DescriptionTemplateId) => {
    const meta = DESCRIPTION_TEMPLATES.find((t) => t.id === templateId);
    setBranding((prev) => ({
      ...prev,
      templateId,
      colors: meta ? { ...meta.suggestedColors } : prev.colors,
    }));
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
      toast.success("Store branding saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading branding…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Quick store presets</Label>
        <p className="text-sm text-muted-foreground">
          One click fills store name, colors, and a matching HTML template.
          Edit anything after.
        </p>
        <div className="flex flex-wrap gap-2">
          {STORE_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyPreset(preset.id)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>HTML description template</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {DESCRIPTION_TEMPLATES.map((template) => {
            const active = branding.templateId === template.id;
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => selectTemplate(template.id)}
                className={`rounded-lg border p-3 text-left transition ${
                  active
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white hover:border-zinc-400"
                }`}
              >
                <div className="text-sm font-semibold">{template.name}</div>
                <div
                  className={`mt-1 text-xs ${active ? "text-zinc-300" : "text-zinc-500"}`}
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
                      key={color}
                      className="h-3 w-3 rounded-full border border-black/10"
                      style={{ background: color }}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Store name</Label>
          <Input
            value={branding.storeName}
            onChange={(e) =>
              setBranding((prev) => ({ ...prev, storeName: e.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Display name (header)</Label>
          <Input
            value={branding.storeNameDisplay}
            onChange={(e) =>
              setBranding((prev) => ({
                ...prev,
                storeNameDisplay: e.target.value,
              }))
            }
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Slogan</Label>
        <Input
          value={branding.slogan}
          onChange={(e) =>
            setBranding((prev) => ({ ...prev, slogan: e.target.value }))
          }
        />
      </div>
      <div className="space-y-2">
        <Label>Thank you message</Label>
        <Input
          value={branding.thankYouMessage}
          onChange={(e) =>
            setBranding((prev) => ({
              ...prev,
              thankYouMessage: e.target.value,
            }))
          }
        />
      </div>
      <div className="space-y-2">
        <Label>Thank you subtext</Label>
        <Input
          value={branding.thankYouSubtext}
          onChange={(e) =>
            setBranding((prev) => ({
              ...prev,
              thankYouSubtext: e.target.value,
            }))
          }
        />
      </div>
      <div className="space-y-2">
        <Label>Shipping information</Label>
        <Textarea
          value={branding.shippingInformation}
          onChange={(e) =>
            setBranding((prev) => ({
              ...prev,
              shippingInformation: e.target.value,
            }))
          }
        />
      </div>
      <div className="space-y-2">
        <Label>Footer text</Label>
        <Input
          value={branding.footerText}
          onChange={(e) =>
            setBranding((prev) => ({ ...prev, footerText: e.target.value }))
          }
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ["accent", "Accent"],
            ["headerBackground", "Header"],
            ["headerText", "Header text"],
            ["bodyText", "Body text"],
            ["panelBackground", "Panel"],
            ["border", "Border"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="space-y-2">
            <Label>{label}</Label>
            <div className="flex gap-2">
              <Input
                type="color"
                className="h-10 w-12 p-1"
                value={branding.colors[key]}
                onChange={(e) =>
                  setBranding((prev) => ({
                    ...prev,
                    colors: { ...prev.colors, [key]: e.target.value },
                  }))
                }
              />
              <Input
                value={branding.colors[key]}
                onChange={(e) =>
                  setBranding((prev) => ({
                    ...prev,
                    colors: { ...prev.colors, [key]: e.target.value },
                  }))
                }
              />
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Label>Live preview</Label>
        <div
          className="max-h-[420px] overflow-auto rounded-lg border bg-white p-3"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      </div>

      <Button
        onClick={save}
        disabled={saving}
        title={saving ? "Saving branding…" : "Save store branding"}
      >
        {saving ? "Saving…" : "Save branding"}
      </Button>
    </div>
  );
}
