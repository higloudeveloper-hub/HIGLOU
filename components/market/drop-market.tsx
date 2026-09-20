"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import {
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";
import { MarketProductTile } from "@/components/market/market-product-tile";
import { MarketDetailPanel } from "@/components/market/market-detail-panel";
import { MarketEarnGuide } from "@/components/market/market-earn-guide";
import { MarketLivePulse } from "@/components/market/market-live-pulse";
import {
  mergeMarketFeed,
  type MarketDropPublic,
} from "@/lib/market/from-opportunity";
import { loadLocalLedger } from "@/lib/opportunity/ledger";
import { marketSpread } from "@/lib/market/catalog";
import { cn } from "@/lib/utils";

type LaneFilter = "all" | "arbitrage" | "amazon" | "retail";
type SortKey = "keep" | "demand" | "hot";

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
  const searchParams = useSearchParams();
  const reduce = useReducedMotion();
  const [drops, setDrops] = useState<MarketDropPublic[]>([]);
  const [tagReady, setTagReady] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<LaneFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("keep");
  const [query, setQuery] = useState("");
  const [profitOnly, setProfitOnly] = useState(false);
  const [deepLinkDone, setDeepLinkDone] = useState(false);

  useEffect(() => {
    let alive = true;

    const local = localVerifiedDrops();
    if (local.length) {
      setDrops(local);
    } else {
      setDrops([]);
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
          affiliateTagConfigured?: boolean;
        };
        if (!alive) return;
        const remote = body.drops || [];
        if (remote.length) {
          setDrops(remote);
        } else if (!local.length) {
          setDrops([]);
        }
        setTagReady(Boolean(body.affiliateTagConfigured));
      } catch {
        if (!alive) return;
        if (!local.length) {
          setDrops([]);
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

  // Home / promos deep-link: /market?drop=win-ASIN
  useEffect(() => {
    if (deepLinkDone || !drops.length) return;
    const dropId = searchParams.get("drop")?.trim();
    if (!dropId) {
      setDeepLinkDone(true);
      return;
    }
    const found = drops.find((d) => d.id === dropId);
    if (found) {
      setActiveId(found.id);
      setPanelOpen(true);
      setFilter("all");
    }
    setDeepLinkDone(true);
  }, [drops, searchParams, deepLinkDone]);

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
    let list =
      filter === "all" ? drops : drops.filter((d) => d.lane === filter);

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.name.toLowerCase().includes(q) ||
          String(d.asin || "")
            .toLowerCase()
            .includes(q),
      );
    }

    if (profitOnly) {
      list = list.filter((d) => {
        if (d.lane === "amazon") return (d.demandScore ?? d.score ?? 0) >= 55;
        return (d.netProfit ?? marketSpread(d)) >= 12;
      });
    }

    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sortKey === "hot") {
        const rank = { hot: 3, warm: 2, fresh: 1 } as const;
        return (rank[b.heat] || 0) - (rank[a.heat] || 0);
      }
      if (sortKey === "demand") {
        return (
          (b.demandScore ?? b.score ?? 0) - (a.demandScore ?? a.score ?? 0)
        );
      }
      const ka =
        a.lane === "amazon" ? -1 : (a.netProfit ?? marketSpread(a));
      const kb =
        b.lane === "amazon" ? -1 : (b.netProfit ?? marketSpread(b));
      return kb - ka;
    });
    return sorted;
  }, [drops, filter, query, profitOnly, sortKey]);

  const active =
    filtered.find((d) => d.id === activeId) ??
    drops.find((d) => d.id === activeId) ??
    null;

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
          toast.error(body.error || "No se pudo agregar a tu tienda");
          return;
        }
        toast.success("En tu tienda — draft listo");
        if (body.note) toast.message(body.note);
        if (body.href) router.push(body.href);
      } catch {
        toast.error("Claim falló");
      } finally {
        setBusy(null);
      }
    },
    [router],
  );

  /** One click: open tagged Amazon + copy shareable link. Single toast. */
  const earnLink = useCallback(async (item: MarketDropPublic) => {
    if (!item.asin) {
      toast.message("Necesitas ASIN — corre Find Winners");
      return;
    }
    setBusy(`aff-${item.id}`);
    const tagged =
      item.affiliateUrl ||
      item.platformUrls?.amazon ||
      null;
    try {
      if (tagged) {
        window.open(tagged, "_blank", "noopener,noreferrer");
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
      };

      if (!res.ok) {
        if (tagged) {
          toast.success("Amazon abierto con tu link affiliate");
        } else {
          toast.error(body.error || "Configura Associate tag en Settings");
        }
        return;
      }

      const copyText = body.smartLink?.path
        ? `${window.location.origin}${body.smartLink.path}`
        : body.link?.destinationUrl || tagged;

      if (copyText) {
        try {
          await navigator.clipboard?.writeText(copyText);
        } catch {
          /* clipboard optional */
        }
      }

      toast.success(
        tagged
          ? "Listo · Amazon abierto · link copiado"
          : "Link affiliate listo · copiado",
      );
    } catch {
      if (tagged) {
        toast.success("Amazon abierto con tu link affiliate");
      } else {
        toast.error("Affiliate falló");
      }
    } finally {
      setBusy(null);
    }
  }, []);

  const openItem = (item: MarketDropPublic) => {
    setActiveId(item.id);
    setPanelOpen(true);
  };

  return (
    <div className="min-h-full bg-[#f7f7f7] text-[#191919]">
      <header className="border-b border-[#e5e5e5] bg-white">
        <div className="flex flex-wrap items-center gap-3 bg-[#3665F3] px-4 py-2.5 text-white md:px-8">
          <span className="size-2 rounded-full bg-white" />
          <p className="text-[11px] font-semibold tracking-[0.2em] uppercase">
            Market
          </p>
          <p className="hidden min-w-0 flex-1 truncate text-[13px] text-white/85 sm:block">
            {drops.length
              ? `${drops.length} verificados${openKeep > 0 ? ` · keep ${signed(openKeep)}` : ""}`
              : "Floor vacío · escaneá Find Winners"}
            {refreshing ? " · sync…" : ""}
          </p>
          <Link
            href="/winners"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3.5 text-[12px] font-semibold text-[#191919]"
          >
            <Sparkles className="size-3.5 text-[#3665F3]" />
            Find winners
          </Link>
        </div>

        <div className="mx-auto max-w-6xl px-4 py-4 md:px-8">
          <div className="inline-flex max-w-full overflow-x-auto rounded-full border border-[#e5e5e5] bg-[#f7f7f7] p-1">
            {(
              [
                ["all", "Todos", drops.length],
                ["arbitrage", "→ eBay", arb.length],
                ["amazon", "→ Amazon", amazon.length],
                ["retail", "Suministro", retail.length],
              ] as const
            ).map(([id, label, count]) => {
              const on = filter === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={cn(
                    "relative shrink-0 rounded-full px-3.5 py-2 text-[13px] font-semibold transition",
                    on ? "text-[#191919]" : "text-[#707070] hover:text-[#191919]",
                  )}
                >
                  {on ? (
                    <motion.span
                      layoutId="market-filter-pill"
                      className="absolute inset-0 rounded-full bg-white shadow-sm"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  ) : null}
                  <span className="relative z-10">
                    {label}
                    <span className="ml-1 opacity-45">{count}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="sticky top-0 z-20 border-b border-[#e5e5e5] bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:px-8">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#a8a8a8]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar título, marca o ASIN"
              className="h-11 w-full rounded-xl border border-[#e5e5e5] bg-white pr-3 pl-10 text-[14px] outline-none transition focus:border-[#3665F3]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ["keep", "Keep"],
                ["demand", "Demanda"],
                ["hot", "Hot"],
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
                    : "bg-[#f0f0f0] text-[#707070] hover:text-[#191919]",
                )}
              >
                {label}
              </button>
            ))}
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
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-5 pb-16 md:px-8">
        <MarketEarnGuide tagReady={tagReady} className="mb-4" />

        {drops.length === 0 ? (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto flex min-h-[300px] max-w-md flex-col items-center justify-center rounded-2xl border border-dashed border-[#ddd] bg-white px-6 py-14 text-center"
          >
            {refreshing ? (
              <Loader2 className="size-6 animate-spin text-[#8a8a8a]" />
            ) : (
              <>
                <p className="text-[11px] font-semibold tracking-[0.16em] text-[#8a8a8a] uppercase">
                  Floor
                </p>
                <p className="mt-2 text-[22px] font-semibold tracking-tight text-[#191919]">
                  Aún no hay deals
                </p>
                <p className="mt-2 text-[14px] leading-relaxed text-[#707070]">
                  Escaneá Find Winners. Los verificados llegan acá listos.
                </p>
                <Link
                  href="/winners"
                  className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-[#3665F3] px-5 text-[13px] font-semibold text-white"
                >
                  <Sparkles className="size-4" />
                  Find Winners
                </Link>
              </>
            )}
          </motion.div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#ddd] bg-white px-6 py-14 text-center">
            <p className="text-[18px] font-semibold text-[#191919]">Sin matches</p>
            <p className="mt-2 text-[14px] text-[#707070]">
              Probá otro filtro o limpiá la búsqueda.
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setFilter("all");
                setProfitOnly(false);
              }}
              className="mt-4 text-[13px] font-semibold text-[#3665F3] hover:underline"
            >
              Reset filtros
            </button>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <AnimatePresence mode="popLayout">
              {filtered.map((item, index) => (
                <motion.li
                  key={item.id}
                  layout
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ delay: Math.min(index * 0.02, 0.2) }}
                >
                  <MarketProductTile
                    item={item}
                    index={index}
                    selected={panelOpen && active?.id === item.id}
                    busy={busy === item.id}
                    affBusy={busy === `aff-${item.id}`}
                    onOpen={() => openItem(item)}
                    onClaim={() => void claim(item)}
                    onEarn={() => void earnLink(item)}
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <MarketDetailPanel
        item={panelOpen ? active : null}
        busy={busy === active?.id}
        affBusy={busy === `aff-${active?.id}`}
        tagReady={tagReady}
        onClose={() => setPanelOpen(false)}
        onClaim={() => {
          if (active) void claim(active);
        }}
        onEarn={() => {
          if (active) void earnLink(active);
        }}
      />
    </div>
  );
}
