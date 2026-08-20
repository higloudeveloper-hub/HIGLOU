"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export function ListingCard({
  href,
  photo,
  title,
  brand,
  meta,
  price,
  badge,
  badgeTone = "muted",
  priority = false,
  amazonHref,
  selected = false,
  selectIndex = null,
  onToggleSelect,
}: {
  href: string;
  photo?: string | null;
  title: string;
  brand?: string | null;
  meta?: string;
  price?: string | null;
  badge?: string;
  badgeTone?: "muted" | "ready";
  priority?: boolean;
  amazonHref?: string | null;
  selected?: boolean;
  selectIndex?: number | null;
  onToggleSelect?: () => void;
}) {
  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-[20px] bg-white shadow-[0_1px_3px_rgba(15,17,17,0.08),0_8px_24px_-14px_rgba(15,17,17,0.18)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_16px_36px_-16px_rgba(15,17,17,0.28)]",
        selected && "ring-2 ring-[#191919]",
      )}
    >
      {onToggleSelect ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleSelect();
          }}
          aria-pressed={selected}
          aria-label={selected ? "Quitar de la promo de Facebook" : "Elegir para Facebook"}
          className={cn(
            "absolute top-2.5 left-2.5 z-10 flex size-8 items-center justify-center rounded-full border-2 text-[12px] font-bold shadow-sm",
            selected
              ? "border-[#191919] bg-[#191919] text-white"
              : "border-[#ccc] bg-white text-[#9b9b9b] hover:border-[#191919]",
          )}
        >
          {selected ? (selectIndex ?? "✓") : "+"}
        </button>
      ) : null}
      <Link href={href} className="group block">
        <div className="relative aspect-[16/10] bg-[#f3f3f3]">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt=""
              decoding="async"
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : "auto"}
              className="absolute inset-0 size-full object-contain p-3"
            />
          ) : (
            <div className="grid size-full place-items-center text-[12px] text-[#bbb]">
              No photo yet
            </div>
          )}
          {badge ? (
            <span
              className={cn(
                "absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm",
                badgeTone === "ready"
                  ? "bg-white text-emerald-800"
                  : "bg-white/95 text-[#191919]",
              )}
            >
              {badge}
            </span>
          ) : null}
        </div>
        <div className="px-3.5 py-3">
          <p className="line-clamp-2 min-h-[40px] text-[15px] leading-snug font-bold tracking-tight text-[#191919]">
            {title || "Untitled listing"}
          </p>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <p className="truncate text-[13px] text-[#707070]">
              {[brand || "Brand TBD", meta].filter(Boolean).join(" · ")}
            </p>
            {price ? (
              <p className="shrink-0 text-[15px] font-bold tabular-nums text-[#191919]">
                {price}
              </p>
            ) : null}
          </div>
        </div>
      </Link>
      {amazonHref ? (
        <div className="border-t border-[#f0f0f0] px-3.5 py-2.5">
          <a
            href={amazonHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#ccc] bg-white px-2.5 text-[12px] font-semibold text-[#141414] transition hover:border-[#141414]"
          >
            Open on Amazon
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      ) : null}
    </article>
  );
}
