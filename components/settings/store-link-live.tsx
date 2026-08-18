"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { usePrefersReducedMotion } from "@/components/listing/wizard/use-prefers-reduced-motion";
import { LiveDot } from "@/components/ui/studio";
import { EbayMark, AmazonMark } from "@/components/brand/store-marks";
import { cn } from "@/lib/utils";

function SignalBars({
  strength,
  reduce,
}: {
  strength: number;
  reduce: boolean;
}) {
  return (
    <div className="flex h-4 items-end gap-[3px]" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => {
        const on = i <= strength;
        return (
          <motion.span
            key={i}
            className={cn(
              "w-[3px] rounded-[1px]",
              on ? "bg-emerald-400" : "bg-white/18",
            )}
            style={{ height: 5 + i * 2.4 }}
            animate={
              on && !reduce
                ? { opacity: [0.45, 1, 0.45] }
                : { opacity: on ? 1 : 0.35 }
            }
            transition={{
              duration: 1.15,
              repeat: reduce ? 0 : Infinity,
              delay: i * 0.12,
              ease: "easeInOut",
            }}
          />
        );
      })}
    </div>
  );
}

function FiberBar({
  live,
  pinging,
  reduce,
}: {
  live: boolean;
  pinging: boolean;
  reduce: boolean;
}) {
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className={cn(
          "h-full rounded-full",
          live
            ? "bg-gradient-to-r from-brand via-white to-[#3665F3]"
            : "bg-white/15",
        )}
        style={{ width: live ? "100%" : "18%" }}
      />
      {live && !reduce ? (
        <motion.span
          aria-hidden
          className="absolute top-0 h-full w-14 rounded-full bg-white/90 shadow-[0_0_18px_rgba(255,255,255,0.85)]"
          animate={{ left: ["-18%", "108%"] }}
          transition={{
            duration: pinging ? 0.7 : 2.1,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ) : null}
    </div>
  );
}

export function StoreLinkLive({
  storeName,
  username,
  envLabel,
  pingMs,
  pinging,
  live,
  channel = "ebay",
}: {
  storeName: string;
  username?: string | null;
  envLabel: string;
  pingMs: number | null;
  pinging: boolean;
  live: boolean;
  channel?: "ebay" | "amazon";
}) {
  const reduce = usePrefersReducedMotion();
  const strength = !live ? 0 : pinging ? 3 : pingMs != null && pingMs < 800 ? 5 : 4;
  const latency =
    pinging ? "syncing…" : pingMs != null ? `${pingMs} ms` : "live";

  return (
    <div className="relative h-[168px] overflow-hidden rounded-[24px] bg-foreground text-background">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 right-8 size-40 rounded-full bg-[radial-gradient(circle,rgba(54,101,243,0.35),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -left-8 size-44 rounded-full bg-[radial-gradient(circle,rgba(244,201,40,0.28),transparent_70%)]"
      />

      <div className="relative flex h-full flex-col justify-between p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-background/50 uppercase">
            <LiveDot tone={live ? "success" : "muted"} />
            {live ? "Live link" : "No link"}
          </p>
          <div className="flex items-center gap-2">
            <SignalBars strength={strength} reduce={reduce} />
            <span className="min-w-[64px] text-right text-[12px] font-semibold tabular-nums text-background/70">
              {live ? latency : "offline"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <span className="rounded-full bg-background px-2.5 py-1 text-[11px] font-bold tracking-tight text-foreground">
            Higlou
          </span>
          <FiberBar live={live} pinging={pinging} reduce={reduce} />
          <span className="rounded-full bg-white px-2.5 py-1 text-[13px] leading-none">
            {channel === "amazon" ? (
              <AmazonMark className="h-3.5" />
            ) : (
              <EbayMark className="h-3.5" />
            )}
          </span>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-display text-[26px] leading-none tracking-tight">
              {storeName}
            </p>
            <p className="mt-1 truncate text-[12px] text-background/55">
              {live
                ? `${envLabel}${username ? ` · @${username}` : ""} · publishing ready`
                : "Connect the seller account to publish live"}
            </p>
          </div>
          {live ? (
            <span className="shrink-0 rounded-full bg-emerald-400/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
              Handshake OK
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
