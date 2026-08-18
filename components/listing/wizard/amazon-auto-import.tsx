"use client";

import { useMemo, useState } from "react";
import type { AmazonWinnerHit } from "@/lib/amazon/winner-rank";
import { cn } from "@/lib/utils";

export function AmazonAutoImportPanel({
  busy = false,
  onImport,
}: {
  busy?: boolean;
  onImport: (asins: string[], ebayPrice: number) => Promise<boolean | void>;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [ebayPrice, setEbayPrice] = useState("");
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<AmazonWinnerHit[]>([]);
  const [picked, setPicked] = useState<string[]>([]);

  const disabled = busy || searching || importing;
  const price = Number(ebayPrice);
  const priceOk = Number.isFinite(price) && price > 0;
  const selected = useMemo(
    () => hits.filter((hit) => picked.includes(hit.asin)),
    [hits, picked],
  );

  const search = async () => {
    if (disabled) return;
    const nextQuery = query.trim();
    const nextCategory = category.trim();
    if (!nextQuery && !nextCategory) {
      setError("Enter a product number or a category.");
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const response = await fetch("/api/amazon/auto-import/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: nextQuery, category: nextCategory }),
      });
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        products?: AmazonWinnerHit[];
      } | null;
      if (!response.ok || !body?.ok || !body.products?.length) {
        setHits([]);
        setPicked([]);
        setError(body?.error || "Amazon search failed.");
        return;
      }
      setHits(body.products);
      setPicked(body.products.slice(0, 3).map((hit) => hit.asin));
    } catch (err) {
      setHits([]);
      setPicked([]);
      setError(err instanceof Error ? err.message : "Amazon search failed.");
    } finally {
      setSearching(false);
    }
  };

  const importSelected = async () => {
    if (disabled || !selected.length || !priceOk) return;
    setImporting(true);
    setError(null);
    try {
      const ok = await onImport(
        selected.map((hit) => hit.asin),
        price,
      );
      if (ok !== false) {
        setHits([]);
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
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-[#707070]">
            Product number
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ASIN, UPC, or model"
            disabled={disabled}
            className="h-11 w-full border border-[#ccc] bg-white px-3 text-[14px] outline-none focus:border-[#141414] disabled:opacity-60"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-[#707070]">
            Category
          </span>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Network testers, nailers…"
            disabled={disabled}
            className="h-11 w-full border border-[#ccc] bg-white px-3 text-[14px] outline-none focus:border-[#141414] disabled:opacity-60"
          />
        </label>
      </div>

      <div className="mt-2 flex gap-2">
        <label className="flex h-11 items-center border border-[#ccc] bg-white px-3">
          <span className="pr-2 text-[11px] font-medium text-[#707070]">
            eBay $
          </span>
          <input
            type="number"
            inputMode="decimal"
            min={0.01}
            step="0.01"
            value={ebayPrice}
            onChange={(e) => setEbayPrice(e.target.value)}
            placeholder="Your price"
            disabled={disabled}
            className="h-full w-[88px] bg-transparent text-[14px] outline-none disabled:opacity-60"
          />
        </label>
        <button
          type="button"
          disabled={disabled || (!query.trim() && !category.trim())}
          onClick={() => void search()}
          className="h-11 flex-1 bg-[#141414] px-4 text-[14px] font-medium text-white disabled:opacity-40"
        >
          {searching ? "Finding…" : "Find products"}
        </button>
      </div>

      {error ? (
        <p className="mt-2 text-[13px] text-destructive">{error}</p>
      ) : null}

      {hits.length ? (
        <div className="mt-3">
          <p className="text-[12px] text-[#707070]">
            Ranked by Amazon best-seller rank and customer reviews. Pick up to 5
            for eBay.
          </p>
          <ul className="mt-2 divide-y divide-[#eee] border border-[#e5e5e5]">
            {hits.map((hit) => {
              const checked = picked.includes(hit.asin);
              const lockedOut = !checked && picked.length >= 5;
              return (
                <li key={hit.asin}>
                  <label
                    className={cn(
                      "flex cursor-pointer gap-3 px-3 py-2.5",
                      lockedOut && "opacity-40",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled || lockedOut}
                      onChange={() => {
                        setPicked((prev) =>
                          prev.includes(hit.asin)
                            ? prev.filter((id) => id !== hit.asin)
                            : prev.length >= 5
                              ? prev
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
                      <span className="mt-0.5 block text-[12px] text-[#707070]">
                        {hit.brand ? `${hit.brand} · ` : ""}
                        {hit.asin}
                        {hit.salesRank
                          ? ` · #${hit.salesRank.toLocaleString()}${
                              hit.salesRankLabel
                                ? ` in ${hit.salesRankLabel}`
                                : ""
                            }`
                          : ""}
                        {hit.rating
                          ? ` · ${hit.rating.toFixed(1)} stars${
                              hit.reviewCount
                                ? ` (${hit.reviewCount.toLocaleString()})`
                                : ""
                            }`
                          : ""}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            disabled={disabled || !selected.length || !priceOk}
            onClick={() => void importSelected()}
            className="mt-2 h-11 w-full bg-[#141414] text-[14px] font-medium text-white disabled:opacity-40"
          >
            {importing
              ? "Importing…"
              : priceOk
                ? `Import ${selected.length} for eBay at $${price.toFixed(2)}`
                : "Set your eBay price to import"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
