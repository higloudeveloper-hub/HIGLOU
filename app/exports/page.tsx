"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { EmptyPanel, SkeletonBlock } from "@/components/ui/studio";

type CsvRow = {
  id: string;
  fileName: string;
  createdAt: string;
  productId?: string | null;
};

export default function ExportsPage() {
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/csv-history");
        if (response.status === 401 || response.status === 503) {
          if (!cancelled) {
            setError("Sign in to view your exports.");
            setRows([]);
          }
          return;
        }
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error || "Failed to load exports");
        }
        const body = (await response.json()) as { files: CsvRow[] };
        if (!cancelled) setRows(body.files ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load exports");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AppShell
      title="Exports"
      description="CSV files ready for eBay File Exchange — download anytime."
    >
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-2xl border border-border/70 bg-surface px-5 py-4"
            >
              <div className="space-y-2">
                <SkeletonBlock className="h-4 w-56" />
                <SkeletonBlock className="h-3 w-32" />
              </div>
              <SkeletonBlock className="h-9 w-24" />
            </div>
          ))}
        </div>
      ) : error ? (
        <EmptyPanel title="Couldn’t load exports" body={error} />
      ) : rows.length === 0 ? (
        <EmptyPanel
          title="No exports yet"
          body="When a listing is ready, export a CSV and Higlou keeps it here."
          action={
            <Link
              href="/listings/new"
              className="inline-flex h-11 items-center rounded-xl bg-foreground px-5 text-sm font-semibold text-background"
            >
              New listing
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border/70 bg-surface">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">
                  {row.fileName}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  CSV exported {formatRelativeTime(row.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = `/api/csv-history/${row.id}/download`;
                  }}
                  className="inline-flex h-9 items-center rounded-xl bg-foreground px-3.5 text-sm font-medium text-background hover:opacity-90"
                >
                  Download
                </button>
                {row.productId ? (
                  <Link
                    href={`/listings/${row.productId}`}
                    className="inline-flex h-9 items-center rounded-xl px-3.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    Open listing
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
