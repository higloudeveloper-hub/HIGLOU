"use client";

import { HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { HiglouMark } from "@/components/listing/wizard/higlou-mark";
import { WizardProgress } from "@/components/listing/wizard/wizard-progress";
import {
  wizardProgressMeta,
  type WizardStep,
} from "@/components/listing/wizard/types";
import { cn } from "@/lib/utils";

export function WizardShell({
  step,
  exported = false,
  children,
  headerActions,
  className,
  flush = false,
}: {
  step: WizardStep;
  exported?: boolean;
  children: React.ReactNode;
  /** Optional actions (e.g. Save Draft) shown near help on later steps */
  headerActions?: React.ReactNode;
  className?: string;
  /** When true, main has no max-width padding (screens that manage their own layout). */
  flush?: boolean;
}) {
  const meta = wizardProgressMeta(step, exported);

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur-lg">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-3 sm:px-6 sm:py-0">
          <div className="flex h-12 items-center gap-3 sm:h-[72px] sm:gap-6">
            <HiglouMark className="shrink-0" />
            <div className="hidden min-w-0 flex-1 md:block">
              <WizardProgress step={step} exported={exported} />
            </div>
            <div className="ml-auto flex items-center gap-2">
              {headerActions}
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-muted sm:px-4"
                onClick={() =>
                  toast.message("Need help?", {
                    description:
                      "Questions while listing? Open Home from the Higlou logo anytime.",
                  })
                }
              >
                <HelpCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Need help?</span>
              </button>
            </div>
          </div>
          <div className="flex items-end justify-between gap-3 border-t border-border/60 pb-1 pt-2 md:hidden">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Step {meta.stepOf}
              </p>
              <p className="truncate text-[14px] font-semibold">{meta.title}</p>
            </div>
            <WizardProgress step={step} exported={exported} />
          </div>
        </div>
      </header>

      <main
        className={cn(
          "flex-1",
          flush
            ? "w-full"
            : "mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8",
          className,
        )}
      >
        {children}
      </main>
    </div>
  );
}
