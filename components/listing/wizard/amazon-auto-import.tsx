"use client";

import { useMemo, useState } from "react";
import {
  AMAZON_WINNER_CATEGORIES,
  AMAZON_WINNER_LIMITS,
} from "@/lib/amazon/winner-categories";
import type { OpportunityMode, OpportunityProduct } from "@/lib/opportunity/types";
import { cn } from "@/lib/utils";

type WinnerSources = {
  keepa?: boolean;
  amazonCatalog?: boolean;
  amazonFees?: boolean;
  ebayLive?: boolean;
};

const MODES: Array<{ id: OpportunityMode; label: string }> = [
  { id: "amazon_to_ebay", label: "Amazon → eBay" },
  { id: "amazon", label: "Sell on Amazon" },
  { id: "supplier", label: "Supplier → both" },
];

function money(n: number | null | undefined) {
  if (n == null) return "";
  return `$${n.toFixed(2)}`;
}

function pct(n: number | null | undefined) {
  if (n == null) return "";
  return `${Math.round(n * 100)}%`;
}

function hitMeta(hit: OpportunityProduct) {
  const parts: string[] = [`${hit.score}/100`];
  if (hit.eligibility === "SELLABLE") parts.push("Can sell");
  else if (hit.eligibility === "APPROVAL_REQUIRED") parts.push("Needs approval");
  else if (hit.eligibility === "RESTRICTED") parts.push("Blocked");
  if (hit.netProfit != null) parts.push(`Profit ${money(hit.netProfit)}`);
  if (hit.roi != null) parts.push(`ROI ${pct(hit.roi)}`);
  if (hit.sellerCount != null) parts.push(`${hit.sellerCount} sellers`);
  if (hit.salesRank && hit.salesRankLabel !== "Amazon search") {
    parts.push(`BSR ${hit.salesRank.toLocaleString()}`);
  }
  const amazon = money(hit.amazonPrice);
  if (amazon) parts.push(`Amazon ${amazon}`);
  const ebay = money(hit.ebayActiveMedian ?? hit.ebayPrice);
  if (ebay) {
    parts.push(
      hit.ebayActiveCount
        ? `eBay ask ${ebay} (${hit.ebayActiveCount} active)`
        : `eBay ask ${ebay}`,
    );
  }
  return parts.join(" · ");
}

export function AmazonAutoImportPanel({
  busy = false,
  onImport,
}: {
  busy?: boolean;
  onImport: (asins: string[]) => Promise<boolean | void>;
}) {
  const [categoryId, setCategoryId] = useState("");
  const [extra, setExtra] = useState("");
  const [limit, setLimit] = useState(5);
  const [mode, setMode] = useState<OpportunityMode>("amazon_to_ebay");
  const [onlySellable, setOnlySellable] = useState(true);
  const [cost, setCost] = useState("");
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<OpportunityProduct[]>([]);
  const [sources, setSources] = useState<WinnerSources | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  const disabled = busy || searching || importing;
  const canSearch = Boolean(categoryId || extra.trim().length >= 2);
  const selected = useMemo(
    () => hits.filter((hit) => picked.includes(hit.asin)),
    [hits, picked],
  );
  const supplierCost = Number(cost);
  const costValue =
    Number.isFinite(supplierCost) && supplierCost > 0 ? supplierCost : undefined;

  const search = async () => {
    if (disabled || !canSearch) return;
    setSearching(true);
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
          onlySellable,
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
        setPicked([]);
        setError(body?.error || "Amazon search failed.");
        return;
      }
      setHits(body.products.slice(0, limit));
      setSources(body.sources || null);
      setPicked([]);
    } catch (err) {
      setHits([]);
      setSources(null);
      setPicked([]);
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
      const ok = await onImport(selected.map((hit) => hit.asin));
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
      <p className="text-[13px] text-[#707070]">
        Keepa finds demand and price history. Amazon checks if you can sell it
        and the real referral fee. eBay shows active asking prices, not sold
        comps. Import still creates an eBay draft.
      </p>

      <div className="mt-2 flex flex-wrap gap-1">
        {MODES.map((row) => (
          <button
            key={row.id}
            type="button"
            disabled={disabled}
            onClick={() => setMode(row.id)}
            className={cn(
              "h-9 px-3 text-[12px] font-medium",
              mode === row.id
                ? "bg-[#141414] text-white"
                : "border border-[#ccc] bg-white text-[#141414]",
            )}
          >
            {row.label}
          </button>
        ))}
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_88px]">
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
        {mode !== "amazon_to_ebay" ? (
          <input
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="Cost $"
            inputMode="decimal"
            disabled={disabled}
            className="h-11 w-24 shrink-0 border border-[#ccc] bg-white px-3 text-[14px] outline-none focus:border-[#141414] disabled:opacity-60"
          />
        ) : null}
        <button
          type="button"
          disabled={disabled || !canSearch}
          onClick={() => void search()}
          className="h-11 shrink-0 bg-[#141414] px-5 text-[14px] font-medium text-white disabled:opacity-40"
        >
          {searching ? "Scoring…" : "Find opportunities"}
        </button>
      </div>

      <label className="mt-2 flex items-center gap-2 text-[13px] text-[#141414]">
        <input
          type="checkbox"
          checked={onlySellable}
          disabled={disabled}
          onChange={(e) => setOnlySellable(e.target.checked)}
          className="size-4 accent-[#141414]"
        />
        Only show products I can sell
      </label>

      <p className="mt-2 text-[12px] text-[#707070]">
        Connect{" "}
        <a href="/settings#amazon-store" className="underline underline-offset-2">
          Amazon
        </a>{" "}
        and{" "}
        <a href="/settings#ebay-store" className="underline underline-offset-2">
          eBay
        </a>
        . Add <span className="font-medium">KEEPA_API_KEY</span> on the server
        for history, BSR, and seller count. Search still runs without Keepa.
      </p>

      {error ? (
        <p className="mt-2 text-[13px] text-destructive">{error}</p>
      ) : null}

      {hits.length ? (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] text-[#707070]">
              {hits.length} opportunit{hits.length === 1 ? "y" : "ies"}
              {sources?.keepa ? " with Keepa history" : ""}
              {sources?.ebayLive ? ". eBay figures are active listings, not sold." : ""}
            </p>
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
          <ul className="mt-2 max-h-80 divide-y divide-[#eee] overflow-y-auto border border-[#e5e5e5]">
            {hits.map((hit) => {
              const checked = picked.includes(hit.asin);
              return (
                <li key={hit.asin}>
                  <label className="flex cursor-pointer gap-3 px-3 py-2.5">
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
                        className="size-12 shrink-0 object-contain"
                      />
                    ) : (
                      <span className="size-12 shrink-0 bg-[#f4f4f4]" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-[#141414]">
                        {hit.title || hit.asin}
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 block text-[12px] text-[#707070]",
                          hit.score >= 85 && "text-[#141414]",
                        )}
                      >
                        {hitMeta(hit)}
                      </span>
                      {hit.reasons.length ? (
                        <span className="mt-1 block text-[11px] text-[#707070]">
                          {hit.reasons
                            .slice(0, 4)
                            .map((row) => (row.ok ? row.text : row.text))
                            .join(" · ")}
                        </span>
                      ) : null}
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
            {importing
              ? "Importing…"
              : selected.length
                ? `Import ${selected.length} for eBay`
                : "Pick products to import"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
