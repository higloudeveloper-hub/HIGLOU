import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function LiveDot({
  className,
  tone = "brand",
}: {
  className?: string;
  tone?: "brand" | "success" | "muted";
}) {
  return (
    <span
      className={cn(
        "live-dot inline-block size-2 rounded-full",
        tone === "brand" && "bg-brand",
        tone === "success" && "bg-success",
        tone === "muted" && "bg-muted-foreground/50",
        className,
      )}
      aria-hidden
    />
  );
}

export function SkeletonBlock({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn("shimmer rounded-xl bg-muted", className)}
      aria-hidden
    />
  );
}

export function EmptyPanel({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid min-h-[280px] place-items-center rounded-xl border border-[#e5e5e5] bg-white px-6 py-16 text-center">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.2em] text-[#707070] uppercase">
          Higlou
        </p>
        <h3 className="mt-3 text-[20px] font-semibold tracking-tight text-[#191919]">
          {title}
        </h3>
        <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-[#707070]">
          {body}
        </p>
        {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}

export function IndeterminateBar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative h-1.5 overflow-hidden rounded-full bg-muted",
        className,
      )}
    >
      <span className="higlou-indeterminate absolute inset-y-0 w-1/3 rounded-full bg-brand-gradient [animation:higlou-progress_1.2s_ease-in-out_infinite]" />
    </div>
  );
}
