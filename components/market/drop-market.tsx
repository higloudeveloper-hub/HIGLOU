"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion, useReducedMotion } from "motion/react";
import {
  ExternalLink,
  Loader2,
  Search,
  Sparkles,
  ArrowRight,
  Zap,
} from "lucide-react";
import {
  AmazonMark,
  EbayMark,
  HomeDepotMark,
  WalmartMark,
} from "@/components/brand/store-marks";
import { MarketTile } from "@/components/market/market-tile";
import { PriceDrop } from "@/components/market/price-drop";
import {
  mergeMarketFeed,
  type MarketDropPublic,
} from "@/lib/market/from-opportunity";
import { loadLocalLedger } from "@/lib/opportunity/ledger";
import { marketSpread } from "@/lib/market/catalog";
import { cn } from "@/lib/utils";

type LaneFilter = "all" | "arbitrage" | "amazon" | "retail";

function localVerifiedDrops(): MarketDropPublic[] {
  try {
    const arb = loadLocalLedger("amazon_to_ebay");
    const amz = loadLocalLedger("amazon");
    return mergeMarketFeed({
      ledgerHits: [...arb.hits, ...amz.hits],
      limit: 40,
    }).drops;
  } catch {
    return [];
  }
}

function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function signed(n: number) {
  const abs = money(Math.abs(n));
  return n >= 0 ? `+${abs}` : `−${abs}`;
}

