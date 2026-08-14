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
    <div className="relative overflow-hidden rounded-3xl border border-dashed border-border bg-surface px-6 py-12 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-10 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(255,199,44,0.18),transparent_70%)]"
      />
      <p className="text-[11px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
        Higlou
      </p>
      <h3 className="mt-3 font-display text-2xl tracking-tight text-foreground">
        {title}
      </h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        {body}
      </p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
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
