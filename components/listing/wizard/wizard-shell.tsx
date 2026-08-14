"use client";

import Link from "next/link";
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
  onSelectStep,
}: {
  step: WizardStep;
  exported?: boolean;
  children: React.ReactNode;
  headerActions?: React.ReactNode;
  className?: string;
  flush?: boolean;
  onSelectStep?: (index: number) => void;
}) {
  const meta = wizardProgressMeta(step, exported);

  return (
    <div className="relative flex min-h-dvh flex-col bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(900px_280px_at_50%_-40px,rgba(255,199,44,0.16),transparent_70%)]"
      />

      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4">
            <HiglouMark className="shrink-0" />
            <div className="hidden min-w-0 flex-1 md:block">
              <WizardProgress
                step={step}
                exported={exported}
                onSelect={onSelectStep}
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              {headerActions}
              <Link
                href="/home"
                className="hidden text-sm font-medium text-muted-foreground transition hover:text-foreground sm:inline"
              >
                Exit
              </Link>
            </div>
          </div>

          <div className="flex items-end justify-between gap-3 border-t border-border/50 pt-3 md:hidden">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                Step {meta.stepOf}
              </p>
              <p className="truncate text-[15px] font-semibold">{meta.title}</p>
            </div>
            <WizardProgress
              step={step}
              exported={exported}
              onSelect={onSelectStep}
              className="max-w-[180px]"
            />
          </div>
        </div>
      </header>

      {step === "photos" ? (
        <div className="relative mx-auto w-full max-w-[1100px] px-4 pt-6 sm:px-6 sm:pt-8">
          <div className="hidden animate-in fade-in slide-in-from-bottom-1 duration-500 md:block">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
              Step {meta.stepOf}
            </p>
            <h1 className="mt-1.5 font-display text-3xl tracking-tight text-foreground sm:text-4xl">
              {meta.title}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-[15px]">
              {meta.subtitle}
            </p>
          </div>
        </div>
      ) : null}

      <main
        className={cn(
          "relative flex flex-1 flex-col",
          flush ? "w-full" : "mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6",
          className,
        )}
      >
        {children}
      </main>
    </div>
  );
}
