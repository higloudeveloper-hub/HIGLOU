"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Sparkles, X, Zap } from "lucide-react";
import type { MarketDropPublic } from "@/lib/market/from-opportunity";
import { marketSpread } from "@/lib/market/catalog";
import { CREDIT_ACTIONS } from "@/lib/credits/costs";
import { usePaidActionOptional } from "@/components/credits/paid-action-provider";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "higlou_winners_popup_v2";
const COOLDOWN_MS = 2 * 60 * 60 * 1000;
const SHOW_DELAY_MS = 2800;
const EASE = [0.22, 1, 0.36, 1] as const;

function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

type Stored = { dismissedAt: number; lastDropId?: string };

function readStored(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Stored;
  } catch {
    return null;
  }
}

function writeStored(data: Stored) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

/** Wow winners popup — carousel of live Market products. */
export function MarketDropPopup() {
  const router = useRouter();
  const reduce = useReducedMotion() ?? false;
  const { confirmSpend, refresh } = usePaidActionOptional();
  const [open, setOpen] = useState(false);
  const [drops, setDrops] = useState<MarketDropPublic[]>([]);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const stored = readStored();
    if (stored && Date.now() - stored.dismissedAt < COOLDOWN_MS) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch("/api/market/feed");
          if (!res.ok || cancelled) return;
          const body = (await res.json()) as { drops?: MarketDropPublic[] };
          const list = (body.drops || []).filter((d) => d.photo);
          if (!list.length) return;
          const hot = list.filter((d) => d.heat === "hot" || d.real);
          const pool = (hot.length ? hot : list).slice(0, 6);
          if (cancelled || !pool.length) return;
          setDrops(pool);
          setIndex(0);
          setOpen(true);
        } catch {
          /* silent */
        }
      })();
    }, SHOW_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const drop = drops[index] || null;

  const dismiss = useCallback(() => {
    setOpen(false);
    writeStored({
      dismissedAt: Date.now(),
      lastDropId: drop?.id,
    });
  }, [drop?.id]);

  const claim = useCallback(async () => {
    if (!drop) return;
    const ok = await confirmSpend(
      "market_claim",
      "Meter este winner a tu tienda",
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch("/api/market/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dropId: drop.id,
          product: {
            asin: drop.asin,
            title: drop.title,
            brand: drop.name,
            imageUrl: drop.photo,
            amazonPrice: drop.lane === "amazon" ? drop.sell : drop.buy,
            buyBoxPrice: drop.lane === "amazon" ? drop.sell : drop.buy,
            ebayPrice: drop.lane === "amazon" ? null : drop.sell,
            ebayActiveLow: drop.lane === "amazon" ? null : drop.sell,
            cost: drop.buy,
            buy: drop.buy,
            sell: drop.sell,
            comps: drop.comps,
            blurb: drop.blurb,
            supplier: drop.supplier,
            ships: drop.ships,
            heat: drop.heat,
            lane: drop.lane,
            netProfit: drop.netProfit,
            hypotheticalKeep: drop.netProfit,
            mode:
              drop.lane === "amazon"
                ? "amazon"
                : drop.lane === "retail"
                  ? "walmart_to_ebay"
                  : "amazon_to_ebay",
            keepa: true,
            amazonRetail: false,
            bsrDrops90: drop.bsrDrops90,
            salesRank: drop.salesRank,
            avgSalesRank90: drop.salesRank,
            score: drop.demandScore ?? drop.score,
            verdict: "candidate",
            sourceMarket: "amazon",
          },
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        href?: string;
        code?: string;
        needed?: number;
        balance?: number;
      };
      if (!res.ok) {
        if (body.code === "insufficient") {
          toast.error(body.error || "Sin créditos", {
            action: {
              label: "Recargar",
              onClick: () => router.push("/credits"),
            },
          });
          return;
        }
        toast.error(body.error || "Could not add drop");
        return;
      }
      toast.success("Winner añadido a tu store");
      dismiss();
      if (body.href) router.push(body.href);
    } catch {
      toast.error("Claim failed");
    } finally {
      setBusy(false);
      void refresh();
    }
  }, [confirmSpend, dismiss, drop, refresh, router]);

  if (!drop) return null;
  const spread = drop.netProfit ?? marketSpread(drop);
  const claimCost = CREDIT_ACTIONS.market_claim.cost;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[80] flex items-end justify-center p-3 sm:items-center sm:p-6"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-[#0c0c0c]/55 backdrop-blur-[3px]"
            onClick={dismiss}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Winners popup"
            initial={reduce ? false : { y: 48, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={reduce ? undefined : { y: 28, opacity: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="relative z-[1] w-full max-w-[640px] overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#111] text-white shadow-[0_40px_120px_rgba(0,0,0,0.55)]"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(244,201,40,0.22),_transparent_45%)]"
            />

            <div className="relative flex items-center justify-between px-5 pt-4">
              <div className="inline-flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-full bg-[#f4c928] text-[#141414]">
                  <Sparkles className="size-3.5" />
                </span>
                <div>
                  <p className="text-[10px] font-bold tracking-[0.16em] text-[#f4c928] uppercase">
                    Live winners
                  </p>
                  <p className="text-[12px] text-white/55">
                    {index + 1} / {drops.length} · Market
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={dismiss}
                className="rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-white"
                aria-label="Dismiss"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="relative mt-3 grid sm:grid-cols-[1.05fr_1fr]">
              <div className="relative mx-5 aspect-[4/5] overflow-hidden rounded-[1.25rem] sm:mx-0 sm:ml-5 sm:aspect-auto sm:min-h-[340px]">
                <AnimatePresence mode="wait">
                  <motion.img
                    key={drop.id}
                    src={drop.photo}
                    alt=""
                    initial={reduce ? false : { opacity: 0, scale: 1.04 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35 }}
                    className="absolute inset-0 size-full object-cover"
                  />
                </AnimatePresence>
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                <span className="absolute top-3 left-3 rounded-full bg-[#e85d04] px-2.5 py-1 text-[10px] font-bold tracking-wide uppercase">
                  {drop.real ? "Verified" : "Hot"}
                </span>
                {drops.length > 1 ? (
                  <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
                    {drops.map((d, i) => (
                      <button
                        key={d.id}
                        type="button"
                        aria-label={`Winner ${i + 1}`}
                        onClick={() => setIndex(i)}
                        className={cn(
                          "h-1.5 rounded-full transition-all",
                          i === index ? "w-6 bg-[#f4c928]" : "w-2 bg-white/40",
                        )}
                      />
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="relative flex flex-col px-5 py-5 sm:pr-6 sm:pl-5">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={drop.id + "-copy"}
                    initial={reduce ? false : { opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.3 }}
                  >
                    <h2 className="font-display text-[28px] leading-[1.05] tracking-tight sm:text-[32px]">
                      {drop.title}
                    </h2>
                    <p className="mt-2 line-clamp-2 text-[13px] leading-snug text-white/60">
                      {drop.blurb}
                    </p>
                    <div className="mt-4 flex flex-wrap items-end gap-3">
                      <div>
                        <p className="text-[10px] font-bold tracking-[0.14em] text-white/40 uppercase">
                          Keep est.
                        </p>
                        <p className="font-display text-[36px] leading-none text-[#f4c928]">
                          {money(spread)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-white/70">
                        Buy {money(drop.buy)} → Sell {money(drop.sell)}
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>

                <div className="mt-auto flex flex-col gap-2 pt-6">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void claim()}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#f4c928] text-[13px] font-bold text-[#141414] disabled:opacity-50"
                  >
                    {busy ? "Adding…" : "Add to my store"}
                    <span className="inline-flex items-center gap-1 rounded-full bg-black/10 px-2 py-0.5 text-[10px]">
                      <Zap className="size-3" />
                      {claimCost}
                    </span>
                  </button>
                  <div className="flex gap-2">
                    {drops.length > 1 ? (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setIndex((i) => (i - 1 + drops.length) % drops.length)
                          }
                          className="inline-flex h-10 flex-1 items-center justify-center gap-1 rounded-full border border-white/15 text-[12px] font-semibold text-white/80 hover:bg-white/5"
                        >
                          <ChevronLeft className="size-4" />
                          Prev
                        </button>
                        <button
                          type="button"
                          onClick={() => setIndex((i) => (i + 1) % drops.length)}
                          className="inline-flex h-10 flex-1 items-center justify-center gap-1 rounded-full border border-white/15 text-[12px] font-semibold text-white/80 hover:bg-white/5"
                        >
                          Next
                          <ChevronRight className="size-4" />
                        </button>
                      </>
                    ) : null}
                    <Link
                      href="/market"
                      onClick={dismiss}
                      className="inline-flex h-10 flex-1 items-center justify-center rounded-full text-[12px] font-semibold text-[#f4c928] hover:underline"
                    >
                      Full Market
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
