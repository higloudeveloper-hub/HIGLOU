"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
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
import {
  WINNER_PLAYS,
  playForMode,
  routesForPlay,
  winnerRouteById,
} from "@/lib/opportunity/winner-routes";
import { stashOpportunityMoneySeed } from "@/lib/monetization/from-opportunity";
import { buildPlatformUrls } from "@/lib/opportunity/platform-links";
import {
  WinnerProductTile,
  type WinnerTileModel,
} from "@/components/winners/winner-product-tile";
import { WinnerDetailPanel } from "@/components/winners/winner-detail-panel";
import { cn } from "@/lib/utils";

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

type SortKey = "keep" | "demand" | "new";

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
  const reduce = useReducedMotion();
  const [mode, setMode] = useState<OpportunityMode>("amazon_to_ebay");
  const route = winnerRouteById(mode);
  const retail = isRetailToMarketplaceMode(mode);
  const demandLane = mode === "amazon";
  const [categoryId, setCategoryId] = useState("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(8);
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
  const [sortKey, setSortKey] = useState<SortKey>("keep");
  const [profitOnly, setProfitOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHydrated(false);
    setPicked([]);
    setError(null);
    setSources(null);
    setJustFound(0);
    setOpenId(null);
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

  const winners = useMemo(() => {
    let list = sortPlatformWinners(
      hits.filter((hit) => isPlatformWinner(hit, mode)),
    ) as BoardHit[];

    if (profitOnly && !demandLane) {
      list = list.filter((hit) => {
        const keep = boardFor(hit).activeKeep ?? platformKeep(hit) ?? 0;
        return keep >= 12;
      });
    }

    const scored = [...list];
    scored.sort((a, b) => {
      if (sortKey === "new") {
        // justFound items already sit at front via applyFound; keep relative order
        return 0;
      }
      if (sortKey === "demand" || demandLane) {
        return amazonProductScore(b) - amazonProductScore(a);
      }
      const ka = boardFor(a).activeKeep ?? platformKeep(a) ?? -999;
      const kb = boardFor(b).activeKeep ?? platformKeep(b) ?? -999;
      return kb - ka;
    });
    return scored;
  }, [hits, mode, profitOnly, demandLane, sortKey]);

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
          "Sin oportunidades con keep real esta ronda. Escanea de nuevo o cambia la ruta.",
        );
        setJustFound(0);
        return;
      }
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
      setSortKey("new");
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
        setError(body?.error || "No se pudo escanear.");
        return;
      }
      applyFound(body.products || [], body.sources || null);
    } catch {
      setError("Error de red. Intenta otra vez.");
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
      setError("Para Walmart / Home Depot escribe un producto o elige categoría.");
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
        setError(body?.error || "Búsqueda falló.");
        return;
      }
      applyFound(body.products || [], body.sources || null);
    } catch {
      setError("Error de red. Intenta otra vez.");
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
    if (openId === id) setOpenId(null);
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
      setError(err instanceof Error ? err.message : "Import falló.");
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
        setOpenId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import falló.");
    } finally {
      setImporting(false);
    }
  };

  const locked = busy || importing;
  const scanning = searching || generalScanning;
  const play = playForMode(mode);
  const playRoutes = routesForPlay(play);

  const setPlay = (nextPlay: (typeof WINNER_PLAYS)[number]["id"]) => {
    if (nextPlay === play) return;
    const def = WINNER_PLAYS.find((p) => p.id === nextPlay)!;
    setMode(def.defaultMode);
  };

  const openHit = winners.find((h) => hitKey(h) === openId) || null;

  const toTile = (hit: BoardHit, index: number): WinnerTileModel => {
    const id = hitKey(hit);
    const board = boardFor(hit);
    const keep = board.activeKeep ?? platformKeep(hit) ?? null;
    const demand = board.demandScore ?? amazonProductScore(hit);
    const showDemand =
      demandLane || ((keep == null || keep < 12) && demand >= 50);
    const urls = hit.platformUrls || buildPlatformUrls(hit);
    return {
      id,
      title: hit.title || id,
      brand: hit.brand,
      imageUrl: hit.imageUrl,
      playLabel: play === "arbitrage" ? "Arbitraje" : "Amazon",
      buyLabel: route.buy,
      sellLabel: route.sell,
      buyPrice: board.activeBuy,
      sellPrice: board.activeSell,
      keep,
      demand,
      showDemand,
      isNew: justFound > 0 && index < justFound,
      selected: picked.includes(id),
      amazonUrl: urls.amazon,
      ebayUrl: urls.ebay,
      meta: [
        id.length <= 14 ? id : null,
        hit.bsrDrops90 != null ? `${hit.bsrDrops90} BSR/90d` : null,
        hit.keepa ? "Keepa" : null,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  };

  return (
    <div className="min-h-full bg-[#f7f5f1] text-[#141414]">
      {/* Light trust header */}
      <header className="relative overflow-hidden border-b border-[#ebe7e0] bg-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 80% at 0% 0%, rgba(244,201,40,0.12), transparent 55%), radial-gradient(ellipse 50% 60% at 100% 0%, rgba(31,122,77,0.06), transparent 50%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 pt-6 pb-5 md:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <motion.p
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.18em] text-[#6b6560] uppercase"
              >
                <ShieldCheck className="size-3.5 text-[#1f7a4d]" />
                Higlou · Verificado
              </motion.p>
              <motion.h1
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="mt-1.5 font-display text-[36px] leading-[0.95] tracking-tight md:text-[44px]"
              >
                Find Winners
              </motion.h1>
              <motion.p
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="mt-2 max-w-md text-[14px] leading-relaxed text-[#6b6560]"
              >
                Oportunidades reales con precios de mercado. Escanea, compara
                keep y decide qué importar.
              </motion.p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!retail ? (
                <button
                  type="button"
                  disabled={locked || scanning}
                  onClick={() => void scanGeneral()}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-[#141414] px-5 text-[13px] font-semibold text-white shadow-[0_8px_24px_rgba(20,20,20,0.18)] transition hover:bg-[#2a2a2a] disabled:opacity-40"
                >
                  {generalScanning ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4 text-[#f4c928]" />
                  )}
                  Ver oportunidades
                </button>
              ) : null}
              <Link
                href="/market"
                className="inline-flex h-11 items-center gap-1.5 rounded-full border border-[#ddd7cd] bg-white px-4 text-[13px] font-semibold text-[#141414] hover:border-[#141414]"
              >
                <Store className="size-3.5" />
                Market
              </Link>
            </div>
          </div>

          {/* Segmented play control */}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex rounded-full border border-[#ebe7e0] bg-[#f4f2ed] p-1">
              {WINNER_PLAYS.map((p) => {
                const on = p.id === play;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPlay(p.id)}
                    className={cn(
                      "relative rounded-full px-4 py-2 text-[13px] font-semibold transition",
                      on
                        ? "text-[#141414]"
                        : "text-[#6b6560] hover:text-[#141414]",
                    )}
                  >
                    {on ? (
                      <motion.span
                        layoutId="play-pill"
                        className="absolute inset-0 rounded-full bg-white shadow-sm"
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      />
                    ) : null}
                    <span className="relative z-10">{p.title}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[12px] text-[#8a847c]">
              {play === "arbitrage"
                ? "Compra en un market · vende en otro · keep neto"
                : "Demanda Keepa · listás directo en Amazon"}
            </p>
          </div>

          {playRoutes.length > 1 ? (
            <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5">
              {playRoutes.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setMode(row.id)}
                  title={row.hint}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold whitespace-nowrap transition",
                    mode === row.id
                      ? "bg-[#141414] text-white"
                      : "bg-white text-[#6b6560] ring-1 ring-[#ebe7e0] hover:ring-[#cfc9bf]",
                  )}
                >
                  {row.buy}
                  <ArrowRight className="size-3 opacity-50" />
                  {row.sell}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      {/* Search toolbar */}
      <div className="sticky top-0 z-20 border-b border-[#ebe7e0] bg-white/90 backdrop-blur-md">
        <form
          className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:px-8"
          onSubmit={(e) => {
            e.preventDefault();
            void find();
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#a8a29a]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                retail
                  ? "Producto, ASIN, UPC…"
                  : "Buscar producto, ASIN o link Amazon"
              }
              disabled={locked || scanning}
              className="h-11 w-full rounded-xl border border-[#ebe7e0] bg-[#faf9f6] pr-3 pl-10 text-[14px] outline-none transition focus:border-[#141414] focus:bg-white"
            />
          </div>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            disabled={locked || scanning}
            className="h-11 rounded-xl border border-[#ebe7e0] bg-[#faf9f6] px-3 text-[13px] outline-none focus:border-[#141414] md:w-44"
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
            aria-label="Cantidad"
            className="h-11 rounded-xl border border-[#ebe7e0] bg-[#faf9f6] px-3 text-[13px] outline-none md:w-20"
          >
            {[...new Set([...AMAZON_WINNER_LIMITS, 8, 12])].sort((a, b) => a - b).map(
              (n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ),
            )}
          </select>
          <button
            type="submit"
            disabled={locked || scanning}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#f4c928] px-5 text-[13px] font-semibold text-[#141414] hover:bg-[#efbf1a] disabled:opacity-40"
          >
            {searching ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Search className="size-3.5" />
            )}
            Escanear
          </button>
        </form>

        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 pb-3 md:px-8">
          <div className="flex rounded-full bg-[#f4f2ed] p-0.5">
            {(
              [
                ["keep", "Keep"],
                ["demand", "Demanda"],
                ["new", "Nuevas"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSortKey(key)}
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-semibold transition",
                  sortKey === key
                    ? "bg-white text-[#141414] shadow-sm"
                    : "text-[#6b6560]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {!demandLane ? (
            <button
              type="button"
              onClick={() => setProfitOnly((v) => !v)}
              className={cn(
                "rounded-full px-3 py-1 text-[11px] font-semibold ring-1 transition",
                profitOnly
                  ? "bg-[#e8f5ee] text-[#1f7a4d] ring-[#b8dfc8]"
                  : "bg-white text-[#6b6560] ring-[#ebe7e0]",
              )}
            >
              Solo keep ≥ $12
            </button>
          ) : null}
          <span className="text-[12px] text-[#8a847c]">
            <strong className="text-[#141414]">{winners.length}</strong>{" "}
            {play === "arbitrage" ? "arbitrajes" : "en Amazon"}
            {justFound > 0 ? (
              <span className="ml-2 font-semibold text-[#1f7a4d]">
                · {justFound} nuevas
              </span>
            ) : null}
            <span className="ml-2">
              {demandLane ? "Demanda " : "Keep "}
              <strong className="text-[#141414]">
                {demandLane ? Math.round(totalKeep) : signed(totalKeep)}
              </strong>
            </span>
          </span>
          {sources?.keepa ? (
            <span className="rounded-full bg-[#e8f5ee] px-2 py-0.5 text-[10px] font-semibold text-[#1f7a4d]">
              Keepa
            </span>
          ) : null}
          {sources?.ebayLive ? (
            <span className="rounded-full bg-[#e8f5ee] px-2 py-0.5 text-[10px] font-semibold text-[#1f7a4d]">
              eBay live
            </span>
          ) : null}
          {sources?.retailSearch ? (
            <span className="rounded-full bg-[#e8f5ee] px-2 py-0.5 text-[10px] font-semibold text-[#1f7a4d]">
              Retail
            </span>
          ) : null}
          {error ? (
            <span className="text-[12px] font-medium text-[#b42318]">{error}</span>
          ) : null}
        </div>
      </div>

      {/* Product grid */}
      <div ref={resultsRef} className="mx-auto max-w-6xl px-4 py-6 pb-28 md:px-8">
        {winners.length === 0 ? (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto flex min-h-[320px] max-w-md flex-col items-center justify-center rounded-3xl border border-dashed border-[#ddd7cd] bg-white/70 px-6 py-14 text-center"
          >
            <p className="text-[11px] font-semibold tracking-[0.16em] text-[#8a847c] uppercase">
              {play === "arbitrage" ? "Arbitraje" : "Amazon directo"}
            </p>
            <p className="mt-2 font-display text-[28px] leading-none">
              Listo para escanear
            </p>
            <p className="mt-3 text-[14px] leading-relaxed text-[#6b6560]">
              {play === "arbitrage"
                ? "Encontramos spreads con keep neto después de fees. Abre cualquier tile para precios, suministro barato e import."
                : "Encontramos demanda Keepa para listar directo en Amazon."}
            </p>
            {!retail ? (
              <button
                type="button"
                disabled={locked || scanning}
                onClick={() => void scanGeneral()}
                className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-[#141414] px-5 text-[13px] font-semibold text-white disabled:opacity-40"
              >
                {generalScanning ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4 text-[#f4c928]" />
                )}
                Ver oportunidades
              </button>
            ) : null}
          </motion.div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <AnimatePresence mode="popLayout">
              {winners.map((hit, index) => {
                const tile = toTile(hit, index);
                return (
                  <li key={tile.id}>
                    <WinnerProductTile
                      item={tile}
                      index={index}
                      locked={locked}
                      onOpen={() => setOpenId(tile.id)}
                      onToggleSelect={() =>
                        setPicked((prev) =>
                          prev.includes(tile.id)
                            ? prev.filter((x) => x !== tile.id)
                            : [...prev, tile.id],
                        )
                      }
                      onSkip={() => removeHit(tile.id)}
                    />
                  </li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <WinnerDetailPanel
        hit={
          openHit
            ? (() => {
                const board = boardFor(openHit);
                const keep = board.activeKeep ?? platformKeep(openHit) ?? null;
                const demand =
                  board.demandScore ?? amazonProductScore(openHit);
                const showDemand =
                  demandLane ||
                  ((keep == null || keep < 12) && demand >= 50);
                return {
                  id: hitKey(openHit),
                  title: openHit.title || hitKey(openHit),
                  brand: openHit.brand,
                  imageUrl: openHit.imageUrl,
                  mpn: openHit.mpn,
                  upc: openHit.upc,
                  meta: [
                    hitKey(openHit),
                    openHit.bsrDrops90 != null
                      ? `${openHit.bsrDrops90} BSR/90d`
                      : null,
                    openHit.keepa ? "Keepa" : null,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                  playLabel: play === "arbitrage" ? "Arbitraje" : "Amazon",
                  buyLabel: route.buy,
                  sellLabel: route.sell,
                  keep,
                  demand,
                  showDemand,
                  board,
                  platformUrls: openHit.platformUrls || buildPlatformUrls(openHit),
                  cost: openHit.cost,
                  amazonPrice: openHit.amazonPrice,
                  buyBoxPrice: openHit.buyBoxPrice,
                  ebayActiveLow: openHit.ebayActiveLow,
                  ebayPrice: openHit.ebayPrice,
                  salePrice: openHit.salePrice,
                };
              })()
            : null
        }
        locked={locked}
        importing={importingId === openId}
        onClose={() => setOpenId(null)}
        onImport={() => {
          if (openHit) void importOne(openHit);
        }}
        onSkip={() => {
          if (openId) removeHit(openId);
        }}
      />

      {/* Batch bar */}
      <div className="sticky bottom-0 z-20 border-t border-[#ebe7e0] bg-white/95 px-4 py-3 backdrop-blur-md md:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-[#6b6560]">
            {selected.length
              ? `${selected.length} seleccionadas · check de plataformas al importar`
              : "Toca un producto para ver precios · marca varios para importar"}
          </p>
          <button
            type="button"
            disabled={locked || !selected.length}
            onClick={() => void importSelected()}
            className="h-10 rounded-full bg-[#f4c928] px-5 text-[13px] font-semibold text-[#141414] disabled:opacity-40"
          >
            {importing && !importingId
              ? "Analizando…"
              : selected.length
                ? `Importar ${selected.length}`
                : "Selecciona winners"}
          </button>
        </div>
      </div>
    </div>
  );
}
