"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Loader2,
  Search,
  Store,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  AMAZON_WINNER_CATEGORIES,
  AMAZON_WINNER_LIMITS,
} from "@/lib/amazon/winner-categories";
import { amazonProductScore } from "@/lib/opportunity/amazon-product-winner";
import {
  loadLocalLedger,
  pushRemoteLedger,
  pullRemoteLedger,
  saveLocalLedger,
} from "@/lib/opportunity/ledger";
import { isRetailToMarketplaceMode } from "@/lib/opportunity/markets";
import {
  buildOpportunityPriceBoard,
  type OpportunityPriceBoard,
} from "@/lib/opportunity/price-board";
import {
  isPlatformWinner,
  platformKeep,
  sortPlatformWinners,
} from "@/lib/opportunity/platform-winner";
import type { OpportunityMode, OpportunityProduct } from "@/lib/opportunity/types";
import { WINNER_ROUTES, winnerRouteById } from "@/lib/opportunity/winner-routes";
import { stashOpportunityMoneySeed } from "@/lib/monetization/from-opportunity";
import { PlatformOpenLinks } from "@/components/opportunity/platform-open-links";
import { buildPlatformUrls } from "@/lib/opportunity/platform-links";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";

type BoardHit = OpportunityProduct & {
  priceBoard?: OpportunityPriceBoard;
};

