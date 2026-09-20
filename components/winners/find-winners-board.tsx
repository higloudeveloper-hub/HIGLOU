"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Loader2, Search, Store, ArrowRight, Sparkles } from "lucide-react";
import { AMAZON_WINNER_CATEGORIES, AMAZON_WINNER_LIMITS } from "@/lib/amazon/winner-categories";
import { amazonProductScore } from "@/lib/opportunity/amazon-product-winner";
import {
  loadLocalLedger,
  pushRemoteLedger,
  pullRemoteLedger,
  saveLocalLedger,
} from "@/lib/opportunity/ledger";
import { isRetailToMarketplaceMode } from "@/lib/opportunity/markets";
import {
  isPlatformWinner,
  platformKeep,
  platformWinnerMetric,
  sortPlatformWinners,
} from "@/lib/opportunity/platform-winner";
import type { OpportunityMode, OpportunityProduct } from "@/lib/opportunity/types";
import { WINNER_ROUTES, winnerRouteById } from "@/lib/opportunity/winner-routes";
import { stashOpportunityMoneySeed } from "@/lib/monetization/from-opportunity";
import { cn } from "@/lib/utils";

type SearchBody = {
  ok?: boolean;
  error?: string;
  products?: OpportunityProduct[];
  analyzed?: number;
  sources?: {
    keepa?: boolean;
    ebayLive?: boolean;
    amazonCatalog?: boolean;
    retailSearch?: boolean;
  };
};

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
      cost?: number | null;
    }>,
  ) => Promise<boolean | void>;
}) {
  const [mode, setMode] = useState<OpportunityMode>("amazon_to_ebay");
  const route = winnerRouteById(mode);
  const retail = isRetailToMarketplaceMode(mode);
  const demandLane = mode === "amazon";
  const [categoryId, setCategoryId] = useState("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(5);
  const [searching, setSearching] = useState(false);
  const [generalScanning, setGeneralScanning] = useState(false);
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
    if (demandLane) return sum + amazonProductScore(hit);
    return sum + Math.max(0, platformKeep(hit) ?? 0);
  }, 0);

  const applyFound = useCallback(
    (found: OpportunityProduct[], bodySources: SearchBody["sources"] | null) => {
      setSources(bodySources);
      const next = sortPlatformWinners(
        found.filter((hit) => isPlatformWinner(hit, mode)),
      );
      if (!next.length) {
        setError(
          "No real money opportunities this round. Scan again or try another route.",
        );
        return;
      }
      setHits((prev) => {
        const map = new Map(prev.map((hit) => [hitKey(hit), hit]));
        for (const hit of next) map.set(hitKey(hit), hit);
        return sortPlatformWinners(
          [...map.values()].filter((hit) => isPlatformWinner(hit, mode)),
        );
      });
      setPicked(next.map((hit) => hitKey(hit)));
      setError(null);
    },
    [mode],
  );

  /** General button: any real opportunities, quantity 1–5, Keepa + eBay. */
  const scanGeneral = useCallback(async () => {
    if (searching || generalScanning || busy || retail) return;
    setGeneralScanning(true);
    setError(null);
    const nextRound = round + 1;
    setRound(nextRound);
    try {
      const response = await fetch("/api/winners/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limit,
          mode,
          seed: nextRound - 1,
          excludeAsins: winners.map((hit) => hitKey(hit)).slice(0, 40),
        }),
      });
      const body = (await response.json().catch(() => null)) as SearchBody | null;
      if (!response.ok || !body) {
        setError(body?.error || "General scan failed.");
        return;
      }
      applyFound(body.products || [], body.sources || null);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setGeneralScanning(false);
    }
  }, [
    applyFound,
    busy,
    generalScanning,
    limit,
    mode,
    retail,
    round,
    searching,
    winners,
  ]);

  const find = useCallback(async () => {
    if (searching || generalScanning || busy) return;
    if (retail && categoryId === "all" && query.trim().length < 2) {
      setError("For Walmart / Home Depot, type a product or pick a category filter.");
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
          categoryId: categoryId || "all",
          limit,
          mode,
          onlySellable: false,
          seed: nextRound - 1,
          excludeAsins: winners.map((hit) => hitKey(hit)).slice(0, 40),
          keepaMode: retail ? "off" : "full",
          keepaPurpose: "manual",
        }),
      });
      const body = (await response.json().catch(() => null)) as SearchBody | null;
      if (!response.ok || !body) {
        setError(body?.error || "Search failed.");
        return;
      }
      applyFound(body.products || [], body.sources || null);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSearching(false);
    }
  }, [
    applyFound,
    busy,
    categoryId,
    generalScanning,
    limit,
    mode,
    query,
    retail,
    round,
    searching,
    winners,
  ]);

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
          amazonPrice: hit.amazonPrice ?? hit.buyBoxPrice,
          ebayPrice: hit.ebayActiveLow ?? hit.ebayActiveMedian ?? hit.ebayPrice,
          sourceId: hit.sourceId,
          sourceMarket: hit.sourceMarket,
          upc: hit.upc,
          cost: hit.cost,
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
  const scanning = searching || generalScanning;

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
              Real money routes: Amazon, eBay, Walmart, Home Depot. Only verified
              keep / Keepa demand stocks Market.
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

        <div className="mt-5 space-y-3">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-white/50 uppercase">
            Buy → Sell route
          </p>
          <div className="flex flex-wrap gap-2">
            {WINNER_ROUTES.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setMode(row.id)}
                className={cn(
                  "h-9 px-3 text-[12px] font-semibold",
                  mode === row.id
                    ? "bg-[#f4c928] text-[#141414]"
                    : "bg-white/10 text-white/80 hover:bg-white/15",
                )}
                title={row.hint}
              >
                {row.buy} → {row.sell}
              </button>
            ))}
          </div>
          <p className="text-[12px] text-white/55">
            {route.label} · {route.hint}
          </p>
        </div>

        {!retail ? (
          <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-white/10 pt-5">
            <label className="w-28">
              <span className="mb-1 block text-[11px] font-semibold tracking-wide text-white/50 uppercase">
                How many
              </span>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                disabled={locked || scanning}
                className="h-12 w-full border border-white/20 bg-white/10 px-3 text-[14px] text-white outline-none focus:border-[#f4c928]"
              >
                {AMAZON_WINNER_LIMITS.map((n) => (
                  <option key={n} value={n} className="text-[#141414]">
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={locked || scanning}
              onClick={() => void scanGeneral()}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 bg-[#f4c928] px-6 text-[14px] font-semibold text-[#141414] disabled:opacity-40 sm:flex-none sm:min-w-[240px]"
            >
              {generalScanning ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Finding {limit} real…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  Find {limit} real opportunities
                </>
              )}
            </button>
            <p className="w-full text-[12px] text-white/50 sm:w-auto sm:max-w-xs">
              Keepa Product Finder + eBay asks. No category needed.
            </p>
          </div>
        ) : null}
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
              Product {retail ? "(required for retail)" : "(optional)"}
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                retail
                  ? "cable organizer, drill bit, ASIN, UPC…"
                  : "cable organizer, ASIN, or Amazon link"
              }
              disabled={locked || scanning}
              className="h-12 w-full border border-[#d5d0c8] bg-[#fbfaf7] px-3 text-[15px] outline-none focus:border-[#141414]"
            />
          </label>
          <label className="w-full lg:w-56">
            <span className="mb-1 block text-[11px] font-semibold tracking-wide text-[#6b6560] uppercase">
              Filter (optional)
            </span>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={locked || scanning}
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
              disabled={locked || scanning}
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
            disabled={locked || scanning}
            className="inline-flex h-12 items-center justify-center gap-2 bg-[#141414] px-6 text-[14px] font-semibold text-white disabled:opacity-40"
          >
            {searching ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Scanning…
              </>
            ) : (
              <>
                <Search className="size-4" />
                Scan winners
              </>
            )}
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-[#6b6560]">
          <span>
            <strong className="text-[#141414]">{winners.length}</strong> verified
          </span>
          <span>
            {demandLane ? "Demand sum " : "Pipeline keep "}
            <strong className="text-[#141414]">
              {demandLane ? Math.round(totalKeep) : signed(totalKeep)}
            </strong>
          </span>
          {sources?.keepa ? <span className="text-[#1f7a4d]">Keepa</span> : null}
          {sources?.ebayLive ? <span className="text-[#1f7a4d]">eBay</span> : null}
          {sources?.retailSearch ? (
            <span className="text-[#1f7a4d]">Retail</span>
          ) : null}
          {sources?.amazonCatalog ? (
            <span className="text-[#1f7a4d]">Amazon</span>
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
              Tap <strong>Find real opportunities</strong> (limit 1–5) or pick a
              route and scan. We only keep real keep after fees (or Keepa
              demand). Import runs a full price check on every platform before
              Market.
            </p>
            {!retail ? (
              <button
                type="button"
                disabled={locked || scanning}
                onClick={() => void scanGeneral()}
                className="mt-5 inline-flex h-11 items-center gap-2 bg-[#141414] px-5 text-[13px] font-semibold text-white disabled:opacity-40"
              >
                {generalScanning ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Find {limit} real opportunities
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="mx-auto grid max-w-5xl gap-3">
            {winners.map((hit) => {
              const id = hitKey(hit);
              const metric = platformWinnerMetric(hit);
              const checked = picked.includes(id);
              const isDemand = metric.kind === "demand";
              const buy = hit.cost ?? hit.amazonPrice;
              const sell =
                hit.salePrice ??
                hit.ebayActiveLow ??
                hit.ebayActiveMedian ??
                hit.ebayPrice ??
                hit.buyBoxPrice;
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
                      {hit.brand || route.buy} · {route.buy} → {route.sell}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug">
                      {hit.title || id}
                    </p>
                    <p className="mt-1 text-[13px] text-[#6b6560]">
                      {isDemand
                        ? `${money(hit.buyBoxPrice ?? hit.amazonPrice)}${
                            hit.bsrDrops90 != null
                              ? ` · ${hit.bsrDrops90} drops/90d`
                              : ""
                          }`
                        : `Buy ${money(buy)} → Sell ${money(sell)}`}
                    </p>
                    <p className="mt-1 flex flex-wrap gap-2 text-[11px] text-[#8a847c]">
                      <span>{id}</span>
                      {hit.amazonPrice != null ? (
                        <span>Amz {money(hit.amazonPrice)}</span>
                      ) : null}
                      {hit.ebayActiveLow != null || hit.ebayPrice != null ? (
                        <span>
                          eBay{" "}
                          {money(hit.ebayActiveLow ?? hit.ebayPrice)}
                        </span>
                      ) : null}
                      {hit.cost != null && hit.sourceMarket !== "amazon" ? (
                        <span>
                          {hit.sourceMarket} {money(hit.cost)}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] font-semibold tracking-wide text-[#6b6560] uppercase">
                      {isDemand ? "Keepa demand" : "You keep"}
                    </p>
                    <p
                      className={cn(
                        "font-display text-2xl leading-none",
                        (isDemand ? metric.value >= 74 : metric.value >= 12)
                          ? "text-[#1f7a4d]"
                          : "text-[#141414]",
                      )}
                    >
                      {isDemand ? metric.value : signed(metric.value)}
                    </p>
                    <p className="mt-1 text-[11px] text-[#8a847c]">
                      Market ready
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
              ? `${selected.length} selected · import runs cross-platform price check first`
              : "Select winners to import"}
          </p>
          <button
            type="button"
            disabled={locked || !selected.length}
            onClick={() => void importSelected()}
            className="h-11 bg-[#f4c928] px-6 text-[14px] font-semibold text-[#141414] disabled:opacity-40"
          >
            {importing
              ? "Analyzing platforms…"
              : selected.length
                ? `Import ${selected.length}`
                : "Pick winners"}
          </button>
        </div>
      </div>
    </div>
  );
}
