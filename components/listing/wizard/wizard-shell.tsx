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
    <div className="relative flex min-h-dvh flex-col bg-white text-foreground">
      <header className="sticky top-0 z-40 border-b border-[#e5e5e5] bg-white">
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

          <div className="flex items-end justify-between gap-3 border-t border-[#eee] pt-3 md:hidden">
            <div className="min-w-0">
              <p className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
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

      <main
        className={cn(
          "relative flex min-h-0 flex-1 flex-col",
          flush && step === "photos"
            ? "w-full overflow-hidden"
            : flush
              ? "w-full"
              : "mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6",
          className,
        )}
      >
        {children}
      </main>
    </div>
  );
}
