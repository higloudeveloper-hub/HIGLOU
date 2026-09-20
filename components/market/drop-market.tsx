"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight, Search } from "lucide-react";
import { CategoryQuadCard } from "@/components/market/category-quad-card";
import { DealCarouselRow } from "@/components/market/deal-carousel-row";
import { AmazonPrice } from "@/components/market/amazon-price";
import { PlatformOpenLinks } from "@/components/opportunity/platform-open-links";
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
  const [drops, setDrops] = useState<MarketDropPublic[]>([]);
  const [note, setNote] = useState(
    "Market is empty until Find Winners verifies a winner.",
  );
  const [tagReady, setTagReady] = useState(false);
  const [ledgerCount, setLedgerCount] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
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
      setActiveId(local[0]?.id ?? null);
    } else {
      setDrops([]);
      setLedgerCount(0);
      setNote(emptyNote);
    }
    setRefreshing(true);

    const controller = new AbortController();
    const hardStop = window.setTimeout(() => controller.abort(), 4000);

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
          setActiveId(remote[0]?.id ?? null);
        } else if (!local.length) {
          setDrops([]);
          setLedgerCount(0);
          setNote(body.note || emptyNote);
        }
        setTagReady(Boolean(body.affiliateTagConfigured));
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

  const arb = useMemo(
    () => drops.filter((d) => d.lane === "arbitrage"),
    [drops],
  );
  const amazon = useMemo(
    () => drops.filter((d) => d.lane === "amazon"),
    [drops],
  );
  const retail = useMemo(
    () => drops.filter((d) => d.lane === "retail"),
    [drops],
  );
  const filtered = useMemo(() => {
    if (filter === "all") return drops;
    return drops.filter((d) => d.lane === filter);
  }, [drops, filter]);

  const drop =
    filtered.find((d) => d.id === activeId) ?? filtered[0] ?? null;

  const openKeep = useMemo(
    () =>
      drops.reduce((sum, d) => {
        if (d.lane === "amazon") return sum;
        return sum + Math.max(0, d.netProfit ?? marketSpread(d));
      }, 0),
    [drops],
  );

  const claim = useCallback(
    async (item: MarketDropPublic) => {
      setBusy(item.id);
      try {
        const res = await fetch("/api/market/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dropId: item.id,
            product: {
              asin: item.asin,
              title: item.title,
              brand: item.name,
              imageUrl: item.photo,
              amazonPrice:
                item.amazonPrice ??
                (item.lane === "amazon" ? item.sell : item.buy),
              buyBoxPrice:
                item.amazonPrice ??
                (item.lane === "amazon" ? item.sell : item.buy),
              ebayPrice:
                item.ebayPrice ?? (item.lane === "amazon" ? null : item.sell),
              ebayActiveLow:
                item.ebayPrice ?? (item.lane === "amazon" ? null : item.sell),
              cost: item.buy,
              buy: item.buy,
              sell: item.sell,
              comps: item.comps,
              blurb: item.blurb,
              supplier: item.supplier,
              ships: item.ships,
              heat: item.heat,
              lane: item.lane,
              netProfit: item.netProfit,
              hypotheticalKeep: item.netProfit,
              mode:
                item.lane === "amazon"
                  ? "amazon"
                  : item.lane === "retail"
                    ? "walmart_to_ebay"
                    : "amazon_to_ebay",
              keepa: true,
              amazonRetail: false,
              bsrDrops90: item.bsrDrops90,
              salesRank: item.salesRank,
              avgSalesRank90: item.salesRank,
              score: item.demandScore ?? item.score,
              verdict: "candidate",
              sourceMarket: "amazon",
            },
          }),
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

  const selectItem = (item: MarketDropPublic) => setActiveId(item.id);

  return (
    <div className="min-h-full bg-[#eaeded] text-[#0f1111]">
      {/* Compact marketplace top — brand first, Amazon density */}
      <header className="border-b border-[#d5d9d9] bg-[#232f3e] text-white">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold tracking-[0.14em] text-[#febd69] uppercase">
              Higlou Market
            </p>
            <h1 className="truncate text-[22px] font-bold leading-tight sm:text-[26px]">
              Today&apos;s verified deals
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-white/75">
            <span className="tabular-nums">
              {drops.length} on floor
              {openKeep > 0 ? ` · keep ${signed(openKeep)}` : ""}
              {refreshing ? " · syncing…" : ""}
            </span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">
              {tagReady ? "Affiliate ready" : "Set affiliate tag in Settings"}
            </span>
          </div>
          <Link
            href="/winners"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#febd69] px-3 text-[13px] font-semibold text-[#111]"
          >
            <Search className="size-3.5" />
            Find winners
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] space-y-4 px-3 py-4 sm:px-5 sm:py-5">
        {/* Filter chips */}
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", "Deals for you", drops.length],
              ["arbitrage", "Arbitrage keep", arb.length],
              ["amazon", "Sell on Amazon", amazon.length],
              ["retail", "Retail routes", retail.length],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={cn(
                "h-8 rounded-full px-3 text-[12px] font-semibold",
                filter === id
                  ? "bg-[#0f1111] text-white"
                  : "bg-white text-[#0f1111] ring-1 ring-[#d5d9d9] hover:bg-[#f7f8f8]",
              )}
            >
              {label}
              <span className="ml-1.5 opacity-60">{count}</span>
            </button>
          ))}
          {note ? (
            <span className="ml-auto hidden self-center text-[12px] text-[#565959] lg:inline">
              {note}
            </span>
          ) : null}
        </div>

        {drops.length === 0 ? (
          <div className="rounded-lg border border-[#d5d9d9] bg-white px-6 py-16 text-center shadow-sm">
            <p className="text-[22px] font-bold text-[#0f1111]">
              Floor is empty
            </p>
            <p className="mx-auto mt-2 max-w-md text-[14px] text-[#565959]">
              Find real opportunities first. Verified keep and Keepa demand
              stock this marketplace automatically.
            </p>
            <Link
              href="/winners"
              className="mt-6 inline-flex h-10 items-center gap-2 rounded-full bg-[#ffd814] px-5 text-[13px] font-semibold text-[#0f1111]"
            >
              <Search className="size-4" />
              Open Find Winners
            </Link>
          </div>
        ) : (
          <>
            {/* Amazon-style category cards row */}
            <div className="flex gap-4 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <CategoryQuadCard
                title="Deals for you"
                subtitle="Higlou-verified winners"
                items={drops}
                busyId={busy}
                selectedId={drop?.id ?? null}
                onSelect={selectItem}
                onClaim={(item) => void claim(item)}
                onOpenAll={() => setFilter("all")}
              />
              <CategoryQuadCard
                title="Arbitrage keep"
                subtitle="Amazon → eBay after fees"
                items={arb}
                busyId={busy}
                selectedId={drop?.id ?? null}
                onSelect={selectItem}
                onClaim={(item) => void claim(item)}
                onOpenAll={() => setFilter("arbitrage")}
              />
              <CategoryQuadCard
                title="Sell on Amazon"
                subtitle="Keepa demand lane"
                items={amazon}
                busyId={busy}
                selectedId={drop?.id ?? null}
                onSelect={selectItem}
                onClaim={(item) => void claim(item)}
                onOpenAll={() => setFilter("amazon")}
              />
              {retail.length > 0 ? (
                <CategoryQuadCard
                  title="Retail routes"
                  subtitle="Walmart & Home Depot"
                  items={retail}
                  busyId={busy}
                  selectedId={drop?.id ?? null}
                  onSelect={selectItem}
                  onClaim={(item) => void claim(item)}
                  onOpenAll={() => setFilter("retail")}
                />
              ) : null}
            </div>

            {/* Horizontal deal carousels */}
            {filter === "all" || filter === "arbitrage" ? (
              <DealCarouselRow
                title={"Keep deals you can't miss"}
                items={arb.length ? arb : drops.filter((d) => d.lane !== "amazon")}
                busyId={busy}
                selectedId={drop?.id ?? null}
                onSelect={selectItem}
                onClaim={(item) => void claim(item)}
                onOpenAll={() => setFilter("arbitrage")}
              />
            ) : null}

            {filter === "all" || filter === "amazon" ? (
              <DealCarouselRow
                title="Sell on Amazon · Keepa picks"
                items={amazon}
                busyId={busy}
                selectedId={drop?.id ?? null}
                onSelect={selectItem}
                onClaim={(item) => void claim(item)}
                onOpenAll={() => setFilter("amazon")}
              />
            ) : null}

            {filter === "retail" && retail.length ? (
              <DealCarouselRow
                title="Retail routes"
                items={retail}
                busyId={busy}
                selectedId={drop?.id ?? null}
                onSelect={selectItem}
                onClaim={(item) => void claim(item)}
              />
            ) : null}

            {/* Selected product detail — Amazon product strip */}
            {drop ? (
              <section className="grid gap-4 rounded-lg border border-[#d5d9d9] bg-white p-4 shadow-sm md:grid-cols-[200px_1fr_auto] md:items-center md:p-5">
                <div className="relative mx-auto aspect-square w-full max-w-[200px] overflow-hidden rounded-md bg-[#f7f8f8]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={drop.photo}
                    alt=""
                    className="size-full object-contain p-4"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold tracking-wide text-[#565959] uppercase">
                    {drop.name} · verified
                  </p>
                  <h2 className="mt-1 text-[20px] leading-snug font-bold text-[#0f1111] md:text-[22px]">
                    {drop.title}
                  </h2>
                  <div className="mt-3 flex flex-wrap items-baseline gap-2">
                    <AmazonPrice amount={drop.sell} size="lg" />
                    {drop.comps > drop.sell ? (
                      <span className="text-[14px] text-[#565959] line-through">
                        ${drop.comps.toFixed(2)}
                      </span>
                    ) : null}
                    {drop.lane !== "amazon" &&
                    (drop.netProfit ?? marketSpread(drop)) > 0 ? (
                      <span className="text-[14px] font-semibold text-[#067d62]">
                        You keep{" "}
                        {signed(drop.netProfit ?? marketSpread(drop))}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-[13px] text-[#565959]">
                    {drop.platformUrls?.amazon ? (
                      <a
                        href={drop.platformUrls.amazon}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#2162a1] hover:underline"
                      >
                        Amz{" "}
                        {drop.amazonPrice != null
                          ? `$${drop.amazonPrice.toFixed(2)}`
                          : "—"}
                      </a>
                    ) : (
                      <>
                        Amz{" "}
                        {drop.amazonPrice != null
                          ? `$${drop.amazonPrice.toFixed(2)}`
                          : "—"}
                      </>
                    )}
                    {" · "}
                    {drop.platformUrls?.ebay ? (
                      <a
                        href={drop.platformUrls.ebay}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#2162a1] hover:underline"
                      >
                        eBay{" "}
                        {drop.ebayPrice != null
                          ? `$${drop.ebayPrice.toFixed(2)}`
                          : "—"}
                      </a>
                    ) : (
                      <>
                        eBay{" "}
                        {drop.ebayPrice != null
                          ? `$${drop.ebayPrice.toFixed(2)}`
                          : "—"}
                      </>
                    )}
                    {" · "}
                    {drop.platformUrls?.walmart ? (
                      <a
                        href={drop.platformUrls.walmart}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#2162a1] hover:underline"
                      >
                        Walmart{" "}
                        {drop.walmartPrice != null
                          ? `$${drop.walmartPrice.toFixed(2)}`
                          : "—"}
                      </a>
                    ) : (
                      <>
                        Walmart{" "}
                        {drop.walmartPrice != null
                          ? `$${drop.walmartPrice.toFixed(2)}`
                          : "—"}
                      </>
                    )}
                    {" · "}
                    {drop.platformUrls?.homedepot ? (
                      <a
                        href={drop.platformUrls.homedepot}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#2162a1] hover:underline"
                      >
                        HD{" "}
                        {drop.homedepotPrice != null
                          ? `$${drop.homedepotPrice.toFixed(2)}`
                          : "—"}
                      </a>
                    ) : (
                      <>
                        HD{" "}
                        {drop.homedepotPrice != null
                          ? `$${drop.homedepotPrice.toFixed(2)}`
                          : "—"}
                      </>
                    )}
                  </p>
                  <PlatformOpenLinks
                    className="mt-3"
                    urls={drop.platformUrls}
                  />
                  {drop.asin ? (
                    <p className="mt-1 text-[12px] text-[#565959]">
                      ASIN {drop.asin}
                    </p>
                  ) : null}
                </div>
                <div className="flex w-full flex-col gap-2 md:w-[200px]">
                  <button
                    type="button"
                    disabled={busy === drop.id}
                    onClick={() => void claim(drop)}
                    className="inline-flex h-10 items-center justify-center rounded-full bg-[#ffd814] text-[14px] font-semibold text-[#0f1111] hover:bg-[#f7ca00] disabled:opacity-50"
                  >
                    {busy === drop.id ? "Adding…" : "Add to store"}
                  </button>
                  {drop.asin ? (
                    <button
                      type="button"
                      disabled={busy === `aff-${drop.id}`}
                      onClick={() => void earnLink(drop)}
                      className="inline-flex h-10 items-center justify-center rounded-full border border-[#d5d9d9] bg-white text-[13px] font-semibold hover:bg-[#f7f8f8] disabled:opacity-50"
                    >
                      Earn affiliate
                    </button>
                  ) : null}
                  <Link
                    href="/winners"
                    className="inline-flex h-9 items-center justify-center gap-1 text-[13px] font-semibold text-[#2162a1] hover:underline"
                  >
                    Find more winners
                    <ChevronRight className="size-4" />
                  </Link>
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
