"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { AMAZON_WINNER_CATEGORIES, AMAZON_WINNER_LIMITS } from "@/lib/amazon/winner-categories";
import {
  importActionLabel,
  OPPORTUNITY_MODES,
} from "@/lib/opportunity/mode-copy";
import {
  mergeOpportunityHits,
  nextLiveScanTarget,
} from "@/lib/opportunity/niches";
import { estimateNetProfit, estimatedKeepAmount } from "@/lib/opportunity/profit";
import type {
  OpportunityMode,
  OpportunityProduct,
} from "@/lib/opportunity/types";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/components/listing/wizard/use-prefers-reduced-motion";
import { toEbayListingTitle } from "@/lib/ebay/listing-helpers";

type WinnerSources = {
  keepa?: boolean;
  amazonCatalog?: boolean;
  amazonFees?: boolean;
  ebayLive?: boolean;
};

type SearchBody = {
  ok?: boolean;
  error?: string;
  products?: OpportunityProduct[];
  sources?: WinnerSources;
  queries?: string[];
};

const EASE = [0.22, 1, 0.36, 1] as const;

function money(n: number | null | undefined) {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

function pct(n: number | null | undefined) {
  if (n == null) return "—";
  return `${Math.round(n * 100)}%`;
}

function signedMoney(n: number) {
  return `${n >= 0 ? "+" : "−"}$${Math.abs(n).toFixed(2)}`;
}

function eligibilityCopy(hit: OpportunityProduct, mode: OpportunityMode) {
  if (mode === "amazon_to_ebay") return "Buy on Amazon · list on eBay";
  if (hit.eligibility === "SELLABLE") return "Your Amazon account can sell this";
  if (hit.eligibility === "APPROVAL_REQUIRED") return "Needs Amazon approval";
  if (hit.eligibility === "RESTRICTED") return "Blocked for your Amazon account";
  if (hit.eligibility === "CONDITION_RESTRICTED") return "Wrong condition";
  return "Connect Amazon to confirm you can sell";
}

function keepFor(hit: OpportunityProduct, mode: OpportunityMode) {
  return estimatedKeepAmount({ ...hit, mode });
}

function heroFor(hit: OpportunityProduct, mode: OpportunityMode) {
  const ebay = hit.ebayActiveMedian ?? hit.ebayPrice;
  const keep = keepFor(hit, mode);
  if (keep != null) {
    return {
      kicker: mode === "amazon" ? "Est. Amazon profit" : "Est. eBay profit",
      value: signedMoney(keep),
      amount: keep,
      detail:
        hit.roi != null
          ? `${Math.round(hit.roi * 100)}% ROI · Amazon ${money(hit.amazonPrice)} → eBay ${money(ebay)}`
          : `Amazon ${money(hit.amazonPrice)} → eBay ${money(ebay)}`,
    };
  }
  if (ebay != null) {
    return {
      kicker: "eBay asking price",
      value: money(ebay),
      amount: null as number | null,
      detail: hit.amazonPrice
        ? `Amazon cost ${money(hit.amazonPrice)} · scoring profit`
        : "Analyzing Amazon cost and eBay fees",
    };
  }
  return {
    kicker: "Scoring",
    value: `${hit.score}/100`,
    amount: null as number | null,
    detail: "Reading live prices",
  };
}

function useCountToward(target: number, reduce: boolean) {
  const [n, setN] = useState(reduce ? target : 0);
  const current = useRef(reduce ? target : 0);

  useEffect(() => {
    if (reduce) {
      current.current = target;
      setN(target);
      return;
    }
    const from = current.current;
    const start = performance.now();
    const dur = 780;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const val = from + (target - from) * (1 - (1 - t) ** 3);
      current.current = val;
      setN(val);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduce]);

  return n;
}

function MoneyTicker({
  value,
  className,
  signed = true,
}: {
  value: number;
  className?: string;
  signed?: boolean;
}) {
  const reduce = usePrefersReducedMotion();
  const n = useCountToward(Number(value) || 0, reduce);
  const shown = signed ? signedMoney(n) : money(n);
  return (
    <span className={cn("tabular-nums tracking-tight", className)}>{shown}</span>
  );
}

function dealChips(hit: OpportunityProduct, mode: OpportunityMode) {
  const chips: string[] = [];
  const keep = keepFor(hit, mode);
  if (keep != null && keep >= 10) chips.push("Real payday");
  else if (keep != null && keep > 0) chips.push("Positive keep");
  const ebayN = hit.ebayActiveCount;
  if (ebayN != null && ebayN <= 6) chips.push("Thin eBay");
  else if (ebayN != null && ebayN <= 15) chips.push(`${ebayN} on eBay`);
  if (hit.amazonRetail && mode === "amazon_to_ebay") chips.push("Buy from Amazon");
  if (hit.grade === "excellent") chips.push("Strong score");
  return chips.slice(0, 3);
}

function spreadPct(amazon: number | null, ebay: number | null) {
  if (amazon == null || ebay == null || amazon <= 0 || ebay <= amazon) return 0;
  return Math.min(100, Math.round(((ebay - amazon) / ebay) * 100));
}

function reviewsLabel(n: number | null) {
  if (n == null) return "";
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  return n.toLocaleString();
}

function dealLine(hit: OpportunityProduct, mode: OpportunityMode) {
  const ebay = hit.ebayActiveMedian ?? hit.ebayPrice;
  if (mode === "amazon") {
    return `Your cost ${money(hit.cost)} → Amazon ${money(hit.amazonPrice)}`;
  }
  if (mode === "supplier") {
    return `Cost ${money(hit.cost)} · Amazon ${money(hit.amazonPrice)} · eBay ${money(ebay)}`;
  }
  return `Buy ${money(hit.amazonPrice)} → Sell ${money(ebay)}`;
}

function proofLine(hit: OpportunityProduct) {
  const bits: string[] = [];
  if (hit.rating != null) bits.push(`★ ${hit.rating.toFixed(1)}`);
  if (hit.reviewCount != null) bits.push(`${reviewsLabel(hit.reviewCount)} reviews`);
  bits.push(`${hit.score}/100`);
  return bits.join(" · ");
}

function metricsFor(hit: OpportunityProduct, mode: OpportunityMode) {
  const bsr =
    hit.salesRank && hit.salesRankLabel !== "Amazon search"
      ? hit.salesRank.toLocaleString()
      : "—";
  const ebay = hit.ebayActiveMedian ?? hit.ebayPrice;
  if (mode === "amazon") {
    return [
      ["Score", `${hit.score}/100`],
      ["Amazon profit", money(hit.netProfit)],
      ["ROI", pct(hit.roi)],
      ["Your cost", money(hit.cost)],
      ["Amazon price", money(hit.amazonPrice)],
      ["BSR", bsr],
    ] as const;
  }
  if (mode === "supplier") {
    const amazonPl = estimateNetProfit({
      salePrice: hit.amazonPrice,
      cost: hit.cost,
      marketplaceFee: hit.amazonFees,
    });
    const ebayPl = estimateNetProfit({
      salePrice: ebay,
      cost: hit.cost,
      marketplaceFee: hit.ebayFees,
    });
    return [
      ["Score", `${hit.score}/100`],
      ["Amazon P/L", money(amazonPl.netProfit)],
      ["eBay P/L", money(ebayPl.netProfit)],
      ["Your cost", money(hit.cost)],
      ["Amazon", money(hit.amazonPrice)],
      ["eBay ask", money(ebay)],
    ] as const;
  }
  return [
    ["Score", `${hit.score}/100`],
    ["eBay profit", money(hit.netProfit)],
    ["ROI", pct(hit.roi)],
    ["Amazon cost", money(hit.amazonPrice)],
    [
      "eBay ask",
      ebay != null && hit.ebayActiveCount
        ? `${money(ebay)} · ${hit.ebayActiveCount}`
        : money(ebay),
    ],
    ["BSR", bsr],
  ] as const;
}

function WinnerCard({
  hit,
  mode,
  checked,
  fresh,
  locked,
  onToggle,
}: {
  hit: OpportunityProduct;
  mode: OpportunityMode;
  checked: boolean;
  fresh: boolean;
  locked: boolean;
  onToggle: () => void;
}) {
  const hero = heroFor(hit, mode);
  const ebay = hit.ebayActiveMedian ?? hit.ebayPrice;
  const hot = hero.amount != null && hero.amount >= 10;
  const chips = dealChips(hit, mode);
  const fill = spreadPct(hit.amazonPrice, ebay);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8 }}
      whileHover={locked ? undefined : { y: -6 }}
      transition={{ duration: 0.34, ease: EASE }}
    >
      <label
        className={cn(
          "group flex h-full cursor-pointer flex-col overflow-hidden rounded-[22px] border bg-white transition-[box-shadow,border-color,transform]",
          checked
            ? "border-[#141414] shadow-[0_16px_40px_rgba(20,20,20,0.16)]"
            : hot
              ? "border-[#f4c928]/80 shadow-[0_12px_32px_rgba(244,201,40,0.18)] hover:border-[#f4c928]"
              : "border-[#ececec] hover:border-[#cfcfcf] hover:shadow-[0_8px_24px_rgba(20,20,20,0.07)]",
        )}
      >
        <span className="relative block h-[176px] shrink-0 bg-[#111]">
          {hit.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hit.imageUrl}
              alt=""
              className="h-full w-full object-contain p-5 transition duration-500 group-hover:scale-[1.05]"
            />
          ) : (
            <span className="block h-full w-full bg-[#1a1a1a]" />
          )}
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
          {fresh ? (
            <span className="absolute top-2.5 left-2.5 bg-[#f4c928] px-2 py-0.5 text-[10px] font-semibold tracking-[0.14em] text-[#141414] uppercase">
              Just found
            </span>
          ) : hit.opportunity === "now" ? (
            <span className="absolute top-2.5 left-2.5 bg-[#f4c928] px-2 py-0.5 text-[10px] font-semibold tracking-[0.14em] text-[#141414] uppercase">
              Now
            </span>
          ) : null}
          <input
            type="checkbox"
            checked={checked}
            disabled={locked}
            onChange={onToggle}
            className="absolute top-2.5 right-2.5 size-5 accent-[#f4c928]"
          />
          <span className="absolute right-2.5 bottom-2.5 left-2.5 flex items-end justify-between gap-2">
            <span className="min-w-0 bg-black/80 px-2.5 py-1.5 text-white backdrop-blur-sm">
              <span className="block text-[10px] font-medium tracking-[0.12em] text-[#f4c928] uppercase">
                You keep
              </span>
              {hero.amount != null ? (
                <MoneyTicker
                  value={hero.amount}
                  className="block text-[26px] font-semibold leading-none text-white"
                />
              ) : (
                <span className="block text-[18px] font-semibold leading-none text-white/55">
                  Scoring
                </span>
              )}
            </span>
            <span className="shrink-0 bg-white/10 px-2 py-1 text-[10px] font-semibold tracking-wide text-white uppercase backdrop-blur-sm">
              {hit.score}/100
            </span>
          </span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col px-3.5 pt-3 pb-3.5">
          <span className="line-clamp-2 min-h-[40px] text-[15px] font-semibold leading-snug text-[#141414]">
            {toEbayListingTitle(hit.title) || hit.asin}
          </span>
          <span className="mt-1 block truncate text-[12px] text-[#707070]">
            {proofLine(hit)}
            {hit.brand ? ` · ${hit.brand}` : ""}
          </span>
          <span className="mt-3">
            <span className="flex items-center justify-between text-[11px] font-medium tabular-nums text-[#707070]">
              <span>Amazon {money(hit.amazonPrice)}</span>
              <span>eBay {money(ebay)}</span>
            </span>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[#ececec]">
              <span
                className="block h-full rounded-full bg-[#f4c928]"
                style={{ width: `${Math.max(8, fill)}%` }}
              />
            </span>
          </span>
          <span className="mt-2 block text-[13px] font-medium tabular-nums text-[#141414]">
            {dealLine(hit, mode)}
          </span>
          <span className="mt-0.5 block text-[12px] text-[#707070]">
            {hero.kicker}
            {hit.roi != null ? ` · ${Math.round(hit.roi * 100)}% back` : ""}
          </span>
          {chips.length ? (
            <span className="mt-2 flex flex-wrap gap-1">
              {chips.map((chip) => (
                <span
                  key={chip}
                  className="bg-[#141414] px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-[#f4c928] uppercase"
                >
                  {chip}
                </span>
              ))}
            </span>
          ) : null}
          <span className="sr-only">
            {metricsFor(hit, mode)
              .map(([label, value]) => `${label} ${value}`)
              .join(". ")}
          </span>
          <span className="mt-2 text-[12px] text-[#707070]">
            {eligibilityCopy(hit, mode)}
          </span>
        </span>
      </label>
    </motion.li>
  );
}

