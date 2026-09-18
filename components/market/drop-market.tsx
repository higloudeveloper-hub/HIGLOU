"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { ExternalLink, Loader2, Radio, Sparkles } from "lucide-react";
import {
  AmazonMark,
  EbayMark,
  FacebookFMark,
  HomeDepotMark,
  ShopifyMark,
  WalmartMark,
} from "@/components/brand/store-marks";
import type { MarketDropPublic } from "@/lib/market/from-opportunity";
import { marketPulseLabels, marketSpread } from "@/lib/market/catalog";
import { PriceDrop } from "@/components/market/price-drop";
import { MarketTile } from "@/components/market/market-tile";

const EASE = [0.22, 1, 0.36, 1] as const;

function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function DropMarketStudio() {
  const router = useRouter();
  const reduce = useReducedMotion() ?? false;
  const [drops, setDrops] = useState<MarketDropPublic[]>([]);
  const [note, setNote] = useState("Opening the floor…");
  const [tagReady, setTagReady] = useState(false);
  const [ledgerCount, setLedgerCount] = useState(0);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pulseIdx, setPulseIdx] = useState(0);
  const [scanned, setScanned] = useState(1280);
  const [autoRotate, setAutoRotate] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/market/feed");
        if (!res.ok) throw new Error("feed");
        const body = (await res.json()) as {
          drops?: MarketDropPublic[];
          note?: string;
          affiliateTagConfigured?: boolean;
          ledgerCount?: number;
          floorSize?: number;
        };
        if (cancelled) return;
        setDrops(body.drops || []);
        setNote(body.note || "");
        setTagReady(Boolean(body.affiliateTagConfigured));
        setLedgerCount(Number(body.ledgerCount) || 0);
        setActive(0);
        setScanned(1200 + (body.floorSize || 0) * 17);
      } catch {
        if (!cancelled) setNote("Could not load market feed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pulseLines = useMemo(
    () => marketPulseLabels(Date.now()),
    [drops.length],
  );

  useEffect(() => {
    if (reduce) return;
    const t = window.setInterval(() => {
      setPulseIdx((i) => (i + 1) % Math.max(pulseLines.length, 1));
      setScanned((n) => n + 3 + Math.floor(Math.random() * 9));
    }, 2800);
    return () => window.clearInterval(t);
  }, [pulseLines.length, reduce]);

  useEffect(() => {
    if (reduce || !autoRotate || drops.length < 2) return;
    const t = window.setInterval(() => {
      setActive((i) => (i + 1) % drops.length);
    }, 5200);
    return () => window.clearInterval(t);
  }, [autoRotate, drops.length, reduce]);

  const drop = drops[active] ?? null;
  const spread = drop ? marketSpread(drop) : 0;
  const openSpread = useMemo(
    () => drops.reduce((sum, d) => sum + (d.netProfit ?? marketSpread(d)), 0),
    [drops],
  );

  const claim = useCallback(
    async (id: string) => {
      setBusy(id);
      setAutoRotate(false);
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

  const earnLink = useCallback(async (item: MarketDropPublic) => {
    if (!item.asin) {
      toast.message("ASIN required for affiliate — run Find Winners");
      return;
    }
    setBusy(`aff-${item.id}`);
    setAutoRotate(false);
    try {
      if (item.affiliateUrl) {
        window.open(item.affiliateUrl, "_blank", "noopener,noreferrer");
      }
      const res = await fetch("/api/money/affiliate/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asin: item.asin,
          source: "market",
          campaignName: "Higlou Market",
          createSmartLink: true,
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        link?: { destinationUrl?: string };
        smartLink?: { path?: string };
        warnings?: string[];
      };
      if (!res.ok) {
        if (!item.affiliateUrl) {
          toast.error(body.error || "Affiliate failed — check Settings tag");
        }
        return;
      }
      toast.success("Affiliate link ready (commission unknown until reports)");
      body.warnings?.slice(0, 1).forEach((w) => toast.message(w));
      if (body.smartLink?.path) {
        await navigator.clipboard?.writeText(
          `${window.location.origin}${body.smartLink.path}`,
        );
        toast.message("Smart link copied");
      } else if (body.link?.destinationUrl) {
        await navigator.clipboard?.writeText(body.link.destinationUrl);
      }
    } catch {
      toast.error("Affiliate failed");
    } finally {
      setBusy(null);
    }
  }, []);

  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto bg-[#f5f5f5]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[70vh] opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 70% 45% at 15% 0%, #dce8ff 0%, transparent 55%), radial-gradient(ellipse 50% 35% at 90% 5%, #ffe8d2 0%, transparent 50%)",
        }}
      />

      <div className="relative z-[2] sticky top-0 flex items-center gap-3 border-b border-[#0c0c0c]/10 bg-[#0c0c0c] px-4 py-2.5 text-white sm:px-6">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#e85d04] opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-[#e85d04]" />
        </span>
        <Radio className="size-3.5 shrink-0 text-[#e85d04]" />
        <p className="min-w-0 flex-1 truncate text-[12px] font-medium tracking-wide">
          <AnimatePresence mode="wait">
            <motion.span
              key={pulseIdx}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.35 }}
              className="inline-block"
            >
              {pulseLines[pulseIdx % pulseLines.length]}
            </motion.span>
          </AnimatePresence>
        </p>
        <p className="hidden shrink-0 text-[11px] tabular-nums text-white/70 sm:block">
          Analyzed {scanned.toLocaleString()}
        </p>
        <p className="shrink-0 text-[11px] tabular-nums text-[#e85d04]">
          {drops.length} on floor
        </p>
      </div>

      {/* Compact hero — not full viewport so floor stays visible */}
      <section className="relative z-[1] grid gap-0 border-b border-[#e5e5e5] bg-white lg:grid-cols-[1fr_1.05fr]">
        <div className="flex flex-col justify-center px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
          <p className="text-[11px] font-semibold tracking-[0.28em] text-[#5a6472] uppercase">
            Higlou Market
          </p>
          <h1 className="mt-2 max-w-[12ch] font-[family-name:var(--font-instrument-serif)] text-[40px] leading-[0.95] tracking-tight text-[#0c0c0c] sm:text-[56px]">
            Always <span className="italic text-[#e85d04]">scanning</span>
          </h1>
          <p className="mt-3 max-w-md text-[14px] leading-relaxed text-[#4a5563]">
            {loading
              ? "Stocking the floor…"
              : note ||
                "Clean store tiles — one click into your shop, revenue floating on every drop."}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 opacity-90">
            <AmazonMark className="h-4" />
            <EbayMark className="h-3.5" />
            <WalmartMark className="h-3.5" />
            <HomeDepotMark className="h-4" />
            <ShopifyMark className="h-4" />
            <FacebookFMark className="h-4.5" />
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-[12px] text-[#5a6472]">
            <span>
              Open est.{" "}
              <strong className="tabular-nums text-[#0c0c0c]">
                {money(openSpread)}
              </strong>
            </span>
            <span>
              Ledger{" "}
              <strong className="tabular-nums text-[#0c0c0c]">
                {ledgerCount}
              </strong>
            </span>
            <span>{tagReady ? "Tag ready" : "Set tag in Settings"}</span>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!drop || busy === drop.id}
              onClick={() => drop && void claim(drop.id)}
              className="inline-flex h-11 items-center gap-2 bg-[#0c0c0c] px-5 text-[12px] font-semibold tracking-wide text-white uppercase disabled:opacity-50"
            >
              {busy === drop?.id ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Add to my store
            </button>
            {drop?.asin ? (
              <button
                type="button"
                disabled={busy === `aff-${drop.id}`}
                onClick={() => void earnLink(drop)}
                className="inline-flex h-11 items-center gap-2 border border-[#0c0c0c] bg-white px-4 text-[12px] font-semibold tracking-wide text-[#0c0c0c] uppercase disabled:opacity-50"
              >
                <ExternalLink className="size-4" />
                Earn link
              </button>
            ) : null}
            <Link
              href="/winners"
              className="text-[12px] font-semibold tracking-wide text-[#0c0c0c] underline-offset-4 hover:underline"
            >
              Feed with Find Winners →
            </Link>
          </div>
          {drop ? (
            <div className="mt-8 border-t border-[#eee] pt-5">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-[#8a93a0] uppercase">
                Spotlight ask → list
              </p>
              <PriceDrop
                key={drop.id}
                from={drop.comps}
                to={drop.sell}
                size="lg"
                className="mt-2"
              />
              <p className="mt-2 text-[13px] text-[#5a6472]">
                Est. keep{" "}
                <span className="font-semibold tabular-nums text-[#0c0c0c]">
                  {money(drop.netProfit ?? spread)}
                </span>
              </p>
            </div>
          ) : null}
        </div>

        <div className="relative min-h-[280px] bg-[#f7f7f7] lg:min-h-[420px]">
          <AnimatePresence mode="wait">
            {drop ? (
              <motion.div
                key={drop.id}
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduce ? undefined : { opacity: 0 }}
                transition={{ duration: 0.45, ease: EASE }}
                className="absolute inset-0 flex items-center justify-center p-8"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={drop.photo}
                  alt={drop.title}
                  className="max-h-full max-w-full object-contain drop-shadow-xl"
                />
              </motion.div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-[13px] text-[#6b7280]">
                {loading ? "Loading…" : "No drops"}
              </div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* Full scrollable store floor — eBay-clean tiles */}
      <section className="relative z-[1] bg-[#f5f5f5] px-3 py-8 sm:px-6 lg:px-10 lg:py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.2em] text-[#8a93a0] uppercase">
              Live floor
            </p>
            <h2 className="mt-1 font-[family-name:var(--font-instrument-serif)] text-[28px] tracking-tight text-[#0c0c0c] sm:text-[34px]">
              {drops.length} products calling
            </h2>
            <p className="mt-1 text-[13px] text-[#6b7280]">
              Clean store tiles · floating keep · list across Amazon, eBay &
              more
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAutoRotate((v) => !v)}
            className="text-[11px] font-semibold tracking-wide text-[#5a6472] uppercase underline-offset-2 hover:underline"
          >
            {autoRotate ? "Pause rotate" : "Resume rotate"}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {drops.map((item, i) => (
            <MarketTile
              key={item.id}
              item={item}
              index={i}
              selected={i === active}
              busy={busy === item.id || busy === `aff-${item.id}`}
              onSelect={() => {
                setActive(i);
                setAutoRotate(false);
              }}
              onClaim={() => void claim(item.id)}
              onEarn={item.asin ? () => void earnLink(item) : undefined}
            />
          ))}
        </div>

        {!loading && drops.length === 0 ? (
          <p className="py-16 text-center text-[14px] text-[#6b7280]">
            No drops on the floor yet.
          </p>
        ) : null}
      </section>
    </div>
  );
}
