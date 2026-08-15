"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";

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
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-[440px] overflow-hidden rounded-[36px] bg-white shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
    >
      <div className="bg-white">
        {photoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoSrc}
            alt=""
            className="mx-auto h-[280px] w-full object-contain p-8 sm:h-[300px]"
          />
        ) : (
          <div className="grid h-[220px] place-items-center text-[15px] text-zinc-300">
            eBay
          </div>
        )}
      </div>

      <div className="px-8 pb-8 pt-1">
        <p className="flex items-center gap-2 text-[13px] font-medium text-zinc-500">
          <span
            className={
              live
                ? "inline-block size-1.5 rounded-full bg-emerald-500"
                : "inline-block size-1.5 rounded-full bg-zinc-300"
            }
          />
          {live ? `Live on ${shop}` : `Draft in ${shop}`}
        </p>
        <h2 className="mt-2 font-display text-[44px] leading-none tracking-tight text-zinc-950">
          {live ? "It's live." : "Draft ready."}
        </h2>
        <p className="mt-4 text-[17px] font-medium leading-snug text-zinc-950">
          {title || "Your listing"}
        </p>
        {listingId || storePath ? (
          <p className="mt-2 text-[13px] text-zinc-500">
            {[listingId, storePath].filter(Boolean).join(" · ")}
          </p>
        ) : null}

        {listingUrl ? (
          <a
            href={listingUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-zinc-950 text-[15px] font-medium text-white transition hover:bg-zinc-800"
          >
            View on eBay
            <ArrowUpRight className="size-4" />
          </a>
        ) : (
          <p className="mt-7 rounded-full bg-zinc-100 px-4 py-3 text-center text-[14px] text-zinc-500">
            Open Seller Hub to finish
          </p>
        )}

        <div className="mt-4 flex items-center justify-center gap-6 text-[15px]">
          {onListAnother ? (
            <button
              type="button"
              onClick={onListAnother}
              className="font-medium text-zinc-950 underline-offset-4 hover:underline"
            >
              List another
            </button>
          ) : null}
          <Link
            href="/home"
            className="text-zinc-500 underline-offset-4 hover:text-zinc-950 hover:underline"
          >
            Home
          </Link>
        </div>
      </div>
    </motion.section>
  );
}
