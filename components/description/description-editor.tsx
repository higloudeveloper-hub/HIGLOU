"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { sanitizeEbayHtml } from "@/lib/ebay/sanitize-html";
import { STORE_BRANDING_DEFAULTS } from "@/config/store-branding";
import { cn } from "@/lib/utils";

interface DescriptionEditorProps {
  html: string;
  onChange: (html: string) => void;
  onRegenerate: () => void;
  title?: string;
  storeName?: string;
  /** Tighter preview for the draft review workspace. */
  compact?: boolean;
  /** Optional controls rendered above the preview (store / template). */
  brandingControls?: React.ReactNode;
}

export function DescriptionEditor({
  html,
  onChange,
  onRegenerate,
  title,
  storeName,
  compact = false,
  brandingControls,
}: DescriptionEditorProps) {
  const sanitized = useMemo(() => sanitizeEbayHtml(html), [html]);
  const previewMin = compact ? "min-h-[280px]" : "min-h-[560px]";
  const displayStore = storeName || STORE_BRANDING_DEFAULTS.storeName;

  return (
    <div className="space-y-4">
      {brandingControls}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">
          Exactly how shoppers will see your {displayStore} description.
        </p>
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={onRegenerate}
        >
          Rewrite description
        </Button>
      </div>
      <Tabs defaultValue="preview">
        <TabsList className="rounded-full bg-muted p-1">
          <TabsTrigger value="preview" className="rounded-full">
            Preview
          </TabsTrigger>
          <TabsTrigger value="code" className="rounded-full">
            HTML
          </TabsTrigger>
        </TabsList>
        <TabsContent value="preview" className="mt-4">
          <div className="overflow-hidden rounded-[24px] border border-border/70 bg-muted/40 shadow-sm">
            <div className="flex items-center justify-between border-b border-border/60 bg-surface px-4 py-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground">
                  EBAY LISTING PREVIEW
                </p>
                <p className="mt-1 truncate text-[14px] font-medium">
                  {title || "Your product title"}
                </p>
              </div>
              <div className="hidden shrink-0 rounded-full bg-brand px-3 py-1 text-[11px] font-semibold text-brand-foreground sm:block">
                {displayStore}
              </div>
            </div>
            <div className="bg-[oklch(0.97_0.01_90)] p-3 sm:p-4">
              <div className="overflow-hidden rounded-2xl border border-border/60 bg-white shadow-sm">
                <iframe
                  title="Description preview"
                  sandbox=""
                  srcDoc={sanitized}
                  className={cn("w-full bg-white", previewMin)}
                />
              </div>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="code" className="mt-4">
          <Textarea
            value={html}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => onChange(sanitizeEbayHtml(html))}
            className={cn(
              "rounded-3xl font-mono text-xs",
              compact ? "min-h-[360px]" : "min-h-[560px]",
            )}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
