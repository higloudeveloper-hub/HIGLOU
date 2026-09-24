"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import {
  BadgeCheck,
  Flame,
  Loader2,
  Radar,
  Search,
  Sparkles,
  Store,
} from "lucide-react";
import { amazonAsinPrimaryImage } from "@/lib/amazon/asin-image";
import {
  AMAZON_WINNER_CATEGORIES,
} from "@/lib/amazon/winner-categories";
import { amazonProductScore } from "@/lib/opportunity/amazon-product-winner";
import {
  KEEPA_STRATEGIES,
  keepaStrategyMeta,
  type KeepaStrategyId,
} from "@/lib/keepa/strategies";
import {
  loadLocalLedger,
  clearLocalOpportunityLedgers,
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
import { winnerRouteById } from "@/lib/opportunity/winner-routes";
import { stashOpportunityMoneySeed } from "@/lib/monetization/from-opportunity";
import { buildPlatformUrls } from "@/lib/opportunity/platform-links";
import {
  WinnerProductTile,
  type WinnerTileModel,
} from "@/components/winners/winner-product-tile";
import { WinnerDetailPanel } from "@/components/winners/winner-detail-panel";
import { usePaidActionOptional } from "@/components/credits/paid-action-provider";
import { CREDIT_ACTIONS } from "@/lib/credits/costs";
import { cn } from "@/lib/utils";

type BoardHit = OpportunityProduct & {
  priceBoard?: OpportunityPriceBoard;
};

type SearchBody = {
  ok?: boolean;
  error?: string;
  message?: string;
  code?: string;
  charged?: boolean;
  products?: BoardHit[];
  analyzed?: number;
  affiliate?: {
    created?: number;
    reused?: number;
    skipped?: number;
    error?: string;
  } | null;
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
  const { confirmSpend, requirePro, refresh } = usePaidActionOptional();
  // Demand-first: arbitrage removed from Find Winners UI
  const [mode] = useState<OpportunityMode>("amazon");
  const route = winnerRouteById(mode);
  const retail = isRetailToMarketplaceMode(mode);
  const demandLane = true;
  const [categoryId, setCategoryId] = useState("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(8);
  const [keepaStrategy, setKeepaStrategy] =
    useState<KeepaStrategyId>("velocity");
  const [searching, setSearching] = useState(false);
  const [generalScanning, setGeneralScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<BoardHit[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [round, setRound] = useState(0);
  const [justFound, setJustFound] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("demand");
  const [profitOnly, setProfitOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHydrated(false);
    setPicked([]);
    setError(null);
    setJustFound(0);
    setOpenId(null);
    // One-shot browser wipe of ghost Find Winners (no photos)
    try {
      const flag = "higlou-ledger-purged-20260924-v1";
      if (window.localStorage.getItem(flag) !== "1") {
        clearLocalOpportunityLedgers();
        window.localStorage.setItem(flag, "1");
      }
    } catch {
      clearLocalOpportunityLedgers();
    }
    const local = loadLocalLedger(mode);
    const winners = sortPlatformWinners(
      local.hits.filter(
        (hit) =>
          isPlatformWinner(hit, mode) &&
          /^https?:\/\//i.test(String(hit.imageUrl || "")),
      ),
    );
    setHits(winners);
    setHydrated(true);
    void pullRemoteLedger(mode).then((remote) => {
      if (!remote?.hits?.length) {
        setHits([]);
        return;
      }
      const next = sortPlatformWinners(
        remote.hits.filter(
          (hit) =>
            isPlatformWinner(hit, mode) &&
            /^https?:\/\//i.test(String(hit.imageUrl || "")),
        ),
      );
      setHits(next);
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

  const applyFound = useCallback(
    (found: BoardHit[]) => {
      const next = sortPlatformWinners(
        found.filter((hit) => isPlatformWinner(hit, mode)),
      ) as BoardHit[];
      if (!next.length) {
        setError(
          "Sin winners verificados esta ronda. Escaneá de nuevo o buscá un ASIN.",
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
    const ok = await confirmSpend(
      "winners_scan",
      "Si no hay winners, te devolvemos los créditos.",
    );
    if (!ok) return;
    setGeneralScanning(true);
    setError(null);
    const nextRound = round + 1;
    setRound(nextRound);
    try {
      const response = await fetch("/api/winners/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limit: Math.min(12, Math.max(1, limit)),
          mode,
          seed: nextRound - 1,
          excludeAsins: winners.map((hit) => hitKey(hit)).slice(0, 40),
          keepaStrategy,
        }),
      });
      const body = (await response.json().catch(() => null)) as SearchBody | null;
      if (response.status === 402) {
        setError(body?.error || "Sin créditos. Recargá para escanear.");
        return;
      }
      if (!response.ok || !body) {
        const raw = body?.error || "";
        setError(
          /Send JSON|sign in/i.test(raw)
            ? "Inicia sesión o espera un momento e intenta de nuevo."
            : raw || "No se pudo escanear.",
        );
        return;
      }
      if (body.code === "no_results" || !(body.products || []).length) {
        setError(
          body.message ||
            "Sin winners esta ronda · no cobramos. Probá otra vez o buscá un ASIN.",
        );
        setJustFound(0);
        await refresh();
        return;
      }
      applyFound(body.products || []);
      const aff = body.affiliate;
      if (aff?.created && aff.created > 0) {
        toast.success(
          `${aff.created} ganador${aff.created === 1 ? "" : "es"} Keepa → afiliado listo para Facebook`,
          {
            action: {
              label: "Facebook",
              onClick: () => {
                window.location.href = "/facebook";
              },
            },
          },
        );
      } else if (aff?.error && /tag|Affiliate Engine/i.test(aff.error)) {
        toast.message(aff.error, {
          action: {
            label: "Affiliate",
            onClick: () => {
              window.location.href = "/affiliate";
            },
          },
        });
      }
      await refresh();
    } catch {
      setError("Error de red. Intenta otra vez.");
    } finally {
      setGeneralScanning(false);
    }
  }, [
    applyFound,
    busy,
    confirmSpend,
    generalScanning,
    limit,
    mode,
    keepaStrategy,
    refresh,
    retail,
    round,
    searching,
    winners,
  ]);

  const find = useCallback(async () => {
    if (searching || generalScanning || busy) return;
    // Empty search → general opportunity scan (same as "Ver oportunidades")
    if (!retail && !query.trim()) {
      void scanGeneral();
      return;
    }
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
          limit: Math.min(12, Math.max(1, limit)),
          mode,
          onlySellable: false,
          seed: nextRound - 1,
          excludeAsins: winners.map((hit) => hitKey(hit)).slice(0, 40),
          keepaMode: retail ? "off" : "full",
          keepaPurpose: "manual",
          keepaStrategy,
        }),
      });
      const body = (await response.json().catch(() => null)) as SearchBody | null;
      if (!response.ok || !body) {
        const raw = body?.error || "";
        setError(
          /Send JSON|sign in/i.test(raw)
            ? "Inicia sesión o vuelve a escanear en un momento."
            : raw || "Búsqueda falló.",
        );
        return;
      }
      applyFound(body.products || []);
      const aff = body.affiliate;
      if (aff?.created && aff.created > 0) {
        toast.success(
          `${aff.created} ganador${aff.created === 1 ? "" : "es"} Keepa → afiliado listo para Facebook`,
          {
            action: {
              label: "Facebook",
              onClick: () => {
                window.location.href = "/facebook";
              },
            },
          },
        );
      } else if (aff?.error && /tag|Affiliate Engine/i.test(aff.error)) {
        toast.message(aff.error, {
          action: {
            label: "Affiliate",
            onClick: () => {
              window.location.href = "/affiliate";
            },
          },
        });
      }
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
    keepaStrategy,
    limit,
    mode,
    query,
    retail,
    round,
    scanGeneral,
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
    if (selected.length > 1) {
      const pro = await requirePro("batch_import");
      if (!pro) return;
    }
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

  const openHit = winners.find((h) => hitKey(h) === openId) || null;

  const toTile = (hit: BoardHit, index: number): WinnerTileModel => {
    const id = hitKey(hit);
    const board = boardFor(hit);
    const keep = board.activeKeep ?? platformKeep(hit) ?? null;
    const demand = board.demandScore ?? amazonProductScore(hit);
    const showDemand = true;
    const urls = hit.platformUrls || buildPlatformUrls(hit);
    const platforms = (
      ["amazon", "ebay", "walmart", "homedepot"] as const
    ).map((key) => {
      const row = board.platforms.find((p) => p.platform === key);
      const short =
        key === "amazon"
          ? "Amazon"
          : key === "ebay"
            ? "eBay"
            : key === "walmart"
              ? "Walmart"
              : "HD";
      return {
        key,
        label: short,
        price: row?.price ?? null,
        url: row?.url ?? null,
      };
    });
    const priced = platforms.filter((p) => p.price != null).length;
    const hot = (hit.bsrDrops90 ?? 0) >= 40 || demand >= 75;
    const badge =
      hot ? ("Hot" as const) : priced >= 2 ? ("Verificado" as const) : ("Tendencia" as const);
    return {
      id,
      title: hit.title || id,
      brand: hit.brand,
      imageUrl: hit.imageUrl || amazonAsinPrimaryImage(id) || null,
      badge,
      platforms,
      keep,
      demand,
      showDemand,
      isNew: justFound > 0 && index < justFound,
      selected: picked.includes(id),
      amazonUrl: urls.amazon,
      ebayUrl: urls.ebay,
      walmartUrl: urls.walmart,
      homedepotUrl: urls.homedepot,
      bsrDrops: hit.bsrDrops90 ?? null,
      meta: [
        id.length <= 14 ? id : null,
        hit.keepaStrategy
          ? keepaStrategyMeta(
              (hit.keepaStrategy as KeepaStrategyId) || "velocity",
            ).short
          : null,
        hit.monthlySold != null
          ? `${hit.monthlySold.toLocaleString("en-US")}/mo`
          : hit.bsrDrops90 != null
            ? `${hit.bsrDrops90} BSR↓/90d`
            : null,
        hit.amazonOos90 != null && hit.amazonOos90 >= 50
          ? `Amazon OOS ${hit.amazonOos90}%`
          : null,
        hit.keepa ? "Keepa ✓" : null,
        priced >= 2 ? `${priced} plataformas` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  };

  return (
    <div className="min-h-full bg-[#f7f7f7] text-[#191919]">
      <header className="border-b border-[#e5e5e5] bg-white">
        <div className="flex flex-wrap items-center gap-3 bg-[#3665F3] px-4 py-2.5 text-white md:px-8">
          <motion.span
            className="size-2 rounded-full bg-white"
            animate={reduce ? undefined : { opacity: [1, 0.35, 1] }}
            transition={{ duration: 1.4, repeat: Infinity }}
          />
          <p className="text-[11px] font-semibold tracking-[0.2em] uppercase">
            Find winners
          </p>
          <p className="hidden min-w-0 flex-1 truncate text-[13px] text-white/85 sm:block">
            Playbooks Keepa de sellers pro · {keepaStrategyMeta(keepaStrategy).short}
          </p>
          <button
            type="button"
            disabled={locked || scanning}
            onClick={() => void scanGeneral()}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3.5 text-[12px] font-semibold text-[#191919] disabled:opacity-40"
          >
            {generalScanning ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5 text-[#3665F3]" />
            )}
            Escanear winners
            <span className="ml-1 text-[10px] font-medium text-[#707070]">
              · {CREDIT_ACTIONS.winners_scan.cost} cr
            </span>
          </button>
          <Link
            href="/market"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/15 px-3.5 text-[12px] font-semibold text-white hover:bg-white/25"
          >
            <Store className="size-3.5" />
            Market
          </Link>
        </div>

        <div className="mx-auto max-w-6xl px-4 py-4 md:px-8">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#e5e5e5] bg-[#f7f7f7] px-3.5 py-2">
              <BadgeCheck className="size-4 text-[#3665F3]" />
              <span className="text-[13px] font-semibold text-[#191919]">
                Verificados por Higlou
              </span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#e5e5e5] bg-[#f7f7f7] px-3.5 py-2">
              <Flame className="size-4 text-[#191919]" />
              <span className="text-[13px] font-semibold text-[#191919]">
                En tendencia
              </span>
            </div>
            <p className="text-[12px] text-[#707070]">
              {keepaStrategyMeta(keepaStrategy).blurb}
            </p>
          </div>
        </div>
      </header>

      {/* Finder — one clear row */}
      <div className="sticky top-0 z-20 border-b border-[#e5e5e5] bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-1.5 px-4 pt-3 md:px-8">
          {KEEPA_STRATEGIES.map((s) => {
            const active = keepaStrategy === s.id;
            return (
              <button
                key={s.id}
                type="button"
                disabled={locked || scanning}
                title={s.blurb}
                onClick={() => setKeepaStrategy(s.id)}
                className={cn(
                  "h-8 rounded-full px-3 text-[11px] font-semibold transition disabled:opacity-40",
                  active
                    ? "bg-[#191919] text-white"
                    : "border border-[#e5e5e5] bg-white text-[#707070] hover:border-[#3665F3] hover:text-[#191919]",
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>
        <form
          className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:px-8"
          onSubmit={(e) => {
            e.preventDefault();
            void find();
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#a8a8a8]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscá producto o ASIN · vacío = escanear winners"
              disabled={locked || scanning}
              className="h-12 w-full rounded-xl border border-[#e5e5e5] bg-white pr-3 pl-10 text-[15px] outline-none transition focus:border-[#3665F3]"
            />
          </div>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            disabled={locked || scanning}
            className="h-12 rounded-xl border border-[#e5e5e5] bg-white px-3 text-[13px] outline-none focus:border-[#3665F3] md:w-40"
          >
            {AMAZON_WINNER_CATEGORIES.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={locked || scanning}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#3665F3] px-6 text-[14px] font-semibold text-white hover:bg-[#2f5ae0] disabled:opacity-40"
          >
            {searching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
            {query.trim() ? "Buscar" : "Escanear"}
          </button>
        </form>

        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 pb-3 md:px-8">
          {(
            [
              ["demand", "Score"],
              ["new", "Nuevas"],
              ["keep", "Keep"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSortKey(key)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[12px] font-semibold transition",
                sortKey === key
                  ? "bg-[#191919] text-white"
                  : "bg-[#f0f0f0] text-[#707070]",
              )}
            >
              {label}
            </button>
          ))}
          {!demandLane ? (
            <button
              type="button"
              onClick={() => setProfitOnly((v) => !v)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[12px] font-semibold transition",
                profitOnly
                  ? "bg-[#e8f5ee] text-[#1f7a4d]"
                  : "bg-[#f0f0f0] text-[#707070]",
              )}
            >
              ≥ $12
            </button>
          ) : null}
          <span className="text-[12px] text-[#707070]">
            <strong className="text-[#191919]">{winners.length}</strong>
            {justFound > 0 ? (
              <span className="ml-1.5 font-semibold text-[#3665F3]">
                · {justFound} nuevas
              </span>
            ) : null}
          </span>
          {error ? (
            <span className="text-[12px] font-medium text-[#b42318]">{error}</span>
          ) : null}
        </div>
      </div>

      {/* Product grid */}
      <div ref={resultsRef} className="mx-auto max-w-6xl px-4 py-5 pb-28 md:px-8">
        {scanning ? (
          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-4 flex items-center gap-3 overflow-hidden rounded-2xl border border-[#3665F3]/25 bg-[#eef2ff] px-4 py-3"
          >
            <motion.span
              className="grid size-10 place-items-center rounded-xl bg-[#3665F3] text-white"
              animate={reduce ? undefined : { rotate: [0, 360] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
            >
              <Radar className="size-5" />
            </motion.span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-[#191919]">
                Escaneando winners verificados…
              </p>
              <p className="text-[12px] text-[#707070]">
                Keepa · Amazon · eBay · Walmart · Home Depot
              </p>
            </div>
            {!reduce ? (
              <motion.span
                className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-white sm:block"
              >
                <motion.span
                  className="block h-full w-1/2 rounded-full bg-[#3665F3]"
                  animate={{ x: ["-100%", "200%"] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                />
              </motion.span>
            ) : null}
          </motion.div>
        ) : null}

        {winners.length === 0 ? (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto flex min-h-[300px] max-w-md flex-col items-center justify-center rounded-2xl border border-dashed border-[#ddd] bg-white px-6 py-14 text-center"
          >
            <span className="grid size-14 place-items-center rounded-2xl bg-[#eef2ff] text-[#3665F3]">
              <BadgeCheck className="size-7" />
            </span>
            <p className="mt-4 text-[11px] font-semibold tracking-[0.16em] text-[#8a8a8a] uppercase">
              Winners verificados
            </p>
            <p className="mt-2 text-[22px] font-semibold tracking-tight text-[#191919]">
              Listo para el wow
            </p>
            <p className="mt-2 text-[14px] leading-relaxed text-[#707070]">
              Tocá <strong className="font-medium text-[#191919]">Escanear winners</strong>{" "}
              y Higlou te trae productos en tendencia con precios en cada plataforma.
            </p>
            <button
              type="button"
              disabled={locked || scanning}
              onClick={() => void scanGeneral()}
              className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-[#3665F3] px-5 text-[13px] font-semibold text-white disabled:opacity-40"
            >
              {generalScanning ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Escanear winners
            </button>
          </motion.div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <AnimatePresence mode="popLayout">
              {winners.map((hit, index) => {
                const tile = toTile(hit, index);
                return (
                  <motion.li
                    key={tile.id}
                    layout
                    initial={reduce ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ delay: Math.min(index * 0.02, 0.2) }}
                  >
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
                  </motion.li>
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
                const showDemand = true;
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
                      ? `${openHit.bsrDrops90} BSR↓/90d`
                      : null,
                    openHit.keepa ? "Keepa ✓" : null,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                  playLabel: "Verificado",
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
      <div className="sticky bottom-0 z-20 border-t border-[#e5e5e5] bg-white/95 px-4 py-3 backdrop-blur-md md:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-[#707070]">
            {selected.length
              ? `${selected.length} seleccionadas`
              : "Tocá un producto · marcá varios para importar"}
          </p>
          <button
            type="button"
            disabled={locked || !selected.length}
            onClick={() => void importSelected()}
            className="h-10 rounded-full bg-[#3665F3] px-5 text-[13px] font-semibold text-white disabled:opacity-40"
          >
            {importing && !importingId
              ? "Importando…"
              : selected.length
                ? `Importar ${selected.length}`
                : "Seleccioná winners"}
          </button>
        </div>
      </div>
    </div>
  );
}
