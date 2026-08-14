"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check, Eye, Sparkles, Store } from "lucide-react";
import { usePrefersReducedMotion } from "@/components/listing/wizard/use-prefers-reduced-motion";
import { LiveDot } from "@/components/ui/studio";
import { EbayLivePreview, useConnectedEbayStoreName } from "@/components/studio/ebay-live-preview";
import type { ProductImage } from "@/types/product";
import { cn } from "@/lib/utils";

const SAMPLE_TITLE = "Milwaukee M18 FUEL 1/2 in. Hammer Drill";
const PHOTO_SLOTS = [
  { src: "/demo/m18-front.webp", label: "Front" },
  { src: "/demo/m18-label.webp", label: "Label" },
  { src: "/demo/m18-box.webp", label: "Box" },
  { src: "/demo/m18-angle.webp", label: "Angle" },
] as const;

const BEATS = [
  { id: "scan", line: "Reading labels and packaging…" },
  { id: "write", line: "Writing title, category, and price…" },
  { id: "ready", line: "You check the draft." },
  { id: "live", line: "Published — the product is live on eBay." },
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
  const shop = useConnectedEbayStoreName(storeName);
  const writing = beat >= 1;
  const live = beat >= 3;
  const typing = useTyped(SAMPLE_TITLE, writing && !live, reduce);
  const priceLabel =
    price != null ? `$${price.toFixed(2)}` : "$189.00";
  const shots = images.slice(0, 4);
  const heroPhoto =
    shots[0]?.previewUrl || shots[0]?.url || PHOTO_SLOTS[0].src;
  const headline = live
    ? "Live on eBay."
    : writing
      ? typing
      : "Your listing writes itself";

  useEffect(() => {
    if (reduce) return;
    const t = window.setInterval(
      () => setBeat((b) => (b + 1) % BEATS.length),
      2600,
    );
    return () => window.clearInterval(t);
  }, [reduce]);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <section className="relative col-span-2 overflow-hidden rounded-[28px] bg-foreground text-background shadow-[0_24px_60px_-36px_rgba(20,16,8,0.6)] ring-1 ring-black/10 lg:col-span-4">
        <div className="grid h-[360px] lg:h-[380px] lg:grid-cols-2">
          <div className="flex min-h-0 flex-col p-4 sm:p-5">
            <p className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-background/50 uppercase">
              <LiveDot tone={live ? "success" : "brand"} />
              After you drop photos · {shop}
            </p>
            <p className="mt-2 line-clamp-2 min-h-[48px] font-display text-[22px] leading-tight tracking-tight sm:text-[26px]">
              {headline}
              {writing &&
              !live &&
              typing.length < SAMPLE_TITLE.length &&
              !reduce ? (
                <span className="ml-0.5 inline-block h-5 w-px animate-pulse bg-brand" />
              ) : null}
            </p>

            <div className="relative mt-3 min-h-0 flex-1">
              <div className="grid h-full grid-cols-2 grid-rows-2 gap-1.5">
                {PHOTO_SLOTS.map((slot, i) => {
                  const shot = shots[i];
                  const src = shot?.previewUrl || shot?.url || slot.src;
                  return (
                    <div
                      key={slot.label}
                      className="relative min-h-0 overflow-hidden rounded-xl bg-zinc-900"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt=""
                        className="absolute inset-0 h-full w-full object-contain p-1.5"
                      />
                      <span className="absolute bottom-1 left-1 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-medium text-white/90">
                        {slot.label}
                      </span>
                    </div>
                  );
                })}
              </div>
              {!reduce && beat === 0 ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-2 top-3 h-10 bg-gradient-to-b from-brand/50 to-transparent [animation:higlou-scan_2s_ease-in-out_infinite]"
                />
              ) : null}
            </div>

            <div className="mt-3 flex shrink-0 items-end justify-between gap-3">
              <div>
                <p className="min-h-[18px] text-[13px] text-background/60">
                  {BEATS[beat].line}
                </p>
                <div className="mt-2 h-1 w-40 overflow-hidden rounded-full bg-background/15">
                  <motion.div
                    className="h-full bg-brand"
                    animate={{
                      width: `${((beat + 1) / BEATS.length) * 100}%`,
                    }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
              </div>
              <span className="rounded-full bg-brand px-3 py-1.5 text-[12px] font-semibold text-brand-foreground">
                {live ? "LIVE" : writing ? "DRAFT" : "WAITING ON PHOTOS"}
              </span>
            </div>
          </div>

          <div className="min-h-0 border-t border-white/10 bg-zinc-950/40 p-3 lg:border-t-0 lg:border-l">
            <EbayLivePreview
              compact
              photoSrc={heroPhoto}
              title={SAMPLE_TITLE}
              priceLabel={priceLabel}
              storeName={shop}
              live={live}
            />
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
        label="Goes live on eBay"
        value={shop}
        hint="Buyers see the listing on the platform"
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
