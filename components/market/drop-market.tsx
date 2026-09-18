"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import {
  MARKET_DROPS,
  marketSpread,
  type MarketDrop,
} from "@/lib/market/catalog";
import { PriceDrop } from "@/components/market/price-drop";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function heatLabel(heat: MarketDrop["heat"]) {
  if (heat === "hot") return "Hot drop";
  if (heat === "warm") return "Moving";
  return "Just in";
}

export function DropMarketStudio() {
  const router = useRouter();
  const reduce = useReducedMotion() ?? false;
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const drop = MARKET_DROPS[active] ?? MARKET_DROPS[0]!;
  const spread = marketSpread(drop);

  const claim = useCallback(
    async (id: string) => {
      setBusy(id);
      try {
        const res = await fetch("/api/market/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dropId: id }),
        });
        const body = (await res.json()) as {
          error?: string;
          href?: string;
          note?: string;
        };
        if (!res.ok) {
          toast.error(body.error || "Could not add to your store");
          return;
        }
        toast.success("In your store — draft ready");
        if (body.note) toast.message(body.note);
        if (body.href) router.push(body.href);
      } catch {
        toast.error("Claim failed");
      } finally {
        setBusy(null);
      }
    },
    [router],
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#f4f6f8]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.45]"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 80% 50% at 20% -10%, #d7e4ff 0%, transparent 55%), radial-gradient(ellipse 60% 40% at 90% 10%, #ffe8d6 0%, transparent 50%), linear-gradient(180deg, #f4f6f8 0%, #eef1f4 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(#0c0c0c 1px, transparent 1px), linear-gradient(90deg, #0c0c0c 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Hero — one composition */}
      <section className="relative z-[1] grid min-h-[100svh] lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative flex flex-col justify-between px-6 pt-8 pb-10 sm:px-10 lg:px-14 lg:pt-12 lg:pb-14">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.28em] text-[#5a6472] uppercase">
              Higlou Market
            </p>
            <h1 className="mt-4 max-w-[12ch] font-[family-name:var(--font-instrument-serif)] text-[52px] leading-[0.92] tracking-tight text-[#0c0c0c] sm:text-[72px] lg:text-[88px]">
              Drops that{" "}
              <span className="italic text-[#e85d04]">pay</span>
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-[#4a5563]">
              Curated products ready for your store. One click adds a draft —
              list it, affiliate it, or buy the supply. Spreads are estimates,
              never invented sold comps.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy === drop.id}
                onClick={() => void claim(drop.id)}
                className="inline-flex h-12 items-center gap-2 bg-[#0c0c0c] px-6 text-[13px] font-semibold tracking-wide text-white uppercase transition hover:bg-[#252525] disabled:opacity-50"
              >
                {busy === drop.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Add to my store
              </button>
              <Link
                href="/winners"
                className="inline-flex h-12 items-center px-5 text-[13px] font-semibold tracking-wide text-[#0c0c0c] underline-offset-4 hover:underline"
              >
                Find more winners
              </Link>
            </div>
          </div>

          <div className="mt-12 border-t border-[#0c0c0c]/10 pt-6">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-[#8a93a0] uppercase">
              Live ask → your list
            </p>
            <PriceDrop
              key={drop.id}
              from={drop.comps}
              to={drop.sell}
              size="hero"
              className="mt-3"
            />
            <p className="mt-3 text-[13px] text-[#5a6472]">
              Est. keep after cost{" "}
              <span className="font-semibold tabular-nums text-[#0c0c0c]">
                {money(spread)}
              </span>
              <span className="text-[#8a93a0]"> · not sold comps</span>
            </p>
          </div>
        </div>

        <div className="relative min-h-[52vh] lg:min-h-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={drop.id}
              initial={reduce ? false : { opacity: 0, scale: 1.04 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduce ? undefined : { opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.55, ease: EASE }}
              className="absolute inset-0"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={drop.photo}
                alt={drop.title}
                className="size-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c0c]/55 via-transparent to-transparent" />
              <div className="absolute right-6 bottom-6 left-6 text-white sm:right-10 sm:bottom-10 sm:left-10">
                <span className="inline-flex bg-[#e85d04] px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] uppercase">
                  {heatLabel(drop.heat)}
                </span>
                <p className="mt-3 font-[family-name:var(--font-instrument-serif)] text-[28px] leading-tight sm:text-[36px]">
                  {drop.title}
                </p>
                <p className="mt-2 max-w-lg text-[13px] text-white/80">
                  {drop.blurb}
                </p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </section>

      {/* Strip — interaction containers */}
      <section className="relative z-[1] border-t border-[#0c0c0c]/10 bg-white/80 px-4 py-10 backdrop-blur-sm sm:px-8 lg:px-12">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.2em] text-[#8a93a0] uppercase">
              Floor
            </p>
            <h2 className="mt-1 font-[family-name:var(--font-instrument-serif)] text-[32px] tracking-tight text-[#0c0c0c]">
              Pick a drop
            </h2>
          </div>
          <p className="max-w-xs text-right text-[12px] leading-snug text-[#6b7280]">
            Each click can land a draft in your library — then publish or
            affiliate.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {MARKET_DROPS.map((item, i) => {
            const selected = i === active;
            const itemSpread = marketSpread(item);
            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => setActive(i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActive(i);
                  }
                }}
                className={cn(
                  "group relative cursor-pointer overflow-hidden text-left transition",
                  selected
                    ? "ring-2 ring-[#0c0c0c]"
                    : "ring-1 ring-[#0c0c0c]/10 hover:ring-[#0c0c0c]/30",
                )}
              >
                <div className="aspect-[4/3] overflow-hidden bg-[#e8ecf0]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.photo}
                    alt=""
                    className="size-full object-cover transition duration-500 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-semibold tracking-[0.14em] text-[#8a93a0] uppercase">
                        {heatLabel(item.heat)}
                      </p>
                      <p className="mt-1 text-[15px] font-medium text-[#0c0c0c]">
                        {item.title}
                      </p>
                    </div>
                    <p className="shrink-0 text-[15px] font-semibold tabular-nums text-[#e85d04]">
                      {money(itemSpread)}
                    </p>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-[12px] text-[#9ca3af] line-through tabular-nums">
                      {money(item.comps)}
                    </span>
                    <span className="text-[18px] font-semibold tabular-nums text-[#0c0c0c]">
                      {money(item.sell)}
                    </span>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      disabled={busy === item.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void claim(item.id);
                      }}
                      className="inline-flex h-9 flex-1 items-center justify-center bg-[#0c0c0c] text-[11px] font-semibold tracking-wide text-white uppercase disabled:opacity-50"
                    >
                      {busy === item.id ? "Adding…" : "Add to store"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
