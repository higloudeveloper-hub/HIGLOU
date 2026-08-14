"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check, Eye, Sparkles, Store } from "lucide-react";
import { usePrefersReducedMotion } from "@/components/listing/wizard/use-prefers-reduced-motion";
import { LiveDot } from "@/components/ui/studio";
import type { ProductImage } from "@/types/product";
import { cn } from "@/lib/utils";

const SAMPLE_TITLE = "Milwaukee M18 FUEL 1/2 in. Hammer Drill";
const PHOTO_SLOTS = [
  { tone: "#d7c4a3", label: "Front" },
  { tone: "#c9b08a", label: "Label" },
  { tone: "#b08968", label: "Box" },
  { tone: "#8f6a4a", label: "Angle" },
] as const;

const BEATS = [
  { id: "scan", line: "Reading labels and packaging…" },
  { id: "write", line: "Writing title, category, and price…" },
  { id: "ready", line: "Draft ready — you glance, then go live." },
  { id: "live", line: "Live on your eBay store." },
] as const;

function useTyped(text: string, on: boolean, reduce: boolean) {
  const [out, setOut] = useState(reduce || !on ? text : "");
  useEffect(() => {
    if (reduce) {
      setOut(text);
      return;
    }
    if (!on) {
      setOut("");
      return;
    }
    setOut("");
    let i = 0;
    const t = window.setInterval(() => {
      i += 1;
      setOut(text.slice(0, i));
      if (i >= text.length) window.clearInterval(t);
    }, 26);
    return () => window.clearInterval(t);
  }, [text, on, reduce]);
  return out;
}

export function PhotosWowStrip({
  images,
  storeName,
  price,
}: {
  images: ProductImage[];
  storeName?: string | null;
  price: number | null;
}) {
  const reduce = usePrefersReducedMotion();
  const [beat, setBeat] = useState(reduce ? BEATS.length - 1 : 0);
  const shop = storeName?.trim() || "your eBay store";
  const writing = beat >= 1;
  const live = beat >= 3;
  const typing = useTyped(SAMPLE_TITLE, writing, reduce);
  const priceLabel =
    price != null ? `$${price.toFixed(2)}` : writing ? "$189.00" : "—";
  const shots = images.slice(0, 4);
  const filled = Math.max(shots.length, live || writing ? 4 : beat + 1);

  useEffect(() => {
    if (reduce) return;
    const t = window.setInterval(
      () => setBeat((b) => (b + 1) % BEATS.length),
      2400,
    );
    return () => window.clearInterval(t);
  }, [reduce]);

  return (
    <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <section className="relative col-span-2 min-h-[200px] overflow-hidden rounded-[28px] bg-foreground text-background shadow-[0_24px_60px_-36px_rgba(20,16,8,0.6)] ring-1 ring-black/10 lg:col-span-4">
        <div className="grid min-h-[200px] lg:grid-cols-[minmax(220px,0.42fr)_minmax(0,1fr)]">
          <div className="relative bg-zinc-900 p-4">
            <div className="grid grid-cols-2 gap-1.5">
              {PHOTO_SLOTS.map((slot, i) => {
                const shot = shots[i];
                const on = i < filled;
                return (
                  <motion.div
                    key={slot.label}
                    initial={false}
                    animate={{ opacity: on ? 1 : 0.28, scale: on ? 1 : 0.96 }}
                    transition={{ delay: i * 0.08, duration: 0.35 }}
                    className="relative aspect-[4/3] overflow-hidden rounded-xl"
                    style={{ background: slot.tone }}
                  >
                    {shot ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={shot.previewUrl || shot.url}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : null}
                    <span className="absolute bottom-1 left-1 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-medium text-white/90">
                      {slot.label}
                    </span>
                  </motion.div>
                );
              })}
            </div>
            {!reduce && beat === 0 ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-3 top-6 h-14 bg-gradient-to-b from-brand/50 to-transparent [animation:higlou-scan_2s_ease-in-out_infinite]"
              />
            ) : null}
          </div>

          <div className="flex flex-col justify-between gap-4 p-5 sm:p-6">
            <div>
              <p className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-background/50 uppercase">
                <LiveDot tone={live ? "success" : "brand"} />
                After you drop photos · {shop}
              </p>
              <p className="mt-3 min-h-[52px] font-display text-[22px] leading-tight tracking-tight sm:text-[28px]">
                {writing ? typing : "Your listing writes itself"}
                {writing && typing.length < SAMPLE_TITLE.length && !reduce ? (
                  <span className="ml-0.5 inline-block h-5 w-px animate-pulse bg-brand" />
                ) : null}
              </p>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-display text-3xl tracking-tight">{priceLabel}</p>
                <p className="mt-1 text-[13px] text-background/60">
                  {BEATS[beat].line}
                </p>
                <div className="mt-2 h-1 w-40 overflow-hidden rounded-full bg-background/15">
                  <motion.div
                    className="h-full bg-brand"
                    animate={{ width: `${((beat + 1) / BEATS.length) * 100}%` }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
              </div>
              <span
                className={cn(
                  "rounded-full px-3 py-1.5 text-[12px] font-semibold",
                  live
                    ? "bg-success text-white"
                    : writing
                      ? "bg-brand text-brand-foreground"
                      : "bg-background/15 text-background/80",
                )}
              >
                {live ? "LIVE ON EBAY" : writing ? "DRAFT" : "WAITING ON PHOTOS"}
              </span>
            </div>
          </div>
        </div>
      </section>

      <WowTile
        icon={Eye}
        label="Reads the photos"
        value="Labels, UPC, box"
        hint="OCR + barcode, locally"
      />
      <WowTile
        icon={Sparkles}
        label="Writes the listing"
        value="Title, category, price"
        hint="You only glance and tweak"
        wide
      />
      <WowTile
        icon={Store}
        label="Goes live"
        value={shop}
        hint="Offer → your eBay store"
      />
    </div>
  );
}

function WowTile({
  icon: Icon,
  label,
  value,
  hint,
  wide = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  wide?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "min-h-[120px] rounded-[24px] border border-border/70 bg-surface p-4 shadow-[0_16px_40px_-32px_rgba(20,16,8,0.45)]",
        wide && "col-span-2",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="grid size-9 place-items-center rounded-2xl bg-foreground text-brand">
          <Icon className="size-4" />
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
          <Check className="size-3" strokeWidth={3} /> Auto
        </span>
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
