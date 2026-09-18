"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { ExternalLink, Loader2, Radio, Sparkles } from "lucide-react";
import type { MarketDropPublic } from "@/lib/market/from-opportunity";
import { marketPulseLabels, marketSpread } from "@/lib/market/catalog";
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

function heatLabel(heat: MarketDropPublic["heat"]) {
  if (heat === "hot") return "Hot";
  if (heat === "warm") return "Moving";
  return "New";
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

  const pulseLines = useMemo(() => marketPulseLabels(Date.now()), [drops.length]);

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
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#f4f6f8]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.45]"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 80% 50% at 20% -10%, #d7e4ff 0%, transparent 55%), radial-gradient(ellipse 60% 40% at 90% 10%, #ffe8d6 0%, transparent 50%), linear-gradient(180deg, #f4f6f8 0%, #eef1f4 100%)",
        }}
      />

      {/* Live analysis strip */}
      <div className="relative z-[2] flex shrink-0 items-center gap-3 border-b border-[#0c0c0c]/10 bg-[#0c0c0c] px-4 py-2.5 text-white sm:px-6">
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

      <section className="relative z-[1] grid lg:min-h-[70svh] lg:grid-cols-[0.95fr_1.05fr]">
        <div className="relative flex flex-col justify-between px-5 pt-7 pb-8 sm:px-8 lg:px-12 lg:pt-10">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.28em] text-[#5a6472] uppercase">
              Higlou Market
            </p>
            <h1 className="mt-3 max-w-[11ch] font-[family-name:var(--font-instrument-serif)] text-[44px] leading-[0.94] tracking-tight text-[#0c0c0c] sm:text-[64px] lg:text-[76px]">
              Always{" "}
              <span className="italic text-[#e85d04]">scanning</span>
            </h1>
            <p className="mt-4 max-w-md text-[14px] leading-relaxed text-[#4a5563]">
              {loading
                ? "Stocking the floor…"
                : note ||
                  "A living marketplace of drops — claim to your store or earn with your Associate tag."}
            </p>
            <div className="mt-5 flex flex-wrap gap-4 text-[12px] text-[#5a6472]">
              <span>
                Open est. spread{" "}
                <strong className="tabular-nums text-[#0c0c0c]">
                  {money(openSpread)}
                </strong>
              </span>
              <span>
                Ledger ASINs{" "}
                <strong className="tabular-nums text-[#0c0c0c]">
                  {ledgerCount}
                </strong>
              </span>
              <span>
                {tagReady ? "Tag ready" : "Set tag in Settings"}
              </span>
            </div>
            <div className="mt-7 flex flex-wrap items-center gap-3">
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
          </div>

          {drop ? (
            <div className="mt-10 border-t border-[#0c0c0c]/10 pt-5">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-[#8a93a0] uppercase">
                Price compression
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
                <span className="text-[#8a93a0]"> · {drop.note}</span>
              </p>
            </div>
          ) : null}
        </div>

        <div className="relative min-h-[42vh] lg:min-h-0">
          <AnimatePresence mode="wait">
            {drop ? (
              <motion.div
                key={drop.id}
                initial={reduce ? false : { opacity: 0, scale: 1.03 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduce ? undefined : { opacity: 0 }}
                transition={{ duration: 0.5, ease: EASE }}
                className="absolute inset-0"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={drop.photo}
                  alt={drop.title}
                  className="size-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c0c]/60 via-transparent to-[#0c0c0c]/15" />
                <div className="absolute right-5 bottom-5 left-5 text-white sm:right-8 sm:bottom-8 sm:left-8">
                  <div className="flex flex-wrap gap-2">
                    <span className="bg-[#e85d04] px-2 py-0.5 text-[10px] font-bold tracking-[0.12em] uppercase">
                      {drop.real ? "Ledger" : heatLabel(drop.heat)}
                    </span>
                    {autoRotate ? (
                      <span className="bg-white/15 px-2 py-0.5 text-[10px] font-semibold tracking-[0.1em] uppercase backdrop-blur-sm">
                        Auto-rotating
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 font-[family-name:var(--font-instrument-serif)] text-[26px] leading-tight sm:text-[34px]">
                    {drop.title}
                  </p>
                  <p className="mt-1.5 max-w-lg text-[13px] text-white/80">
                    {drop.blurb}
                  </p>
                </div>
              </motion.div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-[#e8ecf0] text-[13px] text-[#6b7280]">
                {loading ? "Loading…" : "No drops"}
              </div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* Dense floor */}
      <section className="relative z-[1] border-t border-[#0c0c0c]/10 bg-white/90 px-3 py-8 backdrop-blur-sm sm:px-6 lg:px-10">
        <div className="mb-5 flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.2em] text-[#8a93a0] uppercase">
              Live floor
            </p>
            <h2 className="mt-1 font-[family-name:var(--font-instrument-serif)] text-[28px] tracking-tight text-[#0c0c0c]">
              {drops.length} products calling
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setAutoRotate((v) => !v)}
            className="text-[11px] font-semibold tracking-wide text-[#5a6472] uppercase underline-offset-2 hover:underline"
          >
            {autoRotate ? "Pause rotate" : "Resume rotate"}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {drops.map((item, i) => {
            const selected = i === active;
            const itemSpread = item.netProfit ?? marketSpread(item);
            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setActive(i);
                  setAutoRotate(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActive(i);
                    setAutoRotate(false);
                  }
                }}
                className={cn(
                  "group relative cursor-pointer overflow-hidden bg-white text-left transition",
                  selected
                    ? "ring-2 ring-[#0c0c0c]"
                    : "ring-1 ring-[#0c0c0c]/08 hover:ring-[#0c0c0c]/25",
                )}
              >
                <div className="relative aspect-square overflow-hidden bg-[#e8ecf0]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.photo}
                    alt=""
                    className="size-full object-cover transition duration-500 group-hover:scale-[1.04]"
                    loading="lazy"
                  />
                  <span className="absolute top-1.5 left-1.5 bg-[#0c0c0c]/75 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white uppercase backdrop-blur-sm">
                    {item.real ? "Win" : heatLabel(item.heat)}
                  </span>
                  <span className="absolute right-1.5 bottom-1.5 bg-[#e85d04] px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white">
                    {money(itemSpread)}
                  </span>
                </div>
                <div className="p-2.5">
                  <p className="line-clamp-2 text-[12px] font-medium leading-snug text-[#0c0c0c]">
                    {item.title}
                  </p>
                  <div className="mt-1.5 flex items-baseline gap-1.5">
                    <span className="text-[10px] text-[#9ca3af] line-through tabular-nums">
                      {money(item.comps)}
                    </span>
                    <span className="text-[13px] font-semibold tabular-nums text-[#0c0c0c]">
                      {money(item.sell)}
                    </span>
                  </div>
                  <div className="mt-2 flex gap-1">
                    <button
                      type="button"
                      disabled={busy === item.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void claim(item.id);
                      }}
                      className="h-7 flex-1 bg-[#0c0c0c] text-[9px] font-semibold tracking-wide text-white uppercase disabled:opacity-50"
                    >
                      {busy === item.id ? "…" : "Add"}
                    </button>
                    {item.asin ? (
                      <button
                        type="button"
                        disabled={busy === `aff-${item.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void earnLink(item);
                        }}
                        className="h-7 px-2 text-[9px] font-semibold tracking-wide text-[#0c0c0c] uppercase ring-1 ring-[#0c0c0c]/15 disabled:opacity-50"
                      >
                        Earn
                      </button>
                    ) : null}
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
