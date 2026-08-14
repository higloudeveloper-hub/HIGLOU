"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ExternalLink, Home, Plus } from "lucide-react";
import { usePrefersReducedMotion } from "@/components/listing/wizard/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

const BITS = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  left: `${(i * 17 + 8) % 92}%`,
  delay: (i % 10) * 0.05,
  duration: 1.15 + (i % 5) * 0.12,
  color: i % 3 === 0 ? "#f4c928" : i % 3 === 1 ? "#111111" : "#ffffff",
  w: i % 4 === 0 ? 10 : 6,
  h: i % 3 === 0 ? 14 : 6,
  rotate: (i * 41) % 360,
}));

function Confetti() {
  const reduce = usePrefersReducedMotion();
  if (reduce) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {BITS.map((bit) => (
        <motion.span
          key={bit.id}
          aria-hidden
          className="absolute top-[-12px] rounded-[2px]"
          style={{
            left: bit.left,
            width: bit.w,
            height: bit.h,
            background: bit.color,
          }}
          initial={{ y: 0, opacity: 1, rotate: 0, scale: 1 }}
          animate={{ y: 420, opacity: 0, rotate: bit.rotate, scale: 0.7 }}
          transition={{
            duration: bit.duration,
            delay: bit.delay,
            ease: [0.22, 1, 0.36, 1],
          }}
        />
      ))}
    </div>
  );
}

export function PublishCelebrate({
  mode,
  storeLabel,
  title,
  photoSrc,
  listingUrl,
  listingId,
  storePath,
  onListAnother,
}: {
  mode: "draft" | "live";
  storeLabel: string;
  title: string;
  photoSrc: string;
  listingUrl: string | null;
  listingId?: string | null;
  storePath?: string | null;
  onListAnother?: () => void;
}) {
  const live = mode === "live";
  const shop = storeLabel.trim() || "your eBay store";

  return (
    <motion.section
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full max-w-[560px] overflow-hidden rounded-[32px] border border-border/70 bg-surface shadow-[0_40px_90px_-40px_rgba(20,16,8,0.6)]"
    >
      <Confetti />

      <div className="relative overflow-hidden bg-foreground">
        {photoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoSrc}
            alt=""
            className="h-[200px] w-full object-cover sm:h-[220px]"
          />
        ) : (
          <div className="grid h-[200px] place-items-center text-sm text-background/50">
            eBay
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-foreground via-foreground/20 to-transparent" />
        <motion.span
          initial={{ scale: 0.6, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: "spring", bounce: 0.42, delay: 0.15 }}
          className={cn(
            "absolute top-4 left-4 rounded-full px-3 py-1 text-[12px] font-semibold tracking-[0.14em] uppercase",
            live ? "bg-success text-white" : "bg-brand text-brand-foreground",
          )}
        >
          {live ? "Live on eBay" : "Draft on eBay"}
        </motion.span>
      </div>

      <div className="relative px-6 pt-5 pb-6 sm:px-7">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          {live ? `${shop}` : `Draft in ${shop}`}
        </p>
        <h2 className="mt-1 font-display text-[34px] leading-none tracking-tight sm:text-[40px]">
          {live ? "Happy sell." : "Draft ready."}
        </h2>
        <p className="mt-2 line-clamp-2 text-[14px] text-muted-foreground">
          {title || "Your listing"}
        </p>
        {listingId ? (
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">
            {listingId}
            {storePath ? ` · ${storePath}` : ""}
          </p>
        ) : null}

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {listingUrl ? (
            <a
              href={listingUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3.5 text-[15px] font-semibold text-brand-foreground shadow-sm transition hover:-translate-y-px"
            >
              View on eBay <ExternalLink className="size-4" />
            </a>
          ) : (
            <span className="inline-flex items-center justify-center rounded-2xl bg-muted px-4 py-3.5 text-[14px] font-medium text-muted-foreground">
              Open Seller Hub to finish
            </span>
          )}
          <Link
            href="/home"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-foreground px-4 py-3.5 text-[15px] font-semibold text-background transition hover:-translate-y-px"
          >
            <Home className="size-4" /> Go home
          </Link>
        </div>

        {onListAnother ? (
          <button
            type="button"
            onClick={onListAnother}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border py-3 text-[13px] font-medium hover:bg-muted"
          >
            <Plus className="size-3.5" /> List another
          </button>
        ) : null}
      </div>
    </motion.section>
  );
}
