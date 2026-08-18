"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import {
  AmazonMark,
  EbayMark,
  HomeDepotMark,
} from "@/components/brand/store-marks";
import { AmazonAutoImportPanel } from "@/components/listing/wizard/amazon-auto-import";
import { detectCatalogStore, type CatalogStore } from "@/lib/catalog/detect-store";
import { cn } from "@/lib/utils";

export function CatalogImportDock({
  importing = false,
  onImport,
  onAutoImport,
}: {
  importing?: false | CatalogStore | "amazon-auto";
  onImport: (url: string) => Promise<boolean | void>;
  onAutoImport?: (asins: string[]) => Promise<boolean | void>;
}) {
  const [url, setUrl] = useState("");
  const [picked, setPicked] = useState<CatalogStore | null>(null);
  const [mode, setMode] = useState<"link" | "winners">(
    onAutoImport ? "winners" : "link",
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const detected = detectCatalogStore(url);
  const active = detected || picked;
  const busy = Boolean(importing);

  const placeholder = useMemo(() => {
    if (active === "homedepot") return "https://www.homedepot.com/p/…";
    if (active === "amazon") return "https://www.amazon.com/dp/…";
    return "Paste an Amazon or Home Depot product link";
  }, [active]);

  const submitLabel =
    importing === "homedepot"
      ? "Reading Home Depot…"
      : importing === "amazon" || importing === "amazon-auto"
        ? "Reading Amazon…"
        : "Import";

  const choose = (store: CatalogStore) => {
    setPicked(store);
    if (store === "amazon" && onAutoImport) {
      setMode("winners");
      return;
    }
    setMode("link");
    inputRef.current?.focus();
  };

  return (
    <div className="shrink-0 border-b border-[#e5e5e5] bg-white px-4 py-4">
      <p className="text-[15px] font-medium tracking-tight text-[#141414]">
        Import from Amazon or Home Depot
      </p>
      <p className="mt-0.5 text-[13px] text-[#707070]">
        Pick a category. Higlou checks Amazon rank and live eBay prices, then
        you choose which to import.
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
        <StoreCard
          active={active === "amazon" || mode === "winners"}
          busy={importing === "amazon" || importing === "amazon-auto"}
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
          <span className="mt-2 text-[11px] font-medium text-[#141414] sm:text-[12px]">
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
          <span className="mt-1.5 text-[11px] font-medium text-[#141414] sm:text-[12px]">
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
            <span className="mt-2 text-center text-[11px] font-medium text-[#141414] sm:text-[12px]">
              Lists on eBay
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex gap-4 text-[13px]">
        <button
          type="button"
          disabled={busy}
          onClick={() => setMode("link")}
          className={cn(
            "border-b pb-1",
            mode === "link"
              ? "border-[#141414] font-medium text-[#141414]"
              : "border-transparent text-[#707070]",
          )}
        >
          Paste a link
        </button>
        {onAutoImport ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setPicked("amazon");
              setMode("winners");
            }}
            className={cn(
              "border-b pb-1",
              mode === "winners"
                ? "border-[#141414] font-medium text-[#141414]"
                : "border-transparent text-[#707070]",
            )}
          >
            Find winners
          </button>
        ) : null}
      </div>

      {mode === "winners" && onAutoImport ? (
        <AmazonAutoImportPanel busy={busy} onImport={onAutoImport} />
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
