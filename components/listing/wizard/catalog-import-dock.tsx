"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import {
  AmazonMark,
  EbayMark,
  HomeDepotMark,
} from "@/components/brand/store-marks";
import { detectCatalogStore, type CatalogStore } from "@/lib/catalog/detect-store";
import { parseBatchCatalogLinks, BATCH_IMPORT_LIMIT } from "@/lib/catalog/parse-batch-links";
import { cn } from "@/lib/utils";

export function CatalogImportDock({
  importing = false,
  onImport,
  onBatchImport,
}: {
  importing?: false | CatalogStore | "batch";
  onImport: (url: string) => Promise<boolean | void>;
  onBatchImport?: (urls: string[]) => Promise<boolean | void>;
}) {
  const [url, setUrl] = useState("");
  const [batchText, setBatchText] = useState("");
  const [mode, setMode] = useState<"one" | "five">("one");
  const [picked, setPicked] = useState<CatalogStore | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const detected = detectCatalogStore(url);
  const active = detected || picked;
  const busy = Boolean(importing);
  const batchCount = parseBatchCatalogLinks(batchText).links.length;

  const placeholder = useMemo(() => {
    if (active === "homedepot") return "https://www.homedepot.com/p/…";
    if (active === "amazon") return "https://www.amazon.com/dp/…";
    return "Paste an Amazon or Home Depot product link";
  }, [active]);

  const submitLabel =
    importing === "homedepot"
      ? "Reading Home Depot…"
      : importing === "amazon"
        ? "Reading Amazon…"
        : importing === "batch"
          ? "Importing…"
          : mode === "five"
            ? "Import all"
            : "Import";

  const choose = (store: CatalogStore) => {
    setPicked(store);
    inputRef.current?.focus();
  };

  return (
    <div className="shrink-0 border-b border-[#e5e5e5] bg-white px-4 py-4">
      <p className="text-[15px] font-medium tracking-tight text-[#141414]">
        Import from Amazon or Home Depot
      </p>
      <p className="mt-0.5 text-[13px] text-[#707070]">
        {mode === "five"
          ? "Paste up to 5 links. Higlou builds the listings. You only set the eBay prices."
          : "Paste a product link. Photos and title come in as a draft."}
      </p>
      {onBatchImport ? (
        <div className="mt-3 flex gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode("one")}
            className={cn(
              "h-8 px-3 text-[12px] font-medium",
              mode === "one"
                ? "bg-[#141414] text-white"
                : "bg-[#f6f6f6] text-[#141414]",
            )}
          >
            1 link
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode("five")}
            className={cn(
              "h-8 px-3 text-[12px] font-medium",
              mode === "five"
                ? "bg-[#141414] text-white"
                : "bg-[#f6f6f6] text-[#141414]",
            )}
          >
            Up to 5 links
          </button>
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
        <StoreCard
          active={active === "amazon"}
          busy={importing === "amazon"}
          disabled={busy}
          onClick={() => choose("amazon")}
          header={
            <div className="flex items-center gap-1.5 bg-[#131921] px-2 py-1.5">
              <AmazonMark invert className="h-3.5 sm:h-4" />
              <span className="min-w-0 flex-1 truncate rounded-sm bg-white px-2 py-0.5 text-[10px] text-[#888]">
                amazon.com
              </span>
            </div>
          }
        >
          <AmazonMark className="h-8 sm:h-11" />
          <span className="mt-1 text-[11px] font-medium text-[#141414] sm:text-[12px]">
            Amazon
          </span>
        </StoreCard>

        <StoreCard
          active={active === "homedepot"}
          busy={importing === "homedepot"}
          disabled={busy}
          onClick={() => choose("homedepot")}
          header={
            <div className="flex items-center gap-1.5 bg-[#F96302] px-2 py-1.5">
              <span className="grid size-7 shrink-0 place-items-center bg-white sm:size-8">
                <HomeDepotMark className="h-6 sm:h-7" />
              </span>
              <span className="min-w-0 flex-1 truncate rounded-sm bg-white px-2 py-0.5 text-[10px] text-[#888]">
                homedepot.com
              </span>
            </div>
          }
        >
          <HomeDepotMark className="h-10 sm:h-12" />
          <span className="mt-1 text-[11px] font-medium text-[#141414] sm:text-[12px]">
            Home Depot
          </span>
        </StoreCard>

        <div className="flex min-h-[108px] flex-col overflow-hidden bg-white ring-1 ring-[#e5e5e5] sm:min-h-[124px]">
          <div className="flex items-center gap-1.5 border-b border-[#e5e5e5] bg-white px-2 py-1.5">
            <EbayMark className="h-3.5 sm:h-4" />
            <span className="min-w-0 flex-1 truncate rounded-sm border border-[#ccc] bg-white px-2 py-0.5 text-[10px] text-[#707070]">
              Search for anything
            </span>
            <span className="grid size-6 shrink-0 place-items-center bg-[#3665F3] text-white">
              <Search className="size-3" strokeWidth={2.4} />
            </span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-2 py-3">
            <EbayMark className="h-7 sm:h-9" />
            <span className="mt-1 text-center text-[11px] font-medium text-[#141414] sm:text-[12px]">
              Lists on eBay
            </span>
          </div>
        </div>
      </div>

      {mode === "five" && onBatchImport ? (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const { links } = parseBatchCatalogLinks(batchText);
            if (!links.length || busy) return;
            void onBatchImport(links.map((row) => row.url)).then((ok) => {
              if (ok !== false) setBatchText("");
            });
          }}
        >
          <textarea
            value={batchText}
            onChange={(e) => setBatchText(e.target.value)}
            placeholder={"https://www.amazon.com/dp/…\nhttps://www.homedepot.com/p/…"}
            disabled={busy}
            rows={5}
            className="min-h-[120px] w-full resize-y border border-[#ccc] bg-white px-3 py-2 text-[14px] outline-none focus:border-[#141414] disabled:opacity-60"
          />
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 text-[12px] text-[#707070]">
              {batchCount} / {BATCH_IMPORT_LIMIT} products
            </span>
            <button
              type="submit"
              disabled={busy || batchCount < 1}
              className="h-12 shrink-0 bg-[#141414] px-5 text-[14px] font-medium text-white disabled:opacity-40"
            >
              {submitLabel}
            </button>
          </div>
        </form>
      ) : (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const next = url.trim();
            if (!next || busy) return;
            void onImport(next).then((ok) => {
              if (ok !== false) setUrl("");
            });
          }}
        >
          <input
            ref={inputRef}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={placeholder}
            disabled={busy}
            className="h-12 min-w-0 flex-1 border border-[#ccc] bg-white px-3 text-[14px] outline-none focus:border-[#141414] disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={busy || url.trim().length < 8}
            className="h-12 shrink-0 bg-[#141414] px-5 text-[14px] font-medium text-white disabled:opacity-40"
          >
            {submitLabel}
          </button>
        </form>
      )}
    </div>
  );
}

function StoreCard({
  active,
  busy,
  disabled,
  onClick,
  header,
  children,
}: {
  active: boolean;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-[108px] flex-col overflow-hidden bg-white text-left transition sm:min-h-[124px]",
        active ? "ring-2 ring-[#141414]" : "ring-1 ring-[#e5e5e5] hover:ring-[#141414]",
        busy && "ring-2 ring-[#141414]",
        disabled && !busy && "opacity-50",
      )}
    >
      {header}
      <span className="flex min-h-0 flex-1 flex-col items-center justify-center px-2 py-3">
        {children}
      </span>
    </button>
  );
}
