"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  WIZARD_PROGRESS_STEPS,
  wizardStepToProgressIndex,
  type WizardStep,
} from "@/components/listing/wizard/types";

export function WizardProgress({
  step,
  exported = false,
  className,
}: {
  step: WizardStep;
  exported?: boolean;
  className?: string;
}) {
  const lastIndex = WIZARD_PROGRESS_STEPS.length - 1;
  const active = exported ? lastIndex : wizardStepToProgressIndex(step);
  const pct = Math.round(((active + (exported ? 1 : 0.35)) / WIZARD_PROGRESS_STEPS.length) * 100);

  return (
    <div className={cn("w-full min-w-0", className)}>
      <nav
        aria-label="Listing progress"
        className="mx-auto flex items-center justify-center gap-1 sm:gap-1.5"
      >
        {WIZARD_PROGRESS_STEPS.map((item, i) => {
          const resolved: "done" | "active" | "todo" = exported
            ? i < lastIndex
              ? "done"
              : "active"
            : i < active
              ? "done"
              : i === active
                ? "active"
                : "todo";

          return (
            <div key={item.id} className="flex items-center gap-1 sm:gap-1.5">
              {i > 0 ? (
                <span
                  aria-hidden
                  className={cn(
                    "hidden h-px w-3 sm:block sm:w-5",
                    resolved === "todo" ? "bg-border" : "bg-brand/50",
                  )}
                />
              ) : null}
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold transition-colors sm:px-2.5 sm:text-[12px]",
                  resolved === "done" && "text-muted-foreground",
                  resolved === "active" && "bg-brand-soft text-foreground",
                  resolved === "todo" && "text-muted-foreground/55",
                )}
              >
                <span
                  className={cn(
                    "grid size-4 place-items-center rounded-full text-[10px] sm:size-[1.05rem]",
                    resolved === "done" && "bg-success-soft text-success",
                    resolved === "active" && "bg-brand text-brand-foreground",
                    resolved === "todo" && "bg-muted text-muted-foreground",
                  )}
                >
                  {resolved === "done" ? (
                    <Check className="size-2.5" strokeWidth={3} />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="hidden sm:inline">{item.label}</span>
              </div>
            </div>
          );
        })}
      </nav>
      <div className="mx-auto mt-2 hidden h-1 max-w-md overflow-hidden rounded-full bg-muted sm:block">
        <div
          className="h-full rounded-full bg-brand-gradient transition-[width] duration-500"
          style={{ width: `${Math.min(100, Math.max(8, pct))}%` }}
        />
      </div>
    </div>
  );
}
