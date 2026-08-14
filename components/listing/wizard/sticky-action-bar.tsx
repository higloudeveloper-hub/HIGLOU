import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StickyActionBar({
  left,
  center,
  right,
  className,
}: {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/90 backdrop-blur-lg animate-in slide-in-from-bottom-2 duration-500",
        className,
      )}
    >
      <div className="mx-auto flex min-h-[76px] max-w-[1600px] flex-wrap items-center gap-4 px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">{left}</div>
        <div className="mx-auto hidden md:block">{center}</div>
        <div className="ml-auto flex items-center gap-3">{right}</div>
      </div>
    </div>
  );
}