type SearchBody = {
  ok?: boolean;
  error?: string;
  products?: BoardHit[];
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

function boardFor(hit: BoardHit): OpportunityPriceBoard {
  return hit.priceBoard || buildOpportunityPriceBoard(hit);
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
  const [importingId, setImportingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<BoardHit[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [sources, setSources] = useState<SearchBody["sources"] | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [round, setRound] = useState(0);
  const [justFound, setJustFound] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHydrated(false);
    setPicked([]);
    setError(null);
    setSources(null);
    setJustFound(0);
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
    () =>
      sortPlatformWinners(
        hits.filter((hit) => isPlatformWinner(hit, mode)),
      ) as BoardHit[],
    [hits, mode],
  );
  const selected = winners.filter((hit) => picked.includes(hitKey(hit)));
  const totalKeep = winners.reduce((sum, hit) => {
    if (demandLane) return sum + amazonProductScore(hit);
    const board = boardFor(hit);
    return sum + Math.max(0, platformKeep(hit) ?? board.activeKeep ?? 0);
  }, 0);

  const applyFound = useCallback(
    (found: BoardHit[], bodySources: SearchBody["sources"] | null) => {
      setSources(bodySources);
      const next = sortPlatformWinners(
        found.filter((hit) => isPlatformWinner(hit, mode)),
      ) as BoardHit[];
      if (!next.length) {
        setError(
          "No real money opportunities this round. Scan again or try another route.",
        );
        setJustFound(0);
        return;
      }
      // Show this round's finds first so you can decide right away.
      setHits((prev) => {
        const foundKeys = new Set(next.map((hit) => hitKey(hit)));
        const rest = prev.filter((hit) => !foundKeys.has(hitKey(hit)));
        return sortPlatformWinners(
          [...next, ...rest].filter((hit) => isPlatformWinner(hit, mode)),
        ) as BoardHit[];
      });
      setPicked(next.map((hit) => hitKey(hit)));
      setJustFound(next.length);
      setError(null);
      window.setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    },
    [mode],
  );

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
      setError(
        "For Walmart / Home Depot, type a product or pick a category filter.",
      );
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

  const removeHit = (id: string) => {
    setHits((prev) => prev.filter((hit) => hitKey(hit) !== id));
    setPicked((prev) => prev.filter((x) => x !== id));
  };

  const importOne = async (hit: BoardHit) => {
    const id = hitKey(hit);
    if (importing || busy) return;
    setImporting(true);
    setImportingId(id);
    setError(null);
    try {
      stashOpportunityMoneySeed(hit);
      const ok = await onImport(
        [id],
        mode,
        [
          {
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
          },
        ],
      );
      if (ok !== false) removeHit(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
      setImportingId(null);
    }
  };

  const importSelected = async () => {
    if (!selected.length || importing || busy) return;
    setImporting(true);
    setImportingId(null);
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
        setJustFound(0);
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
    <div className="bg-[#f6f4ef] text-[#141414]">
      {/* Compact chrome — page scrolls as one unit */}
      <header className="border-b border-[#e4e0d8] bg-[#141414] px-4 py-4 text-white md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-[11px] tracking-[0.18em] text-[#f4c928] uppercase">
              Higlou
            </p>
            <h1 className="font-display text-2xl leading-none md:text-[28px]">
              Find Winners
            </h1>
            <p className="mt-1.5 max-w-md text-[13px] text-white/60">
              Principal search finds real keep across Amazon, eBay, Walmart &amp;
              Home Depot — losers stay out.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!retail ? (
              <>
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  disabled={locked || scanning}
                  aria-label="How many"
                  className="h-11 border border-white/20 bg-white/10 px-2 text-[13px] text-white outline-none"
                >
                  {AMAZON_WINNER_LIMITS.map((n) => (
                    <option key={n} value={n} className="text-[#141414]">
                      {n}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={locked || scanning}
                  onClick={() => void scanGeneral()}
                  className="inline-flex h-11 items-center gap-2 bg-[#f4c928] px-5 text-[14px] font-semibold text-[#141414] disabled:opacity-40"
                >
                  {generalScanning ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  Find {limit} real opportunities
                </button>
              </>
            ) : null}
            <Link
              href="/market"
              className="inline-flex h-11 items-center gap-1.5 border border-white/20 px-3 text-[13px] font-semibold text-white hover:bg-white/10"
            >
              <Store className="size-3.5" />
              Market
            </Link>
          </div>
        </div>

        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5">
          {WINNER_ROUTES.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setMode(row.id)}
              className={cn(
                "h-8 shrink-0 px-2.5 text-[11px] font-semibold whitespace-nowrap",
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
      </header>

      <div className="sticky top-0 z-10 border-b border-[#e4e0d8] bg-white px-4 py-2.5 md:px-6">
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
          onSubmit={(e) => {
            e.preventDefault();
            void find();
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              retail
                ? "Product, ASIN, UPC…"
                : "Product, ASIN, or Amazon link (optional)"
            }
            disabled={locked || scanning}
            className="h-10 min-w-0 flex-1 border border-[#d5d0c8] bg-[#fbfaf7] px-3 text-[14px] outline-none focus:border-[#141414]"
          />
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            disabled={locked || scanning}
            className="h-10 w-full border border-[#d5d0c8] bg-[#fbfaf7] px-2 text-[13px] outline-none sm:w-44"
          >
            {AMAZON_WINNER_CATEGORIES.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </select>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            disabled={locked || scanning}
            className="h-10 w-full border border-[#d5d0c8] bg-[#fbfaf7] px-2 text-[13px] outline-none sm:w-20"
          >
            {AMAZON_WINNER_LIMITS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={locked || scanning}
            className="inline-flex h-10 items-center justify-center gap-1.5 bg-[#141414] px-4 text-[13px] font-semibold text-white disabled:opacity-40"
          >
            {searching ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Search className="size-3.5" />
            )}
            Scan
          </button>
        </form>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[#6b6560]">
          <span>
            <strong className="text-[#141414]">{winners.length}</strong> verified
          </span>
          {justFound > 0 ? (
            <span className="font-semibold text-[#1f7a4d]">
              {justFound} new — scroll to decide
            </span>
          ) : null}
          <span>
            {demandLane ? "Demand " : "Keep "}
            <strong className="text-[#141414]">
              {demandLane ? Math.round(totalKeep) : signed(totalKeep)}
            </strong>
          </span>
          {sources?.keepa ? <span className="text-[#1f7a4d]">Keepa</span> : null}
          {sources?.ebayLive ? <span className="text-[#1f7a4d]">eBay</span> : null}
          {sources?.retailSearch ? (
            <span className="text-[#1f7a4d]">Retail</span>
          ) : null}
          {error ? <span className="text-[#b42318]">{error}</span> : null}
        </div>
      </div>

      <div ref={resultsRef} className="px-4 py-4 pb-24 md:px-6">
        {winners.length === 0 ? (
          <div className="mx-auto flex min-h-[220px] max-w-lg flex-col items-center justify-center py-10 text-center">
            <p className="font-display text-2xl text-[#141414]">
              No verified winners yet
            </p>
            <p className="mt-2 text-[14px] leading-relaxed text-[#6b6560]">
              Tap <strong>Find {limit} real opportunities</strong>. Each result
              shows Amazon / eBay / Walmart / Home Depot prices and your profit
              so you can decide right here.
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
          <ul className="mx-auto grid max-w-5xl gap-4">
            {winners.map((hit, index) => {
              const id = hitKey(hit);
              const board = boardFor(hit);
              // Prefer live board keep — never flash a stored money-losing hypo.
              const keep = board.activeKeep ?? platformKeep(hit) ?? null;
              const showDemand =
                (demandLane || keep == null) &&
                (board.demandScore != null && board.demandScore >= 50);
              const checked = picked.includes(id);
              const isNew = justFound > 0 && index < justFound;
              const profitRoutes = board.routes.filter((r) => r.keep >= 12);

              return (
                <li
                  key={id}
                  className={cn(
                    "border bg-white p-4 transition",
                    checked ? "border-[#141414]" : "border-[#e4e0d8]",
                    isNew && "ring-2 ring-[#f4c928]/40",
                  )}
                >
                  <div className="flex flex-col gap-4 sm:flex-row">
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
                      className="mt-1 size-5 shrink-0 self-start border border-[#141414] bg-white"
                      aria-label="Select"
                    >
                      {checked ? (
                        <span className="block size-full bg-[#f4c928]" />
                      ) : null}
                    </button>

                    <div className="relative size-24 shrink-0 overflow-hidden bg-[#f0ebe3] sm:size-28">
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

                    <div className="min-w-0 flex-1 space-y-3">
                      <div>
                        <p className="truncate text-[11px] font-semibold tracking-wide text-[#6b6560] uppercase">
                          {isNew ? "New · " : ""}
                          {hit.brand || route.buy} · {route.buy} → {route.sell}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-[16px] font-semibold leading-snug">
                          {hit.title || id}
                        </p>
                        <p className="mt-1 text-[12px] text-[#8a847c]">
                          {id}
                          {hit.bsrDrops90 != null
                            ? ` · ${hit.bsrDrops90} BSR drops / 90d`
                            : ""}
                          {hit.keepa ? " · Keepa" : ""}
                        </p>
                      </div>

                      {/* Platform prices */}
                      <div>
                        <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-[#6b6560] uppercase">
                          Prices found
                        </p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {board.platforms.map((p) => {
                            const href =
                              p.url ||
                              buildPlatformUrls(hit)[p.platform] ||
                              null;
                            const inner = (
                              <>
                                <p className="text-[10px] font-semibold tracking-wide text-[#6b6560] uppercase">
                                  {p.label}
                                  {p.role === "buy"
                                    ? " · buy"
                                    : p.role === "sell"
                                      ? " · sell"
                                      : ""}
                                </p>
                                <p className="mt-0.5 font-display text-lg leading-none">
                                  {money(p.price)}
                                </p>
                                {p.note ? (
                                  <p className="mt-1 text-[10px] text-[#8a847c]">
                                    {p.note}
                                  </p>
                                ) : null}
                                {href ? (
                                  <p className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-[#2162a1]">
                                    Open
                                    <ExternalLink className="size-2.5" />
                                  </p>
                                ) : null}
                              </>
                            );
                            return href ? (
                              <a
                                key={p.platform}
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cn(
                                  "border px-2.5 py-2 transition hover:ring-1 hover:ring-[#141414]",
                                  p.price != null
                                    ? p.role === "buy"
                                      ? "border-[#141414] bg-[#fbfaf7]"
                                      : p.role === "sell"
                                        ? "border-[#1f7a4d]/40 bg-[#f3faf6]"
                                        : "border-[#e4e0d8] bg-white"
                                    : "border-[#e4e0d8]/80 bg-[#faf9f6]",
                                )}
                              >
                                {inner}
                              </a>
                            ) : (
                              <div
                                key={p.platform}
                                className={cn(
                                  "border px-2.5 py-2",
                                  p.price != null
                                    ? p.role === "buy"
                                      ? "border-[#141414] bg-[#fbfaf7]"
                                      : p.role === "sell"
                                        ? "border-[#1f7a4d]/40 bg-[#f3faf6]"
                                        : "border-[#e4e0d8] bg-white"
                                    : "border-[#e4e0d8]/80 bg-[#faf9f6] opacity-60",
                                )}
                              >
                                {inner}
                              </div>
                            );
                          })}
                        </div>
                        <PlatformOpenLinks
                          className="mt-2"
                          size="sm"
                          urls={hit.platformUrls || buildPlatformUrls(hit)}
                        />
                      </div>

                      {/* Profit for this route + alternatives */}
                      <div className="flex flex-col gap-3 border-t border-[#e4e0d8] pt-3 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <p className="text-[11px] font-semibold tracking-wide text-[#6b6560] uppercase">
                            Your profit · {route.label}
                          </p>
                          {showDemand && (keep == null || keep < 12) ? (
                            <p className="mt-1 font-display text-3xl leading-none text-[#141414]">
                              Demand {board.demandScore ?? amazonProductScore(hit)}
                            </p>
                          ) : (
                            <p
                              className={cn(
                                "mt-1 font-display text-3xl leading-none",
                                (keep ?? 0) >= 12
                                  ? "text-[#1f7a4d]"
                                  : "text-[#b42318]",
                              )}
                            >
                              {keep != null ? signed(keep) : "—"}
                            </p>
                          )}
                          <p className="mt-1 text-[13px] text-[#6b6560]">
                            Buy {money(board.activeBuy)} → Sell{" "}
                            {money(board.activeSell)}
                            {board.activeKeep != null
                              ? ` · net after fees/ship ${signed(board.activeKeep)}`
                              : hit.ebayFees != null || hit.amazonFees != null
                                ? ` · fees ~${money(hit.ebayFees ?? hit.amazonFees)}`
                                : ""}
                          </p>
                          {profitRoutes.length > 1 ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {profitRoutes.slice(0, 3).map((r) => (
                                <span
                                  key={r.mode}
                                  className={cn(
                                    "border px-2 py-0.5 text-[11px]",
                                    r.active
                                      ? "border-[#141414] bg-[#f4c928]/30 font-semibold"
                                      : "border-[#e4e0d8] text-[#6b6560]",
                                  )}
                                >
                                  {r.label} {signed(r.keep)}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={locked}
                            onClick={() => removeHit(id)}
                            className="inline-flex h-10 items-center gap-1.5 border border-[#d5d0c8] px-3 text-[13px] font-semibold text-[#6b6560] hover:border-[#141414] hover:text-[#141414] disabled:opacity-40"
                          >
                            <Trash2 className="size-3.5" />
                            Skip
                          </button>
                          <button
                            type="button"
                            disabled={locked}
                            onClick={() => void importOne(hit)}
                            className="inline-flex h-10 items-center gap-1.5 bg-[#f4c928] px-4 text-[13px] font-semibold text-[#141414] disabled:opacity-40"
                          >
                            {importingId === id ? (
                              <>
                                <Loader2 className="size-3.5 animate-spin" />
                                Importing…
                              </>
                            ) : (
                              "Import this"
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="sticky bottom-0 z-10 border-t border-[#e4e0d8] bg-white/95 px-4 py-2.5 backdrop-blur-md md:px-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-[#6b6560]">
            {selected.length
              ? `${selected.length} selected · import runs full platform check`
              : "Import one card or select several"}
          </p>
          <button
            type="button"
            disabled={locked || !selected.length}
            onClick={() => void importSelected()}
            className="h-10 bg-[#f4c928] px-5 text-[13px] font-semibold text-[#141414] disabled:opacity-40"
          >
            {importing && !importingId
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
