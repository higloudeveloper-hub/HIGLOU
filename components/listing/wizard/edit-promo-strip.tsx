"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Check, ImageIcon, MapPin, Tag } from "lucide-react";
import { usePrefersReducedMotion } from "@/components/listing/wizard/use-prefers-reduced-motion";
import { LiveDot } from "@/components/ui/studio";
import { cn } from "@/lib/utils";

const BEATS = [
  "Photos locked in",
  "Title and price set",
  "Category matched",
  "Ready to go live",
] as const;

export function EditPromoStrip({
  photoSrc,
  title,
  priceLabel,
  storeName,
  categoryLabel,
  categoryMatch,
  photoCount,
  shipsFrom,
  shippingLabel,
  onGoLive,
}: {
  photoSrc?: string | null;
  title: string;
  priceLabel: string;
  storeName: string;
  categoryLabel: string;
  categoryMatch: boolean;
  photoCount: number;
  shipsFrom: string;
  shippingLabel: string;
  onGoLive: () => void;
}) {
  const reduce = usePrefersReducedMotion();
  const [beat, setBeat] = useState(reduce ? BEATS.length - 1 : 0);
  const live = beat >= 3;
  const shop = storeName.trim() || "your eBay store";

  useEffect(() => {
    if (reduce) return;
    const t = window.setInterval(
      () => setBeat((b) => (b + 1) % BEATS.length),
      2200,
    );
    return () => window.clearInterval(t);
  }, [reduce]);

  return (
    <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <button
        type="button"
        onClick={onGoLive}
        className="group relative col-span-2 min-h-[168px] overflow-hidden rounded-[28px] bg-foreground text-left text-background shadow-[0_20px_50px_-32px_rgba(20,16,8,0.55)] ring-1 ring-black/10 lg:col-span-4"
      >
        <div className="grid h-full min-h-[168px] sm:grid-cols-[minmax(140px,0.42fr)_minmax(0,1fr)]">
          <div className="relative min-h-[148px] bg-muted/20">
            {photoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoSrc}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full place-items-center text-[12px] text-background/50">
                Listing photo
              </div>
            )}
            {!reduce ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-brand/45 to-transparent [animation:higlou-scan_2.2s_ease-in-out_infinite]"
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-foreground/80 max-sm:bg-gradient-to-t" />
          </div>

          <div className="relative flex flex-col justify-between gap-3 p-4 sm:p-5">
            <div>
              <p className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-background/55 uppercase">
                <LiveDot tone={live ? "success" : "brand"} />
                Next on eBay · {shop}
              </p>
              <p className="mt-2 line-clamp-2 font-display text-[22px] leading-tight tracking-tight sm:text-[26px]">
                {title || "Your listing"}
              </p>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-display text-3xl tracking-tight">
                  {priceLabel}
                </p>
                <p className="mt-1 text-[12.5px] text-background/60">
                  {BEATS[beat]}
                </p>
                <div className="mt-2 flex gap-1">
                  {BEATS.map((label, i) => (
                    <span
                      key={label}
                      className={cn(
                        "h-1 w-8 rounded-full",
                        i <= beat ? "bg-brand" : "bg-background/20",
                      )}
                    />
                  ))}
                </div>
              </div>
              <span className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[13px] font-semibold text-brand-foreground transition group-hover:-translate-y-px">
                {live ? "LIVE" : "DRAFT"}
                <ArrowRight className="size-4" />
              </span>
            </div>
          </div>
        </div>
      </button>

      <PromoTile
        icon={ImageIcon}
        label="Photos"
        value={`${photoCount} ready`}
        hint="Angles, box, and labels"
      />
      <PromoTile
        icon={Tag}
        label="Category"
        value={categoryLabel}
        hint={categoryMatch ? "eBay match" : "Confirm before publish"}
        wide
        ok={categoryMatch}
      />
      <PromoTile
        icon={MapPin}
        label="Shipping"
        value={shipsFrom}
        hint={shippingLabel}
      />
    </div>
  );
}

function PromoTile({
  icon: Icon,
  label,
  value,
  hint,
  wide = false,
  ok = true,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  wide?: boolean;
  ok?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "min-h-[112px] rounded-[24px] border border-border/70 bg-surface p-4 shadow-[0_16px_40px_-32px_rgba(20,16,8,0.45)]",
        wide && "col-span-2",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="grid size-9 place-items-center rounded-2xl bg-foreground text-brand">
          <Icon className="size-4" />
        </span>
        {ok ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
            <Check className="size-3" strokeWidth={3} /> Ready
          </span>
        ) : (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900">
            Check
          </span>
        )}
      </div>
      <p className="mt-3 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 truncate text-[15px] font-semibold tracking-tight">
        {value}
      </p>
      <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{hint}</p>
    </motion.div>
  );
}