async function requestOpportunities(payload: {
  query: string;
  categoryId: string;
  limit: number;
  mode: OpportunityMode;
  onlySellable: boolean;
  cost?: number;
  seed: number;
  excludeAsins: string[];
}): Promise<{
  ok: boolean;
  error: string;
  products: OpportunityProduct[];
  sources: WinnerSources | null;
  queries: string[];
  retryAfterMs: number;
}> {
  const response = await fetch("/api/amazon/auto-import/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => null)) as SearchBody | null;
  const retryAfter = Number(response.headers.get("Retry-After") || 0);
  return {
    ok: Boolean(response.ok && body?.ok && body.products?.length),
    error: body?.error || (response.ok ? "" : "Amazon search failed."),
    products: body?.products || [],
    sources: body?.sources || null,
    queries: body?.queries || [],
    retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 15_000,
  };
}

export function AmazonAutoImportPanel({
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
    }>,
  ) => Promise<boolean | void>;
}) {
  const reduce = usePrefersReducedMotion();
  const [view, setView] = useState<"live" | "manual">("live");
  const [liveOn, setLiveOn] = useState(true);
  const [scanStep, setScanStep] = useState(0);
  const [scanLabel, setScanLabel] = useState("Home & Kitchen");
  const [categoryId, setCategoryId] = useState("");
  const [extra, setExtra] = useState("");
  const [limit, setLimit] = useState(8);
  const [mode, setMode] = useState<OpportunityMode>("amazon_to_ebay");
  const [onlySellable, setOnlySellable] = useState(true);
  const [cost, setCost] = useState("");
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveHits, setLiveHits] = useState<OpportunityProduct[]>([]);
  const [manualHits, setManualHits] = useState<OpportunityProduct[]>([]);
  const [sources, setSources] = useState<WinnerSources | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [round, setRound] = useState(0);
  const [queries, setQueries] = useState<string[]>([]);
  const [freshAsins, setFreshAsins] = useState<string[]>([]);
  const liveHitsRef = useRef<OpportunityProduct[]>([]);
  const liveOnRef = useRef(true);
  const modeRef = useRef(mode);
  const costRef = useRef<number | undefined>(undefined);
  const onlySellableRef = useRef(onlySellable);

  const activeMode = OPPORTUNITY_MODES.find((row) => row.id === mode);
  const locked = busy || importing;
  const hits = view === "live" ? liveHits : manualHits;
  const selected = useMemo(
    () => hits.filter((hit) => picked.includes(hit.asin)),
    [hits, picked],
  );
  const supplierCost = Number(cost);
  const costValue =
    Number.isFinite(supplierCost) && supplierCost > 0 ? supplierCost : undefined;
  const needsCost = mode === "amazon" || mode === "supplier";
  const canManualSearch = Boolean(categoryId || extra.trim().length >= 2);
  const sessionProfit = useMemo(
    () => hits.reduce((sum, hit) => sum + (keepFor(hit, mode) ?? 0), 0),
    [hits, mode],
  );
  const selectedProfit = useMemo(
    () => selected.reduce((sum, hit) => sum + (keepFor(hit, mode) ?? 0), 0),
    [selected, mode],
  );

  useEffect(() => {
    liveHitsRef.current = liveHits;
  }, [liveHits]);

  useEffect(() => {
    liveOnRef.current = liveOn;
  }, [liveOn]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    costRef.current = costValue;
  }, [costValue]);

  useEffect(() => {
    onlySellableRef.current = onlySellable;
  }, [onlySellable]);

  useEffect(() => {
    if (view !== "live" || !liveOn) return;
    let cancelled = false;
    const wait = (ms: number) =>
      new Promise((resolve) => window.setTimeout(resolve, ms));

    void (async () => {
      let step = scanStep;
      while (!cancelled && liveOnRef.current) {
        const target = nextLiveScanTarget(step);
        setScanLabel(target.label);
        setQueries([target.query]);
        setSearching(true);
        setError(null);
        try {
          const found = await requestOpportunities({
            query: target.query,
            categoryId: target.categoryId,
            limit: 5,
            mode: modeRef.current,
            onlySellable:
              modeRef.current === "amazon_to_ebay"
                ? false
                : onlySellableRef.current,
            cost: costRef.current,
            seed: target.seed,
            excludeAsins: liveHitsRef.current.map((hit) => hit.asin).slice(0, 80),
          });
          if (cancelled || !liveOnRef.current) break;
          if (found.ok) {
            const seen = new Set(liveHitsRef.current.map((hit) => hit.asin));
            setFreshAsins(
              found.products
                .filter((hit) => !seen.has(hit.asin))
                .map((hit) => hit.asin),
            );
            setLiveHits((prev) => mergeOpportunityHits(prev, found.products));
            setSources(found.sources);
            setQueries(found.queries);
          } else if (/too many/i.test(found.error)) {
            setError("Live scan paused for a minute, then continues.");
            setSearching(false);
            await wait(found.retryAfterMs);
            continue;
          } else {
            setQueries(found.queries);
          }
        } catch {
          if (!cancelled) setError("Live scan lost Amazon for a moment. Retrying…");
        }
        if (cancelled || !liveOnRef.current) break;
        setSearching(false);
        step += 1;
        setScanStep(step);
        await wait(2500);
      }
      if (!cancelled) setSearching(false);
    })();

    return () => {
      cancelled = true;
    };
    // Restart when the seller starts/stops live scan or changes channel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, liveOn, mode]);

  const chooseMode = (next: OpportunityMode) => {
    setMode(next);
    setLiveHits([]);
    setManualHits([]);
    setPicked([]);
    setSources(null);
    setQueries([]);
    setError(null);
    setScanStep(0);
    if (next === "amazon") setOnlySellable(true);
  };

  const searchManual = async () => {
    if (locked || searching || !canManualSearch) return;
    const nextRound = round + 1;
    setRound(nextRound);
    setSearching(true);
    setError(null);
    try {
      const found = await requestOpportunities({
        query: extra.trim(),
        categoryId,
        limit,
        mode,
        onlySellable: mode === "amazon_to_ebay" ? false : onlySellable,
        cost: costValue,
        seed: nextRound - 1,
        excludeAsins: [],
      });
      if (!found.ok) {
        setManualHits([]);
        setSources(null);
        setQueries([]);
        setError(found.error || "Amazon search failed.");
        return;
      }
      setManualHits(found.products.slice(0, limit));
      setSources(found.sources);
      setQueries(found.queries);
      setPicked([]);
    } catch (err) {
      setManualHits([]);
      setError(err instanceof Error ? err.message : "Amazon search failed.");
    } finally {
      setSearching(false);
    }
  };

  const importSelected = async () => {
    if (locked || !selected.length) return;
    setImporting(true);
    setError(null);
    try {
      const ok = await onImport(
        selected.map((hit) => hit.asin),
        mode,
        selected.map((hit) => ({
          asin: hit.asin,
          title: hit.title,
          brand: hit.brand,
          imageUrl: hit.imageUrl,
          amazonPrice: hit.amazonPrice,
          ebayPrice: hit.ebayActiveMedian ?? hit.ebayPrice,
        })),
      );
      if (ok !== false) {
        const taken = new Set(selected.map((hit) => hit.asin));
        setLiveHits((prev) => prev.filter((hit) => !taken.has(hit.asin)));
        setManualHits((prev) => prev.filter((hit) => !taken.has(hit.asin)));
        setPicked([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Amazon import failed.");
    } finally {
      setImporting(false);
    }
  };

  const toggleAsin = (asin: string) => {
    setPicked((prev) =>
      prev.includes(asin) ? prev.filter((id) => id !== asin) : [...prev, asin],
    );
  };

  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-[#707070]">
        Channel
      </p>
      <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
        {OPPORTUNITY_MODES.map((row) => {
          const on = mode === row.id;
          return (
            <button
              key={row.id}
              type="button"
              disabled={locked}
              onClick={() => chooseMode(row.id)}
              className={cn(
                "px-3 py-2.5 text-left transition",
                on
                  ? "bg-[#141414] text-white"
                  : "border border-[#ccc] bg-white text-[#141414] hover:border-[#141414]",
              )}
            >
              <span className="block text-[13px] font-medium">{row.label}</span>
              <span
                className={cn(
                  "mt-1 block text-[11px] leading-snug",
                  on ? "text-white/75" : "text-[#707070]",
                )}
              >
                {row.from} → {row.to}
              </span>
            </button>
          );
        })}
      </div>
      {activeMode ? (
        <p className="mt-2 text-[13px] text-[#707070]">{activeMode.hint}</p>
      ) : null}

      <div className="mt-3 flex gap-4 text-[13px]">
        <button
          type="button"
          disabled={locked}
          onClick={() => {
            setView("live");
            setLiveOn(true);
            setPicked([]);
            setError(null);
          }}
          className={cn(
            "border-b pb-1",
            view === "live"
              ? "border-[#141414] font-medium text-[#141414]"
              : "border-transparent text-[#707070]",
          )}
        >
          Live scan
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={() => {
            setView("manual");
            setLiveOn(false);
            setSearching(false);
            setPicked([]);
            setError(null);
          }}
          className={cn(
            "border-b pb-1",
            view === "manual"
              ? "border-[#141414] font-medium text-[#141414]"
              : "border-transparent text-[#707070]",
          )}
        >
          Manual search
        </button>
      </div>

      {view === "live" ? (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={locked}
              onClick={() => setLiveOn((on) => !on)}
              className="h-11 bg-[#141414] px-5 text-[14px] font-medium text-white disabled:opacity-40"
            >
              {liveOn ? "Stop live scan" : "Start live scan"}
            </button>
            {needsCost ? (
              <input
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="Your cost $"
                inputMode="decimal"
                disabled={locked}
                className="h-11 w-28 border border-[#ccc] bg-white px-3 text-[14px] outline-none focus:border-[#141414] disabled:opacity-60"
              />
            ) : null}
          </div>
          <div
            className="relative mt-3 overflow-hidden border border-[#141414] bg-[#111] text-white"
            aria-live="polite"
          >
            {liveOn && !reduce ? (
              <motion.span
                className="pointer-events-none absolute inset-y-0 w-1/3 bg-[#f4c928]/10"
                animate={{ left: ["-33%", "100%"] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
              />
            ) : null}
            <div className="relative grid gap-4 px-4 py-5 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[#f4c928]">
                  {liveOn ? (
                    <>
                      <span className="relative flex size-2">
                        <span className="absolute inset-0 animate-ping bg-[#f4c928]/50" />
                        <span className="relative size-2 bg-[#f4c928]" />
                      </span>
                      <Loader2 className="size-3.5 animate-spin text-[#f4c928]" />
                      Analyzing live
                    </>
                  ) : (
                    "Live scan stopped"
                  )}
                </p>
                <p className="mt-1 text-[26px] font-semibold tracking-tight text-white">
                  {liveOn ? scanLabel : "Start live scan to keep finding winners"}
                </p>
                <p className="mt-0.5 text-[13px] text-white/60">
                  {liveOn
                    ? queries.length
                      ? `Now reading ${queries.join(" · ")}`
                      : "Opening Amazon and eBay asking prices"
                    : "Products stay in the list until you import them."}
                </p>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#f4c928]">
                  Session spread
                </p>
                <MoneyTicker
                  value={sessionProfit}
                  className="mt-0.5 block text-[40px] font-semibold leading-none text-[#f4c928]"
                />
                <p className="mt-1 text-[12px] text-white/55">
                  {hits.length} opportunit{hits.length === 1 ? "y" : "ies"} on the board
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            void searchManual();
          }}
        >
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-[#707070]">
              Product name, ASIN, or Amazon link
            </span>
            <input
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="cable organizer, B0XXXXXXXXX, or https://www.amazon.com/dp/…"
              disabled={locked || searching}
              className="h-12 w-full border border-[#ccc] bg-white px-3 text-[15px] outline-none focus:border-[#141414] disabled:opacity-60"
            />
          </label>
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_88px_auto]">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-[#707070]">
                Category
              </span>
              <select
                value={categoryId}
                disabled={locked || searching}
                onChange={(e) => setCategoryId(e.target.value)}
                className="h-11 w-full border border-[#ccc] bg-white px-3 text-[14px] outline-none focus:border-[#141414] disabled:opacity-60"
              >
                <option value="">Choose a category</option>
                {AMAZON_WINNER_CATEGORIES.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-[#707070]">
                How many
              </span>
              <select
                value={limit}
                disabled={locked || searching}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="h-11 w-full border border-[#ccc] bg-white px-3 text-[14px] outline-none focus:border-[#141414] disabled:opacity-60"
              >
                {AMAZON_WINNER_LIMITS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end gap-2">
              {needsCost ? (
                <input
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="Your cost $"
                  inputMode="decimal"
                  disabled={locked || searching}
                  className="h-11 w-28 border border-[#ccc] bg-white px-3 text-[14px] outline-none focus:border-[#141414] disabled:opacity-60"
                />
              ) : null}
              <button
                type="submit"
                disabled={locked || searching || !canManualSearch}
                className="h-11 shrink-0 bg-[#141414] px-5 text-[14px] font-medium text-white disabled:opacity-40"
              >
                {searching ? "Searching…" : "Find opportunities"}
              </button>
            </div>
          </div>
        </form>
      )}

      {mode === "supplier" ? (
        <label className="mt-2 flex items-center gap-2 text-[13px] text-[#141414]">
          <input
            type="checkbox"
            checked={onlySellable}
            disabled={locked}
            onChange={(e) => setOnlySellable(e.target.checked)}
            className="size-4 accent-[#141414]"
          />
          Only show products I can sell on Amazon
        </label>
      ) : mode === "amazon" ? (
        <p className="mt-2 text-[12px] text-[#707070]">
          Restricted brands for your Amazon account are hidden automatically.
        </p>
      ) : (
        <p className="mt-2 text-[12px] text-[#707070]">
          This path buys on Amazon as a shopper. eBay figures are active
          listings, not sold. We keep every real spread on the board.
        </p>
      )}

      <p className="mt-2 text-[12px] text-[#707070]">
        {mode === "amazon_to_ebay" ? (
          <>
            Connect{" "}
            <a href="/settings#ebay-store" className="underline underline-offset-2">
              eBay
            </a>{" "}
            for live asking prices.
          </>
        ) : mode === "amazon" ? (
          <>
            Connect{" "}
            <a
              href="/settings#amazon-store"
              className="underline underline-offset-2"
            >
              Amazon
            </a>{" "}
            so Higlou can check authorization and fees.
          </>
        ) : (
          <>
            Connect{" "}
            <a
              href="/settings#amazon-store"
              className="underline underline-offset-2"
            >
              Amazon
            </a>{" "}
            and{" "}
            <a href="/settings#ebay-store" className="underline underline-offset-2">
              eBay
            </a>
            .
          </>
        )}{" "}
        Add <span className="font-medium">KEEPA_API_KEY</span> on the server for
        live BSR and sales history. Keepa is not connected until that key is set.
      </p>

      {error ? (
        <p className="mt-2 text-[13px] text-destructive">{error}</p>
      ) : null}

      {view === "live" && liveOn && !hits.length ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((slot) => (
            <div
              key={slot}
              className="relative h-[260px] overflow-hidden rounded-2xl border border-[#ececec] bg-white"
            >
              <motion.span
                className="absolute inset-0 bg-gradient-to-r from-transparent via-[#f4f4f4] to-transparent"
                animate={reduce ? undefined : { x: ["-100%", "100%"] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "linear", delay: slot * 0.18 }}
              />
              <p className="absolute bottom-3 left-3 text-[12px] text-[#8a8a8a]">
                Waiting for a winner
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {hits.length ? (
        <div className="mt-4">
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-[#707070]">
                {view === "live" ? "Live opportunities" : activeMode?.to}
              </p>
              <p className="mt-0.5 text-[12px] text-[#707070]">
                {hits.length} opportunit{hits.length === 1 ? "y" : "ies"}
                {view === "live" ? " found so far" : ` for ${activeMode?.label}`}
                {mode !== "amazon" && sources?.ebayLive
                  ? ". eBay figures are active listings, not sold."
                  : ""}
              </p>
              {sources && !sources.keepa ? (
                <p className="mt-1.5 border border-[#e5e5e5] bg-[#fafafa] px-2 py-1.5 text-[12px] text-[#141414]">
                  Keepa is not connected. Live scan rotates product types across
                  categories
                  {queries.length ? ` · now: ${queries.join(", ")}` : ""}.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              disabled={locked}
              onClick={() =>
                setPicked(
                  picked.length === hits.length
                    ? []
                    : hits.map((hit) => hit.asin),
                )
              }
              className="text-[12px] font-medium text-[#141414] underline-offset-2 hover:underline"
            >
              {picked.length === hits.length ? "Clear" : "Select all"}
            </button>
          </div>
          <ul className="mt-3 grid max-h-[46rem] grid-cols-1 gap-4 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence initial={false}>
              {hits.map((hit) => (
                <WinnerCard
                  key={hit.asin}
                  hit={hit}
                  mode={mode}
                  checked={picked.includes(hit.asin)}
                  fresh={freshAsins.includes(hit.asin)}
                  locked={locked}
                  onToggle={() => toggleAsin(hit.asin)}
                />
              ))}
            </AnimatePresence>
          </ul>
          <div className="sticky bottom-0 z-10 mt-3 border border-[#141414] bg-[#111] p-3 text-white">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <p className="text-[12px] text-white/60">
                {selected.length
                  ? `${selected.length} selected`
                  : "Tap a card to add it. Import when you are ready."}
              </p>
              {selected.length ? (
                <MoneyTicker
                  value={selectedProfit}
                  className="text-[22px] font-semibold text-[#f4c928]"
                />
              ) : null}
            </div>
            <button
              type="button"
              disabled={locked || !selected.length}
              onClick={() => void importSelected()}
              className="h-12 w-full bg-[#f4c928] text-[15px] font-semibold text-[#141414] disabled:opacity-40"
            >
              {importActionLabel(mode, selected.length, importing)}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
