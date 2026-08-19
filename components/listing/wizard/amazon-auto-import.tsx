"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { AMAZON_WINNER_CATEGORIES, AMAZON_WINNER_LIMITS } from "@/lib/amazon/winner-categories";
import {
  importActionLabel,
  OPPORTUNITY_MODES,
} from "@/lib/opportunity/mode-copy";
import {
  mergeOpportunityHits,
  nextLiveScanTarget,
  recordNicheLearn,
} from "@/lib/opportunity/niches";
import { estimateNetProfit, estimatedKeepAmount, sessionKeepAmount } from "@/lib/opportunity/profit";
import type {
  OpportunityMode,
  OpportunityProduct,
} from "@/lib/opportunity/types";
import { isConfirmedOpportunity } from "@/lib/opportunity/score";
import {
  loadLocalLedger,
  pullRemoteLedger,
  pushRemoteLedger,
  saveLocalLedger,
  type NicheLearnRow,
} from "@/lib/opportunity/ledger";
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
  analyzed?: number;
};

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
  if (mode === "amazon_to_ebay") {
    return "Verify sales → Calculate landed cost → Buy inventory → Inspect → Publish";
  }
  if (hit.eligibility === "SELLABLE") return "Your Amazon account can sell this";
  if (hit.eligibility === "APPROVAL_REQUIRED") return "Needs Amazon approval";
  if (hit.eligibility === "RESTRICTED") return "Blocked for your Amazon account";
  if (hit.eligibility === "CONDITION_RESTRICTED") return "Wrong condition";
  return "Connect Amazon to confirm you can sell";
}

function keepFor(hit: OpportunityProduct, mode: OpportunityMode) {
  return estimatedKeepAmount({ ...hit, mode });
}

function sessionKeep(hit: OpportunityProduct, mode: OpportunityMode) {
  return sessionKeepAmount({ ...hit, mode });
}

