"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Loader2, Search, Store, ArrowRight } from "lucide-react";
import { AMAZON_WINNER_CATEGORIES, AMAZON_WINNER_LIMITS } from "@/lib/amazon/winner-categories";
import { amazonProductScore } from "@/lib/opportunity/amazon-product-winner";
import {
  loadLocalLedger,
  pushRemoteLedger,
  pullRemoteLedger,
  saveLocalLedger,
} from "@/lib/opportunity/ledger";
import {
  isAmazonSellLane,
  isPlatformWinner,
  platformKeep,
  platformWinnerMetric,
  sortPlatformWinners,
} from "@/lib/opportunity/platform-winner";
import type { OpportunityMode, OpportunityProduct } from "@/lib/opportunity/types";
import { stashOpportunityMoneySeed } from "@/lib/monetization/from-opportunity";
import { cn } from "@/lib/utils";

type SearchBody = {
  ok?: boolean;
  error?: string;
  products?: OpportunityProduct[];
  analyzed?: number;
  sources?: { keepa?: boolean; ebayLive?: boolean; amazonCatalog?: boolean };
};

type WinnerLane = "arbitrage" | "amazon";

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function signed(n: number) {
  const abs = money(Math.abs(n));
  return n >= 0 ? `+${abs}` : `−${abs.replace("-", "")}`;
}

function hitKey(hit: OpportunityProduct) {
  return String(hit.asin || hit.sourceId || "").toUpperCase();
}

function modeForLane(lane: WinnerLane): OpportunityMode {
  return lane === "amazon" ? "amazon" : "amazon_to_ebay";
}

