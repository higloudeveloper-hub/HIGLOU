"use client";

import { useState } from "react";

export function AmazonAutoImportPanel({
  busy = false,
  onImport,
}: {
  busy?: boolean;
  onImport: (query: string) => Promise<boolean | void>;
}) {
  const [query, setQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = busy || running;

  const run = async () => {
    const next = query.trim();
    if (disabled || !next) return;
    setRunning(true);
    setError(null);
    try {
      const ok = await onImport(next);
      if (ok !== false) setQuery("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Amazon import failed.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <form
      className="mt-3 border-t border-[#e5e5e5] pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        void run();
      }}
    >
      <p className="text-[13px] text-[#707070]">
        Type the product. One click imports the best-reviewed Amazon winners and
        sets an eBay price above Amazon.
      </p>
      <div className="mt-2 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Klein toner, nailer, B0…"
          disabled={disabled}
          className="h-12 min-w-0 flex-1 border border-[#ccc] bg-white px-3 text-[14px] outline-none focus:border-[#141414] disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={disabled || query.trim().length < 2}
          className="h-12 shrink-0 bg-[#141414] px-5 text-[14px] font-medium text-white disabled:opacity-40"
        >
          {running ? "Finding winners…" : "Find winners"}
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-[13px] text-destructive">{error}</p>
      ) : null}
    </form>
  );
}