function heroFor(hit: OpportunityProduct, mode: OpportunityMode) {
  const ebay = hit.ebayActiveMedian ?? hit.ebayPrice;
  if (mode !== "amazon" && !hit.soldVerified) {
    return {
      kicker: "Est. eBay profit",
      value: "Unverified",
      amount: null as number | null,
      detail: `CANDIDATE — SALES NOT VERIFIED · Amazon ${money(hit.amazonPrice)} → eBay ask ${money(ebay)}`,
    };
  }
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
  if (mode !== "amazon" && !hit.soldVerified) {
    chips.push("CANDIDATE — SALES NOT VERIFIED");
  }
  if (hit.verdict === "winner") chips.push("Winner");
  const keep = hit.soldVerified ? keepFor(hit, mode) : null;
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
    ["Est. eBay profit", hit.soldVerified ? money(hit.netProfit) : "Unverified"],
    ["ROI", hit.soldVerified ? pct(hit.roi) : "—"],
    ["Sold 30/90", `${hit.sold30d ?? "—"} / ${hit.sold90d ?? "—"}`],
    ["Competitors", hit.ebayActiveCount != null ? String(hit.ebayActiveCount) : "—"],
    ["Sell-through", pct(hit.sellThrough90)],
    ["Conservative sold", money(hit.expectedSalePrice)],
    ["Landed cost", money(hit.landedCost)],
    ["Shipping", money(hit.shipping)],
    ["Fees", money(hit.ebayFees)],
    ["Return reserve", money(hit.returnsReserve)],
    ["Net profit", money(hit.netProfit)],
    ["Days to sell", hit.daysToSell != null ? String(hit.daysToSell) : "—"],
    ["Identity", `${hit.identityConfidence || 0}%`],
    ["Policy risk", hit.policyRisk || "—"],
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

function sessionStats(hits: OpportunityProduct[], mode: OpportunityMode) {
  const keeps = hits
    .map((hit) => sessionKeep(hit, mode))
    .filter((n): n is number => n != null && Number.isFinite(n));
  const payday = keeps.filter((n) => n >= 10).length;
  const thin = hits.filter(
    (hit) => hit.ebayActiveCount != null && hit.ebayActiveCount <= 6,
  ).length;
  const avgKeep = keeps.length
    ? keeps.reduce((sum, n) => sum + n, 0) / keeps.length
    : 0;
  const avgScore = hits.length
    ? Math.round(hits.reduce((sum, hit) => sum + hit.score, 0) / hits.length)
    : 0;
  return { payday, thin, avgKeep, avgScore };
}

function KeepSpark({
  hits,
  mode,
}: {
  hits: OpportunityProduct[];
  mode: OpportunityMode;
}) {
  const values = hits.map((hit) => sessionKeep(hit, mode) ?? 0).slice(0, 28);
  const max = Math.max(8, ...values, 1);
  if (!values.length) {
    return (
      <div className="flex h-10 items-end gap-px">
        {Array.from({ length: 18 }, (_, i) => (
          <span
            key={i}
            className="flex-1 bg-[#3d4c5f]"
            style={{ height: `${10 + ((i * 17) % 55)}%` }}
          />
        ))}
      </div>
    );
  }
  return (
    <div className="flex h-10 items-end gap-px">
      {values.map((value, i) => (
        <span
          key={`${i}-${value}`}
          className="flex-1 bg-[#f4c928]"
          style={{ height: `${Math.max(8, Math.round((value / max) * 100))}%` }}
        />
      ))}
    </div>
  );
}

function WinnerRow({
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
  const chips = dealChips(hit, mode);
  const fill = spreadPct(hit.amazonPrice, ebay);
  const bsr =
    hit.salesRank && hit.salesRankLabel !== "Amazon search"
      ? `#${hit.salesRank.toLocaleString()}`
      : "—";

  return (
    <tr
      className={cn(
        "border-b border-[#e3e6e6] text-[13px] text-[#0f1111]",
        checked ? "bg-[#fff8d6]" : "bg-white hover:bg-[#f7fafa]",
        fresh ? "shadow-[inset_3px_0_0_#f4c928]" : "",
      )}
    >
      <td className="w-10 px-3 py-2.5">
        <input
          type="checkbox"
          checked={checked}
          disabled={locked}
          onChange={onToggle}
          className="size-4 accent-[#232f3e]"
        />
      </td>
      <td className="w-14 py-2">
        {hit.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hit.imageUrl}
            alt=""
            className="size-11 border border-[#e3e6e6] bg-white object-contain p-0.5"
          />
        ) : (
          <span className="block size-11 bg-[#f3f3f3]" />
        )}
      </td>
      <td className="max-w-[320px] py-2 pr-3">
        <p className="line-clamp-2 font-medium leading-snug">
          {toEbayListingTitle(hit.title) || hit.asin}
        </p>
        <p className="mt-0.5 truncate font-mono text-[11px] text-[#565959]">
          {hit.asin}
          {hit.brand ? ` · ${hit.brand}` : ""}
          {fresh ? " · Just found" : ""}
        </p>
        {mode !== "amazon" ? (
          <p className="mt-1 text-[11px] leading-snug text-[#565959]">
            Sold 30/90 {hit.sold30d ?? "—"}/{hit.sold90d ?? "—"} · STR{" "}
            {pct(hit.sellThrough90)} · Identity {hit.identityConfidence || 0}% ·{" "}
            {hit.policyRisk || "low"} risk
          </p>
        ) : null}
        <p className="sr-only">
          {metricsFor(hit, mode)
            .map(([label, value]) => `${label} ${value}`)
            .join(". ")}
          {eligibilityCopy(hit, mode)}. {hero.kicker}. {dealLine(hit, mode)}.{" "}
          {proofLine(hit)}
        </p>
      </td>
      <td className="whitespace-nowrap px-2 tabular-nums">{money(hit.amazonPrice)}</td>
      <td className="whitespace-nowrap px-2 tabular-nums">{money(ebay)}</td>
      <td className="w-28 px-2">
        <span className="block h-1.5 overflow-hidden bg-[#e3e6e6]">
          <span
            className="block h-full bg-[#f4c928]"
            style={{ width: `${Math.max(6, fill)}%` }}
          />
        </span>
        <span className="mt-0.5 block text-[11px] tabular-nums text-[#565959]">
          {fill}% spread
        </span>
      </td>
      <td className="whitespace-nowrap px-2 font-semibold tabular-nums">
        {hero.amount != null ? (
          <MoneyTicker value={hero.amount} className="text-[#0f1111]" />
        ) : (
          <span className="text-[#565959]">{hero.value === "Unverified" ? "Unverified" : "Scoring"}</span>
        )}
      </td>
      <td className="whitespace-nowrap px-2 tabular-nums">
        {hit.soldVerified ? pct(hit.roi) : "—"}
      </td>
      <td className="whitespace-nowrap px-2 tabular-nums text-[#565959]">{bsr}</td>
      <td className="whitespace-nowrap px-2 tabular-nums">
        {hit.ebayActiveCount ?? "—"}
      </td>
      <td className="whitespace-nowrap px-2 tabular-nums">{hit.score}</td>
      <td className="px-2 py-2">
        <span className="flex flex-wrap gap-1">
          {chips.map((chip) => (
            <span
              key={chip}
              className="bg-[#232f3e] px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-[#f4c928] uppercase"
            >
              {chip}
            </span>
          ))}
        </span>
      </td>
    </tr>
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
  analyzed: number;
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
    ok: Boolean(response.ok && body && (body.ok === true || Array.isArray(body.products))),
    error: body?.error || (response.ok ? "" : "Amazon search failed."),
    products: (body?.products || []).filter((hit) =>
      isConfirmedOpportunity(hit, payload.mode),
    ),
    sources: body?.sources || null,
    queries: body?.queries || [],
    analyzed: Number(body?.analyzed) || (body?.products?.length ?? 0),
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
  const [scanLog, setScanLog] = useState<
    Array<{ t: number; label: string; query: string; found: number; analyzed: number }>
  >([]);
  const [learn, setLearn] = useState<NicheLearnRow[]>([]);
  const [analyzedTotal, setAnalyzedTotal] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const liveHitsRef = useRef<OpportunityProduct[]>([]);
  const liveOnRef = useRef(true);
  const modeRef = useRef(mode);
  const costRef = useRef<number | undefined>(undefined);
  const onlySellableRef = useRef(onlySellable);
  const learnRef = useRef<NicheLearnRow[]>([]);

  const activeMode = OPPORTUNITY_MODES.find((row) => row.id === mode);
  const locked = busy || importing;
  const hits = (view === "live" ? liveHits : manualHits).filter((hit) =>
    isConfirmedOpportunity(hit, mode),
  );
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
    () => hits.reduce((sum, hit) => sum + (sessionKeep(hit, mode) ?? 0), 0),
    [hits, mode],
  );
  const selectedProfit = useMemo(
    () => selected.reduce((sum, hit) => sum + (sessionKeep(hit, mode) ?? 0), 0),
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
    learnRef.current = learn;
  }, [learn]);

  useEffect(() => {
    const local = loadLocalLedger(mode);
    setLiveHits(
      local.hits.filter((hit) => isConfirmedOpportunity(hit, mode)),
    );
    setLearn(local.learn);
    setAnalyzedTotal(local.analyzed);
    setHydrated(true);
    void pullRemoteLedger(mode).then((remote) => {
      if (!remote) return;
      if (remote.hits.length) {
        setLiveHits((prev) => mergeOpportunityHits(prev, remote.hits));
      }
      if (remote.learn.length) setLearn(remote.learn);
    });
    // Load once per channel; chooseMode reloads when the seller switches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const ledger = {
      mode,
      hits: liveHits,
      learn,
      analyzed: analyzedTotal,
      updatedAt: Date.now(),
    };
    saveLocalLedger(ledger);
    const timer = window.setTimeout(() => void pushRemoteLedger(ledger), 900);
    return () => window.clearTimeout(timer);
  }, [hydrated, liveHits, learn, mode, analyzedTotal]);

  useEffect(() => {
    if (view !== "live" || !liveOn) return;
    let cancelled = false;
    const wait = (ms: number) =>
      new Promise((resolve) => window.setTimeout(resolve, ms));

    void (async () => {
      let step = scanStep;
      while (!cancelled && liveOnRef.current) {
        const saved = liveHitsRef.current;
        const refresh = step % 4 === 3 && saved.length > 0;
        const target = refresh
          ? {
              categoryId: "",
              label: "Re-check saved",
              seed: 0,
              query: saved[step % saved.length].asin,
            }
          : nextLiveScanTarget(step, learnRef.current);
        setScanLabel(target.label);
        setQueries([target.query]);
        setSearching(true);
        setError(null);
        let pauseMs = 3200;
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
            excludeAsins: refresh
              ? []
              : liveHitsRef.current.map((hit) => hit.asin).slice(0, 80),
          });
          if (cancelled || !liveOnRef.current) break;
          if (found.ok) {
            const seen = new Set(liveHitsRef.current.map((hit) => hit.asin));
            const fresh = found.products.filter((hit) => !seen.has(hit.asin));
            setFreshAsins(fresh.map((hit) => hit.asin));
            if (found.products.length) {
              setLiveHits((prev) => mergeOpportunityHits(prev, found.products));
            }
            setSources(found.sources);
            setQueries(found.queries.length ? found.queries : [target.query]);
            setAnalyzedTotal((n) => n + (found.analyzed || found.products.length));
            const bestKeep = found.products.reduce(
              (max, hit) => Math.max(max, sessionKeep(hit, modeRef.current) ?? 0),
              0,
            );
            if (!refresh) {
              setLearn((prev) =>
                recordNicheLearn(prev, {
                  query: target.query,
                  categoryId: target.categoryId,
                  confirmed: found.products.length,
                  bestKeep,
                }),
              );
            }
            setScanLog((prev) =>
              [
                {
                  t: Date.now(),
                  label: target.label,
                  query: target.query,
                  found: found.products.length,
                  analyzed: found.analyzed,
                },
                ...prev,
              ].slice(0, 14),
            );
            if (found.products.length) pauseMs = 2200;
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
        await wait(pauseMs);
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
    const saved = loadLocalLedger(next);
    setLiveHits(saved.hits.filter((hit) => isConfirmedOpportunity(hit, next)));
    setLearn(saved.learn);
    setAnalyzedTotal(saved.analyzed);
    setManualHits([]);
    setPicked([]);
    setSources(null);
    setQueries([]);
    setError(null);
    setScanStep(0);
    setScanLog([]);
    if (next === "amazon") setOnlySellable(true);
    void pullRemoteLedger(next).then((remote) => {
      if (!remote?.hits.length) return;
      setLiveHits((prev) => mergeOpportunityHits(prev, remote.hits));
    });
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

  const stats = sessionStats(hits, mode);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-[#eaeded]">
      <div className="shrink-0 bg-[#232f3e] text-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
          {OPPORTUNITY_MODES.map((row) => {
            const on = mode === row.id;
            return (
              <button
                key={row.id}
                type="button"
                disabled={locked}
                onClick={() => chooseMode(row.id)}
                className={cn(
                  "h-8 px-3 text-[12px] font-medium",
                  on ? "bg-[#f4c928] text-[#141414]" : "bg-white/10 text-white hover:bg-white/15",
                )}
              >
                {row.label}
              </button>
            );
          })}
          <span className="hidden text-[12px] text-white/50 sm:inline">
            {activeMode ? `${activeMode.from} → ${activeMode.to}` : ""}
          </span>
          <span className="ml-auto flex gap-1">
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
                "h-8 px-3 text-[12px] font-medium",
                view === "live" ? "bg-white text-[#232f3e]" : "text-white/70 hover:text-white",
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
                "h-8 px-3 text-[12px] font-medium",
                view === "manual" ? "bg-white text-[#232f3e]" : "text-white/70 hover:text-white",
              )}
            >
              Manual search
            </button>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-7">
          <div className="bg-[#232f3e] px-3 py-2.5">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-[#f4c928] uppercase">
              Session spread
            </p>
            <MoneyTicker
              value={sessionProfit}
              className="mt-0.5 block text-[22px] font-semibold leading-none"
            />
          </div>
          <div className="bg-[#232f3e] px-3 py-2.5">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-[#f4c928] uppercase">
              Analyzed
            </p>
            <p className="mt-0.5 text-[22px] font-semibold leading-none tabular-nums">
              {analyzedTotal}
            </p>
          </div>
          <div className="bg-[#232f3e] px-3 py-2.5">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-[#f4c928] uppercase">
              On the board
            </p>
            <p className="mt-0.5 text-[22px] font-semibold leading-none tabular-nums">
              {hits.length}
            </p>
          </div>
          <div className="bg-[#232f3e] px-3 py-2.5">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-[#f4c928] uppercase">
              Avg keep
            </p>
            <p className="mt-0.5 text-[22px] font-semibold leading-none tabular-nums">
              {signedMoney(stats.avgKeep)}
            </p>
          </div>
          <div className="bg-[#232f3e] px-3 py-2.5">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-[#f4c928] uppercase">
              Paydays
            </p>
            <p className="mt-0.5 text-[22px] font-semibold leading-none tabular-nums">
              {stats.payday}
            </p>
          </div>
          <div className="bg-[#232f3e] px-3 py-2.5">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-[#f4c928] uppercase">
              Thin eBay
            </p>
            <p className="mt-0.5 text-[22px] font-semibold leading-none tabular-nums">
              {stats.thin}
            </p>
          </div>
          <div className="bg-[#232f3e] px-3 py-2.5">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-[#f4c928] uppercase">
              Avg score
            </p>
            <p className="mt-0.5 text-[22px] font-semibold leading-none tabular-nums">
              {stats.avgScore || "—"}
            </p>
          </div>
        </div>
        <div className="flex items-end gap-4 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-white/45 uppercase">
              Keep by ASIN
            </p>
            <KeepSpark hits={hits} mode={mode} />
          </div>
          {view === "live" ? (
            <div className="flex items-center gap-2 pb-0.5">
              <button
                type="button"
                disabled={locked}
                onClick={() => setLiveOn((on) => !on)}
                className="h-9 bg-[#f4c928] px-4 text-[13px] font-semibold text-[#141414] disabled:opacity-40"
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
                  className="h-9 w-28 border border-white/20 bg-[#1b2430] px-3 text-[13px] text-white outline-none placeholder:text-white/40"
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <p className="sr-only">Channel</p>
      {activeMode ? (
        <p className="sr-only">{activeMode.hint}</p>
      ) : null}
      {view === "manual" ? (
        <form
          className="border-b border-[#d5d9d9] bg-white px-3 py-3"
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
      ) : null}

      {mode === "supplier" ? (
        <label className="flex items-center gap-2 border-b border-[#d5d9d9] bg-white px-3 py-2 text-[12px] text-[#141414]">
          <input
            type="checkbox"
            checked={onlySellable}
            disabled={locked}
            onChange={(e) => setOnlySellable(e.target.checked)}
            className="size-4 accent-[#232f3e]"
          />
          Only show products I can sell on Amazon
        </label>
      ) : (
        <p className="border-b border-[#d5d9d9] bg-[#f3f3f3] px-3 py-1.5 text-[11px] text-[#565959]">
          {mode === "amazon"
            ? "Restricted brands for your Amazon account are hidden automatically."
            : "This path buys inventory on Amazon, then you inspect and publish on eBay. eBay figures are active listings, not sold. Session spread only counts verified sold comps."}{" "}
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
          {sources && !sources.keepa
            ? " Keepa is not connected. Live scan rotates product types across categories."
            : ""}
        </p>
      )}

      {error ? (
        <p className="mt-2 text-[13px] text-destructive">{error}</p>
      ) : null}

      <div className="mt-3 flex min-h-0 flex-1 overflow-hidden border border-[#d5d9d9] bg-white">
        <div className="min-w-0 flex-1 overflow-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead className="sticky top-0 z-[1] bg-[#f3f3f3] text-[11px] font-semibold tracking-wide text-[#565959] uppercase">
              <tr className="border-b border-[#d5d9d9]">
                <th className="w-10 px-3 py-2">
                  <button
                    type="button"
                    disabled={locked || !hits.length}
                    onClick={() =>
                      setPicked(
                        picked.length === hits.length
                          ? []
                          : hits.map((hit) => hit.asin),
                      )
                    }
                    className="text-[11px] font-semibold uppercase tracking-wide text-[#232f3e] underline-offset-2 hover:underline disabled:opacity-40"
                  >
                    {picked.length === hits.length && hits.length
                      ? "Clear"
                      : "Select all"}
                  </button>
                </th>
                <th className="w-14 py-2" />
                <th className="py-2 pr-3">Product</th>
                <th className="px-2 py-2">Amazon</th>
                <th className="px-2 py-2">eBay</th>
                <th className="px-2 py-2">Spread</th>
                <th className="px-2 py-2">You keep</th>
                <th className="px-2 py-2">ROI</th>
                <th className="px-2 py-2">BSR</th>
                <th className="px-2 py-2">eBay n</th>
                <th className="px-2 py-2">Score</th>
                <th className="px-2 py-2">Flags</th>
              </tr>
            </thead>
            <tbody>
              {hits.length ? (
                hits.map((hit) => (
                  <WinnerRow
                    key={hit.asin}
                    hit={hit}
                    mode={mode}
                    checked={picked.includes(hit.asin)}
                    fresh={freshAsins.includes(hit.asin)}
                    locked={locked}
                    onToggle={() => toggleAsin(hit.asin)}
                  />
                ))
              ) : (
                <tr className="border-b border-[#e3e6e6] bg-white">
                  <td className="px-4 py-8" colSpan={12}>
                    <p className="text-[15px] font-semibold text-[#0f1111]">
                      {liveOn && view === "live"
                        ? `Analyzing ${scanLabel.toLowerCase()} — candidates need verified sold comps`
                        : "No saved opportunities yet"}
                    </p>
                    <p className="mt-1 max-w-xl text-[13px] text-[#565959]">
                      {scanLog[0]
                        ? `${scanLog[0].query}: ${scanLog[0].analyzed || 0} scored, ${scanLog[0].found} priced on Amazon and eBay. Active asks are not sold.`
                        : "Higlou finds Amazon discounts, then checks eBay competition. Until Marketplace Insights is connected, cards stay CANDIDATE — SALES NOT VERIFIED and Session spread stays at $0."}
                    </p>
                    {liveOn && view === "live" && !reduce ? (
                      <p className="mt-3 text-[12px] text-[#8a8a8a]">
                        Scoring {scanLabel.toLowerCase()}…
                      </p>
                    ) : null}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <aside className="hidden w-[260px] shrink-0 border-l border-[#d5d9d9] bg-[#232f3e] text-white xl:flex xl:flex-col">
          <div className="relative overflow-hidden border-b border-white/10 px-3 py-3">
            {liveOn && view === "live" && !reduce ? (
              <motion.span
                className="pointer-events-none absolute inset-y-0 w-1/2 bg-[#f4c928]/10"
                animate={{ left: ["-50%", "100%"] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
              />
            ) : null}
            <p className="relative flex items-center gap-2 text-[10px] font-semibold tracking-[0.16em] text-[#f4c928] uppercase">
              {liveOn && view === "live" ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Analyzing live
                </>
              ) : (
                "Scan log"
              )}
            </p>
            <p className="relative mt-1 text-[15px] font-semibold leading-tight">
              {liveOn && view === "live"
                ? scanLabel
                : "Start live scan to keep finding winners"}
            </p>
            <p className="relative mt-1 text-[11px] text-white/55">
              {liveOn && view === "live"
                ? queries.length
                  ? `Now reading ${queries.join(" · ")}`
                  : "Opening Amazon and eBay asking prices"
                : "Products stay in the list until you import them."}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
            {scanLog.length ? (
              scanLog.map((row) => (
                <div
                  key={`${row.t}-${row.query}`}
                  className="border-b border-white/10 py-2"
                >
                  <p className="text-[11px] font-medium text-[#f4c928]">{row.label}</p>
                  <p className="truncate text-[12px] text-white/80">{row.query}</p>
                  <p className="text-[11px] text-white/45">
                    {row.analyzed || 0} scored · {row.found} real keep
                  </p>
                </div>
              ))
            ) : (
              <p className="pt-2 text-[12px] text-white/45">
                Live scan rotates product types across categories. Rows fill as
                Amazon and eBay prices land.
              </p>
            )}
          </div>
        </aside>
      </div>

      <div className="sticky bottom-0 z-10 mt-0 border-t border-[#141414] bg-[#111] p-3 text-white">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="text-[12px] text-white/60">
            {selected.length
              ? `${selected.length} selected · Live opportunities`
              : hits.length
                ? `${hits.length} opportunit${hits.length === 1 ? "y" : "ies"} on the board. Check a row to import.`
                : "Inventory table fills while Analyzing live."}
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
  );
}