export function FindWinnersBoard({
  busy = false,
  onImport,
}: {
  busy?: boolean;
  onImport: (
    asins: string[],
    mode: OpportunityMode,
    cards?: Array<{
      asin: string;
      title: string;
      brand: string;
      imageUrl: string;
      amazonPrice: number | null;
      ebayPrice: number | null;
      sourceId?: string;
      sourceMarket?: string;
      upc?: string;
    }>,
  ) => Promise<boolean | void>;
}) {
  const [lane, setLane] = useState<WinnerLane>("arbitrage");
  const mode = modeForLane(lane);
  const amazonLane = lane === "amazon";
  const [categoryId, setCategoryId] = useState("home");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(5);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<OpportunityProduct[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [sources, setSources] = useState<SearchBody["sources"] | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [round, setRound] = useState(0);

  useEffect(() => {
    setHydrated(false);
    setPicked([]);
    setError(null);
    setSources(null);
    const local = loadLocalLedger(mode);
    const winners = sortPlatformWinners(
      local.hits.filter((hit) => isPlatformWinner(hit, mode)),
    );
    setHits(winners);
    setHydrated(true);
    void pullRemoteLedger(mode).then((remote) => {
      if (!remote?.hits?.length) return;
      const next = sortPlatformWinners(
        remote.hits.filter((hit) => isPlatformWinner(hit, mode)),
      );
      if (next.length) setHits(next);
    });
  }, [mode]);

  useEffect(() => {
    if (!hydrated) return;
    const ledger = {
      mode,
      hits,
      learn: [],
      analyzed: hits.length,
      updatedAt: Date.now(),
    };
    saveLocalLedger(ledger);
    const t = window.setTimeout(() => void pushRemoteLedger(ledger), 600);
    return () => window.clearTimeout(t);
  }, [hits, hydrated, mode]);

  const winners = useMemo(
    () => sortPlatformWinners(hits.filter((hit) => isPlatformWinner(hit, mode))),
    [hits, mode],
  );
  const selected = winners.filter((hit) => picked.includes(hitKey(hit)));
  const totalKeep = winners.reduce((sum, hit) => {
    if (amazonLane) return sum + amazonProductScore(hit);
    return sum + Math.max(0, platformKeep(hit) ?? 0);
  }, 0);

  const find = useCallback(async () => {
    if (searching || busy) return;
    if (!categoryId && query.trim().length < 2) {
      setError("Pick a category or type a product name.");
      return;
    }
    setSearching(true);
    setError(null);
    const nextRound = round + 1;
    setRound(nextRound);
    try {
      const response = await fetch("/api/amazon/auto-import/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          categoryId,
          limit,
          mode,
          onlySellable: false,
          seed: nextRound - 1,
          excludeAsins: winners.map((hit) => hitKey(hit)).slice(0, 40),
          keepaMode: "full",
          keepaPurpose: "manual",
        }),
      });
      const body = (await response.json().catch(() => null)) as SearchBody | null;
      if (!response.ok || !body) {
        setError(body?.error || "Search failed.");
        return;
      }
      setSources(body.sources || null);
      const found = sortPlatformWinners(
        (body.products || []).filter((hit) => isPlatformWinner(hit, mode)),
      );
      if (!found.length) {
        setError(
          amazonLane
            ? "No Keepa Amazon winners this round. Try another category — we need real BSR velocity and room to sell."
            : "No arbitrage winners this round. Try another category — we only keep real ask keep after fees.",
        );
        return;
      }
      setHits((prev) => {
        const map = new Map(prev.map((hit) => [hitKey(hit), hit]));
        for (const hit of found) map.set(hitKey(hit), hit);
        return sortPlatformWinners(
          [...map.values()].filter((hit) => isPlatformWinner(hit, mode)),
        );
      });
      setPicked(found.map((hit) => hitKey(hit)));
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSearching(false);
    }
  }, [amazonLane, busy, categoryId, limit, mode, query, round, searching, winners]);

  const importSelected = async () => {
    if (!selected.length || importing || busy) return;
    setImporting(true);
    setError(null);
    try {
      for (const hit of selected) stashOpportunityMoneySeed(hit);
      const ok = await onImport(
        selected.map((hit) => hitKey(hit)),
        mode,
        selected.map((hit) => ({
          asin: hit.asin,
          title: hit.title,
          brand: hit.brand,
          imageUrl: hit.imageUrl,
          amazonPrice: hit.amazonPrice,
          ebayPrice: hit.ebayActiveLow ?? hit.ebayActiveMedian ?? hit.ebayPrice,
          sourceId: hit.sourceId,
          sourceMarket: hit.sourceMarket,
          upc: hit.upc,
        })),
      );
      if (ok !== false) {
        const taken = new Set(selected.map((hit) => hitKey(hit)));
        setHits((prev) => prev.filter((hit) => !taken.has(hitKey(hit))));
        setPicked([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  };

  const locked = busy || importing;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#f6f4ef] text-[#141414]">
      <header className="shrink-0 border-b border-[#e4e0d8] bg-[#141414] px-5 py-5 text-white md:px-8">
        <p className="font-display text-[13px] tracking-[0.2em] text-[#f4c928] uppercase">
          Higlou
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl leading-none md:text-4xl">
              Find Winners
            </h1>
            <p className="mt-2 max-w-xl text-[14px] text-white/65">
              {amazonLane
                ? "Keepa demand — BSR velocity, sellers, ratings. Great products to sell on Amazon, verified by Higlou."
                : "Amazon cost vs eBay low ask after fees. Real keep stocks Market as arbitrage winners."}
            </p>
          </div>
          <Link
            href="/market"
            className="inline-flex h-10 items-center gap-2 bg-[#f4c928] px-4 text-[13px] font-semibold text-[#141414]"
          >
            <Store className="size-4" />
            Open Market
            <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setLane("arbitrage")}
            className={cn(
              "h-9 px-4 text-[13px] font-semibold",
              lane === "arbitrage"
                ? "bg-[#f4c928] text-[#141414]"
                : "bg-white/10 text-white/80 hover:bg-white/15",
            )}
          >
            Arbitrage · Amazon → eBay
          </button>
          <button
            type="button"
            onClick={() => setLane("amazon")}
            className={cn(
              "h-9 px-4 text-[13px] font-semibold",
              lane === "amazon"
                ? "bg-[#f4c928] text-[#141414]"
                : "bg-white/10 text-white/80 hover:bg-white/15",
            )}
          >
            Sell on Amazon · Keepa
          </button>
        </div>
      </header>

      <div className="shrink-0 border-b border-[#e4e0d8] bg-white px-5 py-4 md:px-8">
        <form
          className="flex flex-col gap-3 lg:flex-row lg:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void find();
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-[11px] font-semibold tracking-wide text-[#6b6560] uppercase">
              Product (optional)
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="cable organizer, ASIN, or Amazon link"
              disabled={locked || searching}
              className="h-12 w-full border border-[#d5d0c8] bg-[#fbfaf7] px-3 text-[15px] outline-none focus:border-[#141414]"
            />
          </label>
          <label className="w-full lg:w-56">
            <span className="mb-1 block text-[11px] font-semibold tracking-wide text-[#6b6560] uppercase">
              Category
            </span>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={locked || searching}
              className="h-12 w-full border border-[#d5d0c8] bg-[#fbfaf7] px-3 text-[14px] outline-none focus:border-[#141414]"
            >
              {AMAZON_WINNER_CATEGORIES.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label}
                </option>
              ))}
            </select>
          </label>
          <label className="w-full lg:w-28">
            <span className="mb-1 block text-[11px] font-semibold tracking-wide text-[#6b6560] uppercase">
              How many
            </span>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              disabled={locked || searching}
              className="h-12 w-full border border-[#d5d0c8] bg-[#fbfaf7] px-3 text-[14px] outline-none focus:border-[#141414]"
            >
              {AMAZON_WINNER_LIMITS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={locked || searching}
            className="inline-flex h-12 items-center justify-center gap-2 bg-[#141414] px-6 text-[14px] font-semibold text-white disabled:opacity-40"
          >
            {searching ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Finding…
              </>
            ) : (
              <>
                <Search className="size-4" />
                Find winners
              </>
            )}
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-[#6b6560]">
          <span>
            <strong className="text-[#141414]">{winners.length}</strong> verified
            on board
          </span>
          <span>
            {amazonLane ? "Demand sum " : "Pipeline keep "}
            <strong className="text-[#141414]">
              {amazonLane ? Math.round(totalKeep) : signed(totalKeep)}
            </strong>
          </span>
          {sources?.keepa ? <span className="text-[#1f7a4d]">Keepa on</span> : null}
          {sources?.ebayLive && !amazonLane ? (
            <span className="text-[#1f7a4d]">eBay asks on</span>
          ) : null}
          {error ? <span className="text-[#b42318]">{error}</span> : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-8">
        {winners.length === 0 ? (
          <div className="mx-auto flex min-h-[320px] max-w-lg flex-col items-center justify-center text-center">
            <p className="font-display text-2xl text-[#141414]">
              No verified winners yet
            </p>
            <p className="mt-2 text-[14px] leading-relaxed text-[#6b6560]">
              {amazonLane
                ? "Pick a category and hit Find. Keepa must show real BSR drops, healthy competition, and sellable price — those stock Market as Amazon winners."
                : "Pick a category and hit Find. We only keep products where Amazon cost clears eBay low-ask fees with real keep — those stock Market."}
            </p>
          </div>
        ) : (
          <ul className="mx-auto grid max-w-5xl gap-3">
            {winners.map((hit) => {
              const id = hitKey(hit);
              const metric = platformWinnerMetric(hit);
              const checked = picked.includes(id);
              const ebay = hit.ebayActiveLow ?? hit.ebayActiveMedian ?? hit.ebayPrice;
              const price = hit.buyBoxPrice ?? hit.amazonPrice;
              const rank = hit.avgSalesRank90 ?? hit.salesRank;
              const isAmz =
                amazonLane ||
                (isAmazonSellLane(hit.mode) && metric.kind === "demand");
              return (
                <li
                  key={id}
                  className={cn(
                    "flex gap-4 border bg-white p-3 transition",
                    checked ? "border-[#141414]" : "border-[#e4e0d8]",
                  )}
                >
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() =>
                      setPicked((prev) =>
                        prev.includes(id)
                          ? prev.filter((x) => x !== id)
                          : [...prev, id],
                      )
                    }
                    className="mt-1 size-5 shrink-0 border border-[#141414] bg-white"
                    aria-label="Select"
                  >
                    {checked ? (
                      <span className="block size-full bg-[#f4c928]" />
                    ) : null}
                  </button>
                  <div className="relative size-20 shrink-0 overflow-hidden bg-[#f0ebe3]">
                    {hit.imageUrl ? (
                      <Image
                        src={hit.imageUrl}
                        alt=""
                        fill
                        className="object-contain p-1"
                        unoptimized
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold tracking-wide text-[#6b6560] uppercase">
                      {hit.brand || "Amazon"}
                      {isAmz ? " · Sell on Amazon" : " · Arbitrage"}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug text-[#141414]">
                      {hit.title || id}
                    </p>
                    {isAmz ? (
                      <p className="mt-1 text-[13px] text-[#6b6560]">
                        {money(price)}
                        {rank != null ? ` · BSR ${rank.toLocaleString("en-US")}` : ""}
                        {hit.bsrDrops90 != null
                          ? ` · ${hit.bsrDrops90} drops/90d`
                          : ""}
                        {hit.sellerCount != null
                          ? ` · ${hit.sellerCount} sellers`
                          : ""}
                        {hit.rating != null
                          ? ` · ${hit.rating.toFixed(1)}★`
                          : ""}
                      </p>
                    ) : (
                      <p className="mt-1 text-[13px] text-[#6b6560]">
                        Buy {money(hit.amazonPrice)} → eBay low {money(ebay)}
                        {hit.ebayActiveCount != null
                          ? ` · ${hit.ebayActiveCount} asks`
                          : ""}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-[#8a847c]">{id}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] font-semibold tracking-wide text-[#6b6560] uppercase">
                      {isAmz ? "Keepa demand" : "You keep"}
                    </p>
                    <p
                      className={cn(
                        "font-display text-2xl leading-none",
                        (isAmz ? metric.value >= 74 : metric.value >= 12)
                          ? "text-[#1f7a4d]"
                          : "text-[#141414]",
                      )}
                    >
                      {isAmz ? metric.value : signed(metric.value)}
                    </p>
                    <p className="mt-1 text-[11px] text-[#8a847c]">
                      Score {hit.score}/100 · Market ready
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="sticky bottom-0 shrink-0 border-t border-[#e4e0d8] bg-white px-5 py-3 md:px-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-[#6b6560]">
            {selected.length
              ? amazonLane
                ? `${selected.length} selected · import Amazon draft, stocks Market`
                : `${selected.length} selected · import for eBay, stocks Market`
              : amazonLane
                ? "Select Keepa winners to import for Amazon"
                : "Select winners to import for eBay"}
          </p>
          <button
            type="button"
            disabled={locked || !selected.length}
            onClick={() => void importSelected()}
            className="h-11 bg-[#f4c928] px-6 text-[14px] font-semibold text-[#141414] disabled:opacity-40"
          >
            {importing
              ? "Importing…"
              : selected.length
                ? amazonLane
                  ? `Import ${selected.length} for Amazon`
                  : `Import ${selected.length} for eBay`
                : "Pick winners to import"}
          </button>
        </div>
      </div>
    </div>
  );
}
