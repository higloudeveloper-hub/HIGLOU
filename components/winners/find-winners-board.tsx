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
import { WINNER_PLAYS, playForMode, routesForPlay, winnerRouteById } from "@/lib/opportunity/winner-routes";
import { stashOpportunityMoneySeed } from "@/lib/monetization/from-opportunity";
import { PlatformOpenLinks } from "@/components/opportunity/platform-open-links";
import { CheapSourcePanel } from "@/components/winners/cheap-source-panel";
import { buildPlatformUrls } from "@/lib/opportunity/platform-links";
import { cn } from "@/lib/utils";
import { ArrowRight, ExternalLink } from "lucide-react";

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
  const play = playForMode(mode);
  const playRoutes = routesForPlay(play);
  const activePlay = WINNER_PLAYS.find((p) => p.id === play)!;

  const setPlay = (nextPlay: (typeof WINNER_PLAYS)[number]["id"]) => {
    if (nextPlay === play) return;
    const def = WINNER_PLAYS.find((p) => p.id === nextPlay)!;
    setMode(def.defaultMode);
  };

  return (
    <div className="bg-[#f3f1ec] text-[#141414]">
      {/* Hero chrome */}
      <header className="relative overflow-hidden border-b border-[#e4e0d8] bg-[#0e0e0e] px-4 py-5 text-white md:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 10% -10%, #f4c928 0%, transparent 55%), radial-gradient(ellipse 50% 40% at 90% 0%, #2a5a3a 0%, transparent 50%)",
          }}
        />
        <div className="relative mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="font-display text-[11px] tracking-[0.22em] text-[#f4c928] uppercase">
              Higlou · Money finder
            </p>
            <h1 className="mt-1 font-display text-[32px] leading-none tracking-tight md:text-[40px]">
              Find Winners
            </h1>
            <p className="mt-2 max-w-lg text-[14px] leading-snug text-white/55">
              Elige la jugada. Escanea. Ves oportunidades reales — arbitraje o
              listar directo en Amazon.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!retail ? (
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
                Ver {limit} oportunidades
              </button>
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

        {/* Two plays — not seven equal tabs */}
        <div className="relative mx-auto mt-5 grid max-w-5xl gap-2 sm:grid-cols-2">
          {WINNER_PLAYS.map((p) => {
            const on = p.id === play;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlay(p.id)}
                className={cn(
                  "group relative overflow-hidden border px-4 py-3.5 text-left transition",
                  on
                    ? "border-[#f4c928] bg-[#f4c928]/12"
                    : "border-white/15 bg-white/[0.04] hover:border-white/30 hover:bg-white/[0.07]",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={cn(
                      "text-[11px] font-semibold tracking-[0.16em] uppercase",
                      on ? "text-[#f4c928]" : "text-white/45",
                    )}
                  >
                    {p.id === "arbitrage" ? "Jugada 1" : "Jugada 2"}
                  </p>
                  {on ? (
                    <span className="bg-[#f4c928] px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-[#141414] uppercase">
                      Activa
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 font-display text-[22px] leading-none tracking-tight">
                  {p.title}
                </p>
                <p className="mt-1.5 text-[12px] leading-snug text-white/55">
                  {p.subtitle}
                </p>
              </button>
            );
          })}
        </div>

        {/* Route within play — secondary, not competing */}
        {playRoutes.length > 1 ? (
          <div className="relative mx-auto mt-3 max-w-5xl">
            <p className="mb-1.5 text-[10px] font-semibold tracking-[0.14em] text-white/40 uppercase">
              Ruta · {activePlay.title}
            </p>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {playRoutes.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setMode(row.id)}
                  title={row.hint}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-[11px] font-semibold whitespace-nowrap",
                    mode === row.id
                      ? "bg-white text-[#141414]"
                      : "bg-white/10 text-white/70 hover:bg-white/15",
                  )}
                >
                  {row.buy}
                  <ArrowRight className="size-3 opacity-50" />
                  {row.sell}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="relative mx-auto mt-3 max-w-5xl text-[12px] text-white/45">
            {route.hint}
          </p>
        )}
      </header>

      <div className="sticky top-0 z-10 border-b border-[#e4e0d8] bg-white/95 px-4 py-2.5 backdrop-blur-md md:px-8">
        <form
          className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center"
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
                ? "Producto, ASIN, UPC…"
                : "Producto, ASIN o link Amazon (opcional)"
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
            aria-label="Cuántas"
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
            Escanear
          </button>
        </form>
        <div className="mx-auto mt-2 flex max-w-5xl flex-wrap gap-x-3 gap-y-1 text-[12px] text-[#6b6560]">
          <span className="font-semibold text-[#141414]">
            {play === "arbitrage" ? "Arbitraje" : "Amazon directo"}
          </span>
          <span>
            <strong className="text-[#141414]">{winners.length}</strong>{" "}
            verificadas
          </span>
          {justFound > 0 ? (
            <span className="font-semibold text-[#1f7a4d]">
              {justFound} nuevas — decide abajo
            </span>
          ) : null}
          <span>
            {demandLane ? "Demanda total " : "Keep total "}
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

      <div ref={resultsRef} className="px-4 py-5 pb-24 md:px-8">
        {winners.length === 0 ? (
          <div className="mx-auto flex min-h-[260px] max-w-lg flex-col items-center justify-center py-12 text-center">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-[#8a847c] uppercase">
              {activePlay.title}
            </p>
            <p className="mt-2 font-display text-[28px] leading-none text-[#141414]">
              Sin oportunidades aún
            </p>
            <p className="mt-3 text-[14px] leading-relaxed text-[#6b6560]">
              {play === "arbitrage"
                ? "Escanea para ver spreads reales: compras en un market, vendes en otro, keep neto después de fees."
                : "Escanea demanda Keepa para listar directo en Amazon — BSR, velocity y score."}
            </p>
            {!retail ? (
              <button
                type="button"
                disabled={locked || scanning}
                onClick={() => void scanGeneral()}
                className="mt-6 inline-flex h-11 items-center gap-2 bg-[#141414] px-5 text-[13px] font-semibold text-white disabled:opacity-40"
              >
                {generalScanning ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Ver {limit} oportunidades
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="mx-auto grid max-w-5xl gap-5">
            {winners.map((hit, index) => {
              const id = hitKey(hit);
              const board = boardFor(hit);
              const keep = board.activeKeep ?? platformKeep(hit) ?? null;
              const demand =
                board.demandScore ?? amazonProductScore(hit);
              const showDemand =
                demandLane ||
                ((keep == null || keep < 12) && demand >= 50);
              const checked = picked.includes(id);
              const isNew = justFound > 0 && index < justFound;
              const profitRoutes = board.routes.filter((r) => r.keep >= 12);
              const isArb = play === "arbitrage";
              const signalGood = isArb
                ? (keep ?? 0) >= 12
                : demand >= 55;

              return (
                <li
                  key={id}
                  className={cn(
                    "overflow-hidden border bg-white transition",
                    checked ? "border-[#141414]" : "border-[#e0dbd3]",
                    isNew && "ring-2 ring-[#f4c928]/50",
                  )}
                >
                  {/* Decision strip — play type + hero number */}
                  <div
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3",
                      isArb
                        ? "border-[#d8e8dc] bg-[#f3faf5]"
                        : "border-[#ebe4c8] bg-[#fbf7e8]",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
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
                        className="size-5 shrink-0 border border-[#141414] bg-white"
                        aria-label="Select"
                      >
                        {checked ? (
                          <span className="block size-full bg-[#f4c928]" />
                        ) : null}
                      </button>
                      <div className="min-w-0">
                        <p
                          className={cn(
                            "text-[10px] font-bold tracking-[0.16em] uppercase",
                            isArb ? "text-[#1f7a4d]" : "text-[#8a6a10]",
                          )}
                        >
                          {isNew ? "Nueva · " : ""}
                          {isArb ? "Arbitraje" : "Amazon directo"}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[13px] font-semibold text-[#141414]">
                          {route.buy}
                          <ArrowRight className="size-3.5 text-[#8a847c]" />
                          {route.sell}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {showDemand && (keep == null || keep < 12) ? (
                        <>
                          <p className="font-display text-[32px] leading-none tabular-nums text-[#141414]">
                            {Math.round(demand)}
                          </p>
                          <p className="mt-0.5 text-[10px] font-semibold tracking-wide text-[#8a847c] uppercase">
                            Demand score
                          </p>
                        </>
                      ) : (
                        <>
                          <p
                            className={cn(
                              "font-display text-[32px] leading-none tabular-nums",
                              signalGood ? "text-[#1f7a4d]" : "text-[#b42318]",
                            )}
                          >
                            {keep != null ? signed(keep) : "—"}
                          </p>
                          <p className="mt-0.5 text-[10px] font-semibold tracking-wide text-[#8a847c] uppercase">
                            Keep neto
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-4 p-4 sm:flex-row">
                    <div className="relative mx-auto size-28 shrink-0 overflow-hidden bg-[#f0ebe3] sm:mx-0 sm:size-32">
                      {hit.imageUrl ? (
                        <Image
                          src={hit.imageUrl}
                          alt=""
                          fill
                          className="object-contain p-1.5"
                          unoptimized
                        />
                      ) : null}
                    </div>

                    <div className="min-w-0 flex-1 space-y-3">
                      <div>
                        <p className="line-clamp-2 text-[17px] font-semibold leading-snug">
                          {hit.title || id}
                        </p>
                        <p className="mt-1 text-[12px] text-[#8a847c]">
                          {[
                            hit.brand || null,
                            id,
                            hit.bsrDrops90 != null
                              ? `${hit.bsrDrops90} BSR drops / 90d`
                              : null,
                            hit.keepa ? "Keepa" : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>

                      {/* A · Prices — buy / sell highlighted */}
                      <div className="border border-[#e4e0d8]">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#efeae2] bg-[#f7f4ef] px-3 py-2">
                          <p className="text-[11px] font-semibold tracking-[0.12em] text-[#6b6560] uppercase">
                            A · Precios
                          </p>
                          <PlatformOpenLinks
                            size="sm"
                            urls={hit.platformUrls || buildPlatformUrls(hit)}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-px bg-[#e4e0d8] sm:grid-cols-4">
                          {board.platforms.map((p) => {
                            const href =
                              p.url ||
                              buildPlatformUrls(hit)[p.platform] ||
                              null;
                            const role =
                              p.role === "buy"
                                ? "Compra"
                                : p.role === "sell"
                                  ? "Venta"
                                  : null;
                            const inner = (
                              <>
                                <p className="text-[10px] font-semibold tracking-wide text-[#6b6560] uppercase">
                                  {p.label}
                                  {role ? ` · ${role}` : ""}
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
                                    Abrir
                                    <ExternalLink className="size-2.5" />
                                  </p>
                                ) : null}
                              </>
                            );
                            const cellClass = cn(
                              "px-2.5 py-2.5 transition",
                              p.role === "buy" || p.role === "sell"
                                ? "bg-[#fffcf5]"
                                : "bg-white",
                              p.price == null && "opacity-55",
                              href && "hover:bg-[#fbfaf7]",
                            );
                            return href ? (
                              <a
                                key={p.platform}
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cellClass}
                              >
                                {inner}
                              </a>
                            ) : (
                              <div key={p.platform} className={cellClass}>
                                {inner}
                              </div>
                            );
                          })}
                        </div>
                        <div className="border-t border-[#efeae2] px-3 py-2 text-[12px] text-[#6b6560]">
                          Compra {money(board.activeBuy)}
                          <span className="mx-1.5 text-[#c5bfb5]">→</span>
                          Venta {money(board.activeSell)}
                          {board.activeKeep != null
                            ? ` · net ${signed(board.activeKeep)}`
                            : ""}
                          {profitRoutes.length > 1 ? (
                            <span className="mt-1.5 flex flex-wrap gap-1">
                              {profitRoutes.slice(0, 3).map((r) => (
                                <span
                                  key={r.mode}
                                  className={cn(
                                    "border px-1.5 py-0.5 text-[10px]",
                                    r.active
                                      ? "border-[#141414] bg-[#f4c928]/25 font-semibold"
                                      : "border-[#e4e0d8]",
                                  )}
                                >
                                  {r.label} {signed(r.keep)}
                                </span>
                              ))}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <CheapSourcePanel
                        title={hit.title || id}
                        brand={hit.brand}
                        mpn={hit.mpn}
                        upc={hit.upc}
                        imageUrl={hit.imageUrl || undefined}
                        buyPrice={
                          board.activeBuy ??
                          hit.cost ??
                          hit.amazonPrice ??
                          hit.buyBoxPrice
                        }
                        sellPrice={
                          board.activeSell ??
                          hit.ebayActiveLow ??
                          hit.ebayPrice ??
                          hit.salePrice
                        }
                      />

                      {/* C · Actions */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border border-[#e4e0d8] bg-[#fbfaf7] px-3 py-2.5">
                        <p className="text-[12px] text-[#6b6560]">
                          {isArb
                            ? "Importa para arbitraje con precios de plataforma."
                            : "Importa para listar / vender en Amazon."}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={locked}
                            onClick={() => removeHit(id)}
                            className="inline-flex h-10 items-center gap-1.5 border border-[#d5d0c8] bg-white px-3 text-[13px] font-semibold text-[#6b6560] hover:border-[#141414] hover:text-[#141414] disabled:opacity-40"
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
                                Importando…
                              </>
                            ) : (
                              "Importar"
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

      <div className="sticky bottom-0 z-10 border-t border-[#e4e0d8] bg-white/95 px-4 py-2.5 backdrop-blur-md md:px-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-[#6b6560]">
            {selected.length
              ? `${selected.length} seleccionadas · check de plataformas al importar`
              : "Importa una card o selecciona varias"}
          </p>
          <button
            type="button"
            disabled={locked || !selected.length}
            onClick={() => void importSelected()}
            className="h-10 bg-[#f4c928] px-5 text-[13px] font-semibold text-[#141414] disabled:opacity-40"
          >
            {importing && !importingId
              ? "Analizando plataformas…"
              : selected.length
                ? `Importar ${selected.length}`
                : "Elige winners"}
          </button>
        </div>
      </div>
    </div>
  );
}
