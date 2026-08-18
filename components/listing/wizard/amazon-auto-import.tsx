"use client";

import { useMemo, useState } from "react";
import {
  AMAZON_WINNER_CATEGORIES,
  AMAZON_WINNER_LIMITS,
  amazonWinnerSearchText,
} from "@/lib/amazon/winner-categories";
import type { AmazonWinnerHit } from "@/lib/amazon/winner-rank";
import { cn } from "@/lib/utils";

type WinnerSources = { amazonCatalog: boolean; ebayLive: boolean };

function money(n: number | null | undefined) {
  if (n == null || n <= 0) return "";
  return `$${n.toFixed(2)}`;
}

function opportunityLabel(value: AmazonWinnerHit["opportunity"]) {
  if (value === "now") return "Now";
  if (value === "watch") return "Watch";
  return "Thin";
}

function hitMeta(hit: AmazonWinnerHit) {
  const parts: string[] = [];
  parts.push(opportunityLabel(hit.opportunity));
  if (hit.salesRank && hit.salesRankLabel !== "Amazon search") {
    parts.push(`BSR ${hit.salesRank.toLocaleString()}`);
  }
  if (hit.rating) parts.push(`${hit.rating.toFixed(1)} stars`);
  else parts.push("No rating yet");
  if (hit.reviewCount) parts.push(`${hit.reviewCount.toLocaleString()} reviews`);
  const amazon = money(hit.amazonPrice);
  if (amazon) parts.push(`Amazon ${amazon}`);
  const ebay = money(hit.ebayPrice);
  if (ebay) {
    parts.push(
      hit.ebayCount
        ? `eBay ${ebay} (${hit.ebayCount})`
        : `eBay ${ebay}`,
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
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<AmazonWinnerHit[]>([]);
  const [sources, setSources] = useState<WinnerSources | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  const disabled = busy || searching || importing;
  const canSearch = Boolean(categoryId || extra.trim().length >= 2);
  const selected = useMemo(
    () => hits.filter((hit) => picked.includes(hit.asin)),
    [hits, picked],
  );

  const search = async () => {
    if (disabled || !canSearch) return;
    const { query, category } = amazonWinnerSearchText(categoryId, extra);
    setSearching(true);
    setError(null);
    try {
      const response = await fetch("/api/amazon/auto-import/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, category, limit }),
      });
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        products?: AmazonWinnerHit[];
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
        Pick a category and how many to find. Higlou ranks Amazon sellers
        against live eBay prices so you can see what is worth importing now.
      </p>

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
          placeholder="Optional: toner, nailer, B0…"
          disabled={disabled}
          className="h-11 min-w-0 flex-1 border border-[#ccc] bg-white px-3 text-[14px] outline-none focus:border-[#141414] disabled:opacity-60"
        />
        <button
          type="button"
          disabled={disabled || !canSearch}
          onClick={() => void search()}
          className="h-11 shrink-0 bg-[#141414] px-5 text-[14px] font-medium text-white disabled:opacity-40"
        >
          {searching ? "Finding…" : "Find winners"}
        </button>
      </div>

      <p className="mt-2 text-[12px] text-[#707070]">
        For live Best Sellers Rank and eBay prices, connect{" "}
        <a href="/settings#amazon-store" className="underline underline-offset-2">
          Amazon
        </a>{" "}
        and{" "}
        <a href="/settings#ebay-store" className="underline underline-offset-2">
          eBay
        </a>{" "}
        in Settings. Search still works without them.
      </p>

      {error ? (
        <p className="mt-2 text-[13px] text-destructive">{error}</p>
      ) : null}

      {hits.length ? (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] text-[#707070]">
              {hits.length} winner{hits.length === 1 ? "" : "s"}
              {sources?.amazonCatalog && sources.ebayLive
                ? " with live Amazon rank and eBay prices"
                : sources?.amazonCatalog
                  ? " with live Amazon rank"
                  : sources?.ebayLive
                    ? " with live eBay prices"
                    : ""}
              . Now means Amazon is moving and eBay pays more. Pick which to
              import.
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
                          hit.opportunity === "now" && "text-[#141414]",
                        )}
                      >
                        {hitMeta(hit)}
                      </span>
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
