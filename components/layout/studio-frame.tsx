"use client";

import { cn } from "@/lib/utils";

export function StudioFrame({
  kicker,
  title,
  hint,
  action,
  children,
  scroll = true,
}: {
  kicker: string;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  /** Scroll the body. Turn off when the page fills with its own split panes. */
  scroll?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white md:h-full">
      <header className="flex shrink-0 items-center gap-3 border-b border-[#e5e5e5] px-5 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-[#707070] uppercase">
            {kicker}
          </p>
          <div className="mt-0.5 flex min-w-0 items-baseline gap-2">
            <h1 className="truncate text-[17px] font-semibold tracking-tight text-[#191919]">
              {title}
            </h1>
            {hint ? (
              <p className="hidden min-w-0 truncate text-[12px] text-[#707070] sm:block">
                {hint}
              </p>
            ) : null}
          </div>
        </div>
        {action}
      </header>
      <div
        className={cn(
          "min-h-0 flex-1",
          scroll
            ? "overflow-y-auto bg-[#f7f7f7]"
            : "flex flex-col overflow-hidden bg-white",
        )}
      >
        {children}
      </div>
    </div>
  );
}
