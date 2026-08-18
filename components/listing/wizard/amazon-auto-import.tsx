"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { AMAZON_WINNER_CATEGORIES, AMAZON_WINNER_LIMITS } from "@/lib/amazon/winner-categories";
import {
  importActionLabel,
  OPPORTUNITY_MODES,
  searchStepsFor,
} from "@/lib/opportunity/mode-copy";
import { estimateNetProfit } from "@/lib/opportunity/profit";
import type {
  OpportunityMode,
  OpportunityProduct,
} from "@/lib/opportunity/types";
import { cn } from "@/lib/utils";

type WinnerSources = {
  keepa?: boolean;
  amazonCatalog?: boolean;
  amazonFees?: boolean;
  ebayLive?: boolean;
};

function money(n: number | null | undefined) {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

function pct(n: number | null | undefined) {
  if (n == null) return "—";
  return `${Math.round(n * 100)}%`;
}

function eligibilityCopy(hit: OpportunityProduct, mode: OpportunityMode) {
  if (mode === "amazon_to_ebay") return "Buy on Amazon · list on eBay";
  if (hit.eligibility === "SELLABLE") return "Your Amazon account can sell this";
  if (hit.eligibility === "APPROVAL_REQUIRED") return "Needs Amazon approval";
  if (hit.eligibility === "RESTRICTED") return "Blocked for your Amazon account";
  if (hit.eligibility === "CONDITION_RESTRICTED") return "Wrong condition";
  return "Connect Amazon to confirm you can sell";
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#eee] bg-[#fafafa] px-2 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-[#707070]">
        {label}
      </p>
      <p className="mt-0.5 truncate text-[13px] font-medium tabular-nums text-[#141414]">
        {value}
      </p>
    </div>
  );
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

export function AmazonAutoImportPanel({
  busy = false,
  onImport,
}: {
  busy?: boolean;
  onImport: (
    asins: string[],
    mode: OpportunityMode,
  ) => Promise<boolean | void>;
}) {
  const [categoryId, setCategoryId] = useState("");
  const [extra, setExtra] = useState("");
  const [limit, setLimit] = useState(5);
  const [mode, setMode] = useState<OpportunityMode>("amazon_to_ebay");
  const [onlySellable, setOnlySellable] = useState(true);
  const [cost, setCost] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchStep, setSearchStep] = useState(0);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<OpportunityProduct[]>([]);
  const [sources, setSources] = useState<WinnerSources | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  const steps = searchStepsFor(mode);
  const activeMode = OPPORTUNITY_MODES.find((row) => row.id === mode);
  const disabled = busy || searching || importing;
  const canSearch = Boolean(categoryId || extra.trim().length >= 2);
  const selected = useMemo(
    () => hits.filter((hit) => picked.includes(hit.asin)),
    [hits, picked],
  );
  const supplierCost = Number(cost);
  const costValue =
    Number.isFinite(supplierCost) && supplierCost > 0 ? supplierCost : undefined;
  const needsCost = mode === "amazon" || mode === "supplier";

  useEffect(() => {
    if (!searching) {
      setSearchStep(0);
      return;
    }
    setSearchStep(0);
    const timer = window.setInterval(() => {
      setSearchStep((step) => Math.min(step + 1, steps.length - 1));
    }, 2200);
    return () => window.clearInterval(timer);
  }, [searching, steps.length]);

  const chooseMode = (next: OpportunityMode) => {
    setMode(next);
    setHits([]);
    setPicked([]);
    setSources(null);
    setError(null);
    if (next === "amazon") setOnlySellable(true);
  };

  const search = async () => {
    if (disabled || !canSearch) return;
    setSearching(true);
    setHits([]);
    setSources(null);
    setPicked([]);
    setError(null);
    try {
      const response = await fetch("/api/amazon/auto-import/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: extra.trim(),
          categoryId,
          limit,
          mode,
          onlySellable: mode === "amazon_to_ebay" ? false : onlySellable,
          cost: costValue,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        products?: OpportunityProduct[];
        sources?: WinnerSources;
      } | null;
      if (!response.ok || !body?.ok || !body.products?.length) {
        setHits([]);
        setSources(null);
        setError(body?.error || "Amazon search failed.");
        return;
      }
      setHits(body.products.slice(0, limit));
      setSources(body.sources || null);
    } catch (err) {
      setHits([]);
      setSources(null);
      setError(err instanceof Error ? err.message : "Amazon search failed.");
    } finally {
      setSearching(false);
    }
  };

  const importSelected = async () => {
    if (disabled || !selected.length) return;
    setImporting(true);
    setError(null);
    try {
      const ok = await onImport(
        selected.map((hit) => hit.asin),
        mode,
      );
      if (ok !== false) {
        setHits([]);
        setSources(null);
        setPicked([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Amazon import failed.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="mt-3 border-t border-[#e5e5e5] pt-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[#707070]">
        1. Choose the channel
      </p>
      <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
        {OPPORTUNITY_MODES.map((row) => {
          const on = mode === row.id;
          return (
            <button
              key={row.id}
              type="button"
              disabled={disabled}
              onClick={() => chooseMode(row.id)}
              className={cn(
                "px-3 py-2.5 text-left",
                on
                  ? "bg-[#141414] text-white"
                  : "border border-[#ccc] bg-white text-[#141414]",
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

      <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-[#707070]">
        2. Category and count
      </p>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-[1fr_88px]">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-[#707070]">
            Category
          </span>
          <select
            value={categoryId}
            disabled={disabled}
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
            disabled={disabled}
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
      </div>

      <div className="mt-2 flex gap-2">
        <input
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          placeholder="Optional: organizer, nailer, B0…"
          disabled={disabled}
          className="h-11 min-w-0 flex-1 border border-[#ccc] bg-white px-3 text-[14px] outline-none focus:border-[#141414] disabled:opacity-60"
        />
        {needsCost ? (
          <input
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="Your cost $"
            inputMode="decimal"
            disabled={disabled}
            className="h-11 w-28 shrink-0 border border-[#ccc] bg-white px-3 text-[14px] outline-none focus:border-[#141414] disabled:opacity-60"
          />
        ) : null}
        <button
          type="button"
          disabled={disabled || !canSearch}
          onClick={() => void search()}
          className="h-11 shrink-0 bg-[#141414] px-5 text-[14px] font-medium text-white disabled:opacity-40"
        >
          {searching ? "Searching…" : "Find opportunities"}
        </button>
      </div>

      {mode === "supplier" ? (
        <label className="mt-2 flex items-center gap-2 text-[13px] text-[#141414]">
          <input
            type="checkbox"
            checked={onlySellable}
            disabled={disabled}
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
          listings, not sold.
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
        history and BSR.
      </p>

      {error ? (
        <p className="mt-2 text-[13px] text-destructive">{error}</p>
      ) : null}

      {searching ? (
        <div
          className="mt-3 border border-[#e5e5e5] bg-white p-3"
          aria-live="polite"
        >
          <p className="text-[13px] font-medium text-[#141414]">
            {activeMode?.label}: searching
          </p>
          <p className="mt-0.5 text-[12px] text-[#707070]">
            {activeMode?.hint}
          </p>
          <div className="mt-3 h-0.5 w-full bg-[#eee]">
            <div
              className="h-full bg-[#141414] transition-all duration-700"
              style={{
                width: `${((searchStep + 1) / steps.length) * 100}%`,
              }}
            />
          </div>
          <ol className="mt-3 grid gap-1.5">
            {steps.map((label, index) => {
              const done = index < searchStep;
              const active = index === searchStep;
              return (
                <li
                  key={label}
                  className={cn(
                    "flex items-center gap-2 text-[13px]",
                    active
                      ? "font-medium text-[#141414]"
                      : done
                        ? "text-[#141414]"
                        : "text-[#a3a3a3]",
                  )}
                >
                  {active ? (
                    <Loader2 className="size-3.5 shrink-0 animate-spin" />
                  ) : done ? (
                    <Check className="size-3.5 shrink-0" strokeWidth={2.4} />
                  ) : (
                    <span className="size-3.5 shrink-0 border border-[#ccc]" />
                  )}
                  {label}
                </li>
              );
            })}
          </ol>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Array.from({ length: Math.min(limit, 3) }).map((_, index) => (
              <div key={index} className="border border-[#eee] bg-[#fafafa] p-2">
                <div className="h-24 animate-pulse bg-[#ececec]" />
                <div className="mt-2 h-3 w-4/5 animate-pulse bg-[#ececec]" />
                <div className="mt-2 grid grid-cols-2 gap-1">
                  <div className="h-10 animate-pulse bg-[#ececec]" />
                  <div className="h-10 animate-pulse bg-[#ececec]" />
                  <div className="h-10 animate-pulse bg-[#ececec]" />
                  <div className="h-10 animate-pulse bg-[#ececec]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {hits.length && !searching ? (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-[#707070]">
                3. {activeMode?.to}
              </p>
              <p className="mt-0.5 text-[12px] text-[#707070]">
                {hits.length} opportunit{hits.length === 1 ? "y" : "ies"} for{" "}
                {activeMode?.label}
                {mode !== "amazon" && sources?.ebayLive
                  ? ". eBay figures are active listings, not sold."
                  : ""}
              </p>
            </div>
            <button
              type="button"
              disabled={disabled}
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
          <ul className="mt-2 grid max-h-[36rem] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
            {hits.map((hit) => {
              const checked = picked.includes(hit.asin);
              return (
                <li key={hit.asin}>
                  <label
                    className={cn(
                      "flex h-full cursor-pointer flex-col border bg-white p-2",
                      checked
                        ? "border-[#141414]"
                        : "border-[#e5e5e5] hover:border-[#141414]",
                    )}
                  >
                    <span className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => {
                          setPicked((prev) =>
                            prev.includes(hit.asin)
                              ? prev.filter((id) => id !== hit.asin)
                              : [...prev, hit.asin],
                          );
                        }}
                        className="mt-1 size-4 accent-[#141414]"
                      />
                      {hit.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={hit.imageUrl}
                          alt=""
                          className="h-20 w-20 shrink-0 object-contain"
                        />
                      ) : (
                        <span className="h-20 w-20 shrink-0 bg-[#f4f4f4]" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-[13px] font-medium leading-snug text-[#141414]">
                          {hit.title || hit.asin}
                        </span>
                        <span className="mt-1 block text-[12px] text-[#707070]">
                          {eligibilityCopy(hit, mode)}
                          {hit.brand ? ` · ${hit.brand}` : ""}
                        </span>
                      </span>
                    </span>
                    <span className="mt-2 grid grid-cols-3 gap-1">
                      {metricsFor(hit, mode).map(([label, value]) => (
                        <Metric key={label} label={label} value={value} />
                      ))}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            disabled={disabled || !selected.length}
            onClick={() => void importSelected()}
            className="mt-2 h-11 w-full bg-[#141414] text-[14px] font-medium text-white disabled:opacity-40"
          >
            {importActionLabel(mode, selected.length, importing)}
          </button>
        </div>
      ) : null}
    </div>
  );
}