export function DropMarketStudio() {
  const router = useRouter();
  const reduce = useReducedMotion() ?? false;
  const [drops, setDrops] = useState<MarketDropPublic[]>([]);
  const [note, setNote] = useState(
    "Market is empty until Find Winners verifies a winner.",
  );
  const [tagReady, setTagReady] = useState(false);
  const [ledgerCount, setLedgerCount] = useState(0);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<LaneFilter>("all");

  useEffect(() => {
    let alive = true;
    const emptyNote =
      "Market is empty until Find Winners verifies arbitrage keep or Keepa Amazon demand.";

    const local = localVerifiedDrops();
    if (local.length) {
      setDrops(local);
      setLedgerCount(local.length);
      setNote(
        `${local.length} Higlou-verified winner${local.length === 1 ? "" : "s"} from Find Winners`,
      );
    } else {
      setDrops([]);
      setLedgerCount(0);
      setNote(emptyNote);
    }
    setBootstrapped(true);
    setRefreshing(true);

    const controller = new AbortController();
    const hardStop = window.setTimeout(() => controller.abort(), 5000);

    void (async () => {
      try {
        const res = await fetch("/api/market/feed", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`feed ${res.status}`);
        const body = (await res.json()) as {
          drops?: MarketDropPublic[];
          note?: string;
          affiliateTagConfigured?: boolean;
          ledgerCount?: number;
        };
        if (!alive) return;
        const remote = body.drops || [];
        if (remote.length) {
          setDrops(remote);
          setLedgerCount(Number(body.ledgerCount) || remote.length);
          setNote(body.note || "");
        } else if (!local.length) {
          setDrops([]);
          setLedgerCount(0);
          setNote(body.note || emptyNote);
        }
        setTagReady(Boolean(body.affiliateTagConfigured));
        setActive(0);
      } catch {
        if (!alive) return;
        if (!local.length) {
          setDrops([]);
          setLedgerCount(0);
          setNote(emptyNote);
        }
      } finally {
        window.clearTimeout(hardStop);
        if (alive) setRefreshing(false);
      }
    })();

    return () => {
      alive = false;
      window.clearTimeout(hardStop);
      controller.abort();
    };
  }, []);

  const loading = !bootstrapped;

  const filtered = useMemo(() => {
    if (filter === "all") return drops;
    return drops.filter((d) => d.lane === filter);
  }, [drops, filter]);

  const drop = filtered[active] ?? filtered[0] ?? null;

  useEffect(() => {
    setActive(0);
  }, [filter]);

  const openKeep = useMemo(
    () =>
      drops.reduce((sum, d) => {
        if (d.lane === "amazon") return sum;
        return sum + Math.max(0, d.netProfit ?? marketSpread(d));
      }, 0),
    [drops],
  );
  const amazonCount = useMemo(
    () => drops.filter((d) => d.lane === "amazon").length,
    [drops],
  );
  const featured = drops[0] ?? null;
  const featuredKeep =
    featured && featured.lane !== "amazon"
      ? featured.netProfit ?? marketSpread(featured)
      : null;

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

  const earnLink = useCallback(async (item: MarketDropPublic) => {
    if (!item.asin) {
      toast.message("ASIN required — run Find Winners");
      return;
    }
    setBusy(`aff-${item.id}`);
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
      toast.success("Affiliate link ready");
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

  const filters: Array<{ id: LaneFilter; label: string; count: number }> = [
    { id: "all", label: "All deals", count: drops.length },
    {
      id: "arbitrage",
      label: "Arbitrage",
      count: drops.filter((d) => d.lane === "arbitrage").length,
    },
    {
      id: "amazon",
      label: "Sell on Amazon",
      count: amazonCount,
    },
    {
      id: "retail",
      label: "Retail routes",
      count: drops.filter((d) => d.lane === "retail").length,
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#f3f0ea] text-[#141414]">
      {/* Full-bleed marketplace hero */}
      <section className="relative shrink-0 overflow-hidden bg-[#141414] text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 70% 40%, rgba(244,201,40,0.22), transparent 55%), linear-gradient(115deg, #141414 0%, #1c1a16 45%, #0e0e0e 100%)",
          }}
        />
        {featured?.photo ? (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-[55%] opacity-25"
            initial={reduce ? false : { opacity: 0, x: 40 }}
            animate={{ opacity: 0.22, x: 0 }}
            transition={{ duration: 0.8 }}
          >
            <Image
              src={featured.photo}
              alt=""
              fill
              className="object-contain object-right p-8"
              unoptimized
              priority
            />
          </motion.div>
        ) : null}

        <div className="relative px-5 py-8 md:px-10 md:py-12">
          <p className="font-display text-[13px] tracking-[0.22em] text-[#f4c928] uppercase">
            Higlou Market
          </p>
          <div className="mt-3 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-xl">
              <h1 className="font-display text-4xl leading-[0.95] md:text-5xl lg:text-6xl">
                Today&apos;s verified deals
              </h1>
              <p className="mt-3 max-w-md text-[15px] leading-relaxed text-white/65">
                Live Keepa + eBay asks. See buy vs sell vs what you keep — then
                add winners to your store.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3 opacity-80">
                <AmazonMark className="h-3.5 brightness-0 invert" />
                <EbayMark className="h-3 brightness-0 invert" />
                <WalmartMark className="h-3 brightness-0 invert" />
                <HomeDepotMark className="h-3.5 brightness-0 invert" />
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              {featured && featuredKeep != null && featuredKeep > 0 ? (
                <motion.div
                  initial={reduce ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="min-w-[200px] border border-white/15 bg-white/5 px-4 py-3 backdrop-blur-sm"
                >
                  <p className="text-[10px] font-semibold tracking-[0.16em] text-[#f4c928] uppercase">
                    Featured keep
                  </p>
                  <p className="mt-1 font-display text-3xl leading-none text-[#f4c928]">
                    {signed(featuredKeep)}
                  </p>
                  <p className="mt-1 line-clamp-1 text-[12px] text-white/55">
                    Buy {money(featured.buy)} → Sell {money(featured.sell)}
                  </p>
                </motion.div>
              ) : null}
              <Link
                href="/winners"
                className="inline-flex h-12 items-center gap-2 bg-[#f4c928] px-5 text-[14px] font-semibold text-[#141414]"
              >
                <Search className="size-4" />
                Find more winners
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>

        {/* Promo ticker banner */}
        <div className="relative border-t border-white/10 bg-[#f4c928] text-[#141414]">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 text-[12px] font-semibold md:px-10">
            <span className="inline-flex items-center gap-2">
              <Zap className="size-3.5" />
              Platform-verified only · no fake catalog
            </span>
            <span className="tabular-nums">
              {drops.length} on floor · pipeline keep {signed(openKeep)} ·{" "}
              {amazonCount} Amazon lane
              {refreshing ? " · syncing…" : ""}
            </span>
            <span className="text-[#141414]/70">
              {tagReady ? "Affiliate ready" : "Set affiliate tag in Settings"}
            </span>
          </div>
        </div>
      </section>

      {/* Filters */}
      <div className="sticky top-0 z-10 shrink-0 border-b border-[#e4e0d8] bg-[#f3f0ea]/95 px-5 py-3 backdrop-blur-md md:px-10">
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setFilter(row.id)}
              className={cn(
                "h-9 px-3 text-[12px] font-semibold transition",
                filter === row.id
                  ? "bg-[#141414] text-white"
                  : "bg-white text-[#6b6560] ring-1 ring-[#e4e0d8] hover:text-[#141414]",
              )}
            >
              {row.label}
              <span className="ml-1.5 tabular-nums opacity-60">{row.count}</span>
            </button>
          ))}
          {!loading && note ? (
            <span className="ml-auto hidden text-[12px] text-[#8a847c] lg:inline">
              {note}
            </span>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex min-h-[360px] items-center justify-center gap-2 text-[14px] text-[#6b6560]">
            <Loader2 className="size-4 animate-spin" />
            Opening the floor…
          </div>
        ) : drops.length === 0 ? (
          <div className="mx-auto flex min-h-[480px] max-w-lg flex-col items-center justify-center px-6 text-center">
            <p className="font-display text-3xl text-[#141414]">
              Floor is empty
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-[#6b6560]">
              Find real opportunities first. Verified keep and Keepa demand
              stock this marketplace automatically.
            </p>
            <Link
              href="/winners"
              className="mt-7 inline-flex h-12 items-center gap-2 bg-[#141414] px-6 text-[14px] font-semibold text-white"
            >
              <Search className="size-4" />
              Open Find Winners
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="mx-auto flex min-h-[320px] max-w-md flex-col items-center justify-center px-6 text-center">
            <p className="font-display text-2xl">Nothing in this lane</p>
            <p className="mt-2 text-[14px] text-[#6b6560]">
              Try All deals or scan another route in Find Winners.
            </p>
            <button
              type="button"
              onClick={() => setFilter("all")}
              className="mt-5 h-10 bg-[#141414] px-4 text-[13px] font-semibold text-white"
            >
              Show all deals
            </button>
          </div>
        ) : (
          <div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[1fr_340px] lg:px-10 lg:py-8">
            {/* Product grid — Amazon-style marketplace */}
            <div>
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.16em] text-[#6b6560] uppercase">
                    Live floor
                  </p>
                  <p className="mt-1 font-display text-2xl leading-none">
                    {filtered.length} deal{filtered.length === 1 ? "" : "s"}
                  </p>
                </div>
                <p className="text-[12px] text-[#8a847c]">
                  Ledger {ledgerCount}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {filtered.map((item, i) => (
                  <MarketTile
                    key={item.id}
                    item={item}
                    index={i}
                    selected={drop?.id === item.id}
                    busy={busy === item.id || busy === `aff-${item.id}`}
                    onSelect={() => setActive(i)}
                    onClaim={() => void claim(item.id)}
                    onEarn={
                      item.asin ? () => void earnLink(item) : undefined
                    }
                  />
                ))}
              </div>
            </div>

            {/* Sticky product detail — comparative pricing */}
            {drop ? (
              <aside className="sticky top-[4.5rem] h-fit self-start">
                <motion.div
                  key={drop.id}
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="overflow-hidden border border-[#e4e0d8] bg-white"
                >
                  <div className="relative aspect-[4/3] bg-[#f3f0ea]">
                    {drop.photo ? (
                      <Image
                        src={drop.photo}
                        alt={drop.title}
                        fill
                        className="object-contain p-6"
                        unoptimized
                      />
                    ) : null}
                    <span className="absolute top-3 left-3 bg-[#f4c928] px-2 py-1 text-[10px] font-bold tracking-wide text-[#141414] uppercase">
                      {drop.lane === "amazon"
                        ? "Keepa Amazon"
                        : drop.lane === "retail"
                          ? "Retail"
                          : "Arbitrage"}
                    </span>
                  </div>

                  <div className="space-y-4 p-5">
                    <div>
                      <p className="text-[11px] font-semibold tracking-wide text-[#6b6560] uppercase">
                        {drop.name} · verified
                      </p>
                      <h2 className="mt-1 font-display text-[26px] leading-tight">
                        {drop.title}
                      </h2>
                      <p className="mt-2 text-[13px] leading-relaxed text-[#6b6560]">
                        {drop.blurb}
                      </p>
                    </div>

                    {drop.lane === "amazon" ? (
                      <div className="space-y-2 border-t border-[#efeae2] pt-4">
                        <p className="text-[11px] font-semibold tracking-wide text-[#6b6560] uppercase">
                          Amazon price
                        </p>
                        <p className="font-display text-4xl leading-none">
                          {money(drop.sell)}
                        </p>
                        <div className="flex flex-wrap gap-3 text-[13px] text-[#6b6560]">
                          <span>
                            Demand{" "}
                            <strong className="text-[#1f7a4d]">
                              {drop.demandScore ?? drop.score ?? "—"}
                            </strong>
                          </span>
                          {drop.salesRank != null ? (
                            <span>
                              BSR{" "}
                              <strong>
                                {drop.salesRank.toLocaleString("en-US")}
                              </strong>
                            </span>
                          ) : null}
                          {drop.bsrDrops90 != null ? (
                            <span>
                              <strong>{drop.bsrDrops90}</strong> drops/90d
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 border-t border-[#efeae2] pt-4">
                        <p className="text-[11px] font-semibold tracking-wide text-[#6b6560] uppercase">
                          Comparative prices
                        </p>
                        <PriceDrop
                          from={drop.comps}
                          to={drop.sell}
                          size="lg"
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <div className="border border-[#e4e0d8] px-2 py-2.5 text-center">
                            <p className="text-[10px] font-semibold tracking-wide text-[#8a847c] uppercase">
                              Buy
                            </p>
                            <p className="mt-1 text-[15px] font-semibold tabular-nums">
                              {money(drop.buy)}
                            </p>
                          </div>
                          <div className="border border-[#e4e0d8] px-2 py-2.5 text-center">
                            <p className="text-[10px] font-semibold tracking-wide text-[#8a847c] uppercase">
                              Sell
                            </p>
                            <p className="mt-1 text-[15px] font-semibold tabular-nums">
                              {money(drop.sell)}
                            </p>
                          </div>
                          <div className="bg-[#141414] px-2 py-2.5 text-center text-white">
                            <p className="text-[10px] font-semibold tracking-wide text-[#f4c928]/80 uppercase">
                              You keep
                            </p>
                            <p className="mt-1 text-[15px] font-semibold tabular-nums text-[#f4c928]">
                              {signed(
                                drop.netProfit ?? marketSpread(drop),
                              )}
                            </p>
                          </div>
                        </div>
                        <p className="text-[12px] text-[#6b6560]">
                          Spread{" "}
                          <strong className="text-[#141414]">
                            {money(drop.sell - drop.buy)}
                          </strong>{" "}
                          before fees · comps from{" "}
                          <span className="line-through">
                            {money(drop.comps)}
                          </span>
                        </p>
                      </div>
                    )}

                    {drop.asin ? (
                      <p className="text-[11px] text-[#8a847c]">
                        ASIN {drop.asin}
                      </p>
                    ) : null}

                    <div className="flex flex-col gap-2 pt-1">
                      <button
                        type="button"
                        disabled={busy === drop.id}
                        onClick={() => void claim(drop.id)}
                        className="inline-flex h-12 w-full items-center justify-center gap-2 bg-[#f4c928] text-[14px] font-semibold text-[#141414] disabled:opacity-50"
                      >
                        {busy === drop.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Sparkles className="size-4" />
                        )}
                        Add to my store
                      </button>
                      {drop.asin ? (
                        <button
                          type="button"
                          disabled={busy === `aff-${drop.id}`}
                          onClick={() => void earnLink(drop)}
                          className="inline-flex h-11 w-full items-center justify-center gap-2 border border-[#141414] bg-white text-[13px] font-semibold disabled:opacity-50"
                        >
                          <ExternalLink className="size-4" />
                          Earn affiliate link
                        </button>
                      ) : null}
                    </div>
                  </div>
                </motion.div>
              </aside>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
