"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { pickMarketDrop, marketSpread, type MarketDrop } from "@/lib/market/catalog";
import { PriceDrop } from "@/components/market/price-drop";

const STORAGE_KEY = "higlou_market_popup_v1";
const COOLDOWN_MS = 3 * 60 * 60 * 1000; // 3h between controlled pops
const SHOW_DELAY_MS = 4500;

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

/**
 * Controlled home popup — rate-limited so every visit can monetize
 * without nagging. One drop at a time; dismiss = cooldown.
 */
export function MarketDropPopup() {
  const router = useRouter();
  const reduce = useReducedMotion() ?? false;
  const [open, setOpen] = useState(false);
  const [drop, setDrop] = useState<MarketDrop | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const stored = readStored();
    if (stored && Date.now() - stored.dismissedAt < COOLDOWN_MS) return;

    const timer = window.setTimeout(() => {
      const next = pickMarketDrop(Date.now());
      if (stored?.lastDropId === next.id) {
        setDrop(pickMarketDrop(Date.now() + 17));
      } else {
        setDrop(next);
      }
      setOpen(true);
    }, SHOW_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, []);

  const dismiss = useCallback((dropId?: string) => {
    setOpen(false);
    writeStored({
      dismissedAt: Date.now(),
      lastDropId: dropId || drop?.id,
    });
  }, [drop?.id]);

  const claim = useCallback(async () => {
    if (!drop) return;
    setBusy(true);
    try {
      const res = await fetch("/api/market/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dropId: drop.id }),
      });
      const body = (await res.json()) as {
        error?: string;
        href?: string;
      };
      if (!res.ok) {
        toast.error(body.error || "Could not add drop");
        return;
      }
      toast.success("Drop added to your store");
      dismiss(drop.id);
      if (body.href) router.push(body.href);
    } catch {
      toast.error("Claim failed");
    } finally {
      setBusy(false);
    }
  }, [dismiss, drop, router]);

  if (!drop) return null;

  const spread = marketSpread(drop);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="Close offer"
            className="absolute inset-0 bg-[#0c0c0c]/45 backdrop-blur-[2px]"
            onClick={() => dismiss(drop.id)}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Market drop"
            initial={reduce ? false : { y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={reduce ? undefined : { y: 24, opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-[1] grid w-full max-w-[520px] overflow-hidden bg-white shadow-[0_24px_80px_rgba(12,12,12,0.28)] sm:grid-cols-[0.9fr_1.1fr]"
          >
            <div className="relative aspect-[4/5] sm:aspect-auto sm:min-h-[320px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={drop.photo}
                alt=""
                className="absolute inset-0 size-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c0c]/50 to-transparent" />
              <span className="absolute top-3 left-3 bg-[#e85d04] px-2 py-0.5 text-[10px] font-bold tracking-[0.12em] text-white uppercase">
                Drop
              </span>
            </div>
            <div className="relative flex flex-col p-5 sm:p-6">
              <button
                type="button"
                onClick={() => dismiss(drop.id)}
                className="absolute top-3 right-3 rounded-full p-1.5 text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#0c0c0c]"
                aria-label="Dismiss"
              >
                <X className="size-4" />
              </button>
              <p className="text-[10px] font-semibold tracking-[0.2em] text-[#8a93a0] uppercase">
                Higlou Market
              </p>
              <h2 className="mt-2 pr-8 font-[family-name:var(--font-instrument-serif)] text-[26px] leading-tight text-[#0c0c0c]">
                {drop.title}
              </h2>
              <p className="mt-2 text-[13px] leading-snug text-[#5a6472]">
                {drop.blurb}
              </p>
              <PriceDrop
                key={drop.id}
                from={drop.comps}
                to={drop.sell}
                size="sm"
                className="mt-4"
              />
              <p className="mt-2 text-[12px] text-[#6b7280]">
                Est. keep{" "}
                <span className="font-semibold tabular-nums text-[#0c0c0c]">
                  {money(spread)}
                </span>{" "}
                after cost
              </p>
              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void claim()}
                  className="h-11 bg-[#0c0c0c] text-[12px] font-semibold tracking-wide text-white uppercase disabled:opacity-50"
                >
                  {busy ? "Adding…" : "Add to my store — 1 click"}
                </button>
                <Link
                  href="/market"
                  onClick={() => dismiss(drop.id)}
                  className="flex h-10 items-center justify-center text-[12px] font-semibold tracking-wide text-[#0c0c0c] underline-offset-4 hover:underline"
                >
                  See all drops
                </Link>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
