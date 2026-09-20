"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import {
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { MarketProductTile } from "@/components/market/market-product-tile";
import { MarketDetailPanel } from "@/components/market/market-detail-panel";
import { MarketEarnGuide } from "@/components/market/market-earn-guide";
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
  const [note, setNote] = useState(
    "Market se llena con winners verificados de Find Winners.",
  );
  const [tagReady, setTagReady] = useState(false);
  const [ledgerCount, setLedgerCount] = useState(0);
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
    const emptyNote =
      "Market vacío hasta que Find Winners verifique arbitraje o demanda Amazon.";

    const local = localVerifiedDrops();
    if (local.length) {
      setDrops(local);
      setLedgerCount(local.length);
      setNote(
        `${local.length} winner${local.length === 1 ? "" : "s"} verificados desde Find Winners`,
      );
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
    <div className="min-h-full bg-[#f7f5f1] text-[#141414]">
      <header className="relative overflow-hidden border-b border-[#ebe7e0] bg-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 80% at 0% 0%, rgba(244,201,40,0.12), transparent 55%), radial-gradient(ellipse 50% 60% at 100% 0%, rgba(33,98,161,0.07), transparent 50%)",
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
                Higlou · Floor verificado
              </motion.p>
              <motion.h1
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="mt-1.5 font-display text-[36px] leading-[0.95] tracking-tight md:text-[44px]"
              >
                Market
              </motion.h1>
              <motion.p
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="mt-2 max-w-lg text-[14px] leading-relaxed text-[#6b6560]"
              >
                Cada winner ya trae tu link affiliate. Comparte, vende o busca
                más barato — gana con clicks simples.
              </motion.p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-full bg-[#f4f2ed] px-3 py-2 text-[12px] text-[#6b6560]">
                <strong className="text-[#141414]">{drops.length}</strong> en
                floor
                {openKeep > 0 ? (
                  <>
                    {" "}
                    · keep{" "}
                    <strong className="text-[#1f7a4d]">{signed(openKeep)}</strong>
                  </>
                ) : null}
                {refreshing ? " · sync…" : ""}
              </div>
              <Link
                href="/winners"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-[#141414] px-5 text-[13px] font-semibold text-white shadow-[0_8px_24px_rgba(20,20,20,0.18)] hover:bg-[#2a2a2a]"
              >
                <Sparkles className="size-4 text-[#f4c928]" />
                Find winners
              </Link>
            </div>
          </div>

          <div className="mt-6 inline-flex rounded-full border border-[#ebe7e0] bg-[#f4f2ed] p-1">
            {(
              [
                ["all", "Todos", drops.length],
                ["arbitrage", "Arbitraje", arb.length],
                ["amazon", "Amazon", amazon.length],
                ["retail", "Retail", retail.length],
              ] as const
            ).map(([id, label, count]) => {
              const on = filter === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={cn(
                    "relative rounded-full px-3.5 py-2 text-[13px] font-semibold transition",
                    on ? "text-[#141414]" : "text-[#6b6560] hover:text-[#141414]",
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
                    <span className="ml-1 opacity-50">{count}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[12px] text-[#8a847c]">
            {tagReady
              ? "Affiliate activo · cada Amazon abre con tu tag"
              : "Tip: configura Associate tag en Settings → Money"}
            {note ? ` · ${note}` : ""}
            {ledgerCount > 0 ? ` · ledger ${ledgerCount}` : ""}
          </p>
        </div>
      </header>

      <div className="sticky top-0 z-20 border-b border-[#ebe7e0] bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:px-8">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#a8a29a]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en el floor · título, marca, ASIN"
              className="h-11 w-full rounded-xl border border-[#ebe7e0] bg-[#faf9f6] pr-3 pl-10 text-[14px] outline-none transition focus:border-[#141414] focus:bg-white"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-full bg-[#f4f2ed] p-0.5">
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
              Solo money ≥ $12
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 pb-16 md:px-8">
        <MarketEarnGuide tagReady={tagReady} className="mb-6" />

        {drops.length === 0 ? (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto flex min-h-[320px] max-w-md flex-col items-center justify-center rounded-3xl border border-dashed border-[#ddd7cd] bg-white/70 px-6 py-14 text-center"
          >
            {refreshing ? (
              <Loader2 className="size-6 animate-spin text-[#8a847c]" />
            ) : (
              <>
                <p className="text-[11px] font-semibold tracking-[0.16em] text-[#8a847c] uppercase">
                  Floor
                </p>
                <p className="mt-2 font-display text-[28px] leading-none">
                  Aún no hay deals
                </p>
                <p className="mt-3 text-[14px] leading-relaxed text-[#6b6560]">
                  Escanea winners primero. Cada oportunidad verificada llega
                  aquí con link affiliate listo.
                </p>
                <Link
                  href="/winners"
                  className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-[#141414] px-5 text-[13px] font-semibold text-white"
                >
                  <Sparkles className="size-4 text-[#f4c928]" />
                  Abrir Find Winners
                </Link>
              </>
            )}
          </motion.div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[#ddd7cd] bg-white/70 px-6 py-14 text-center">
            <p className="font-display text-[24px]">Sin matches</p>
            <p className="mt-2 text-[14px] text-[#6b6560]">
              Prueba otro filtro o limpia la búsqueda.
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setFilter("all");
                setProfitOnly(false);
              }}
              className="mt-4 text-[13px] font-semibold text-[#2162a1] hover:underline"
            >
              Reset filtros
            </button>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <AnimatePresence mode="popLayout">
              {filtered.map((item, index) => (
                <li key={item.id}>
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
                </li>
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
