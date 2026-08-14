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
  onSelect,
  className,
}: {
  step: WizardStep;
  exported?: boolean;
  onSelect?: (index: number) => void;
  className?: string;
}) {
  const lastIndex = WIZARD_PROGRESS_STEPS.length - 1;
  const active = exported ? lastIndex : wizardStepToProgressIndex(step);
  const pct = ((active + (exported ? 1 : 0.28)) / WIZARD_PROGRESS_STEPS.length) * 100;

  return (
    <div className={cn("w-full min-w-0", className)}>
      <nav aria-label="Listing steps" className="relative mx-auto max-w-xl">
        <div className="absolute top-4 right-8 left-8 hidden h-[2px] overflow-hidden rounded-full bg-muted sm:block">
          <div
            className="h-full rounded-full bg-brand-gradient transition-[width] duration-500 ease-out"
            style={{ width: `${Math.min(100, Math.max(6, pct))}%` }}
          />
        </div>
        <ol className="relative flex items-start justify-between gap-1">
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
            const clickable = Boolean(onSelect) && i < active && !exported;

            return (
              <li key={item.id} className="flex min-w-0 flex-1 flex-col items-center">
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && onSelect?.(i)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl px-1 py-0.5 transition",
                    clickable && "hover:opacity-80",
                    !clickable && "cursor-default",
                  )}
                >
                  <span
                    className={cn(
                      "relative z-10 grid size-8 place-items-center rounded-full text-[12px] font-semibold shadow-sm transition-colors duration-300",
                      resolved === "done" &&
                        "bg-foreground text-background",
                      resolved === "active" &&
                        "bg-brand text-brand-foreground ring-4 ring-brand/20",
                      resolved === "todo" &&
                        "border border-border bg-surface text-muted-foreground",
                    )}
                  >
                    {resolved === "done" ? (
                      <Check className="size-3.5" strokeWidth={3} />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span
                    className={cn(
                      "hidden text-[11px] font-semibold tracking-wide sm:block",
                      resolved === "active"
                        ? "text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {item.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
