"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StudioFrame } from "@/components/layout/studio-frame";
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
    <AppShell hideHeader flush>
      <StudioFrame
        kicker="File Exchange"
        title="Exports"
        hint="CSV files ready for eBay"
        action={
          <Link
            href="/listings/new"
            className="inline-flex h-9 items-center rounded-full bg-[#3665F3] px-4 text-[13px] font-semibold text-white"
          >
            New listing
          </Link>
        }
      >
        <div className="grid min-h-full p-5">
          {loading ? (
            <div className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between border-b border-[#eee] px-5 py-4 last:border-0"
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
                  className="inline-flex h-10 items-center rounded-full bg-[#3665F3] px-5 text-sm font-semibold text-white"
                >
                  New listing
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-[#eee] overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-[#191919]">
                      {row.fileName}
                    </p>
                    <p className="mt-0.5 text-[12px] text-[#707070]">
                      CSV exported {formatRelativeTime(row.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        window.location.href = `/api/csv-history/${row.id}/download`;
                      }}
                      className="inline-flex h-9 items-center rounded-full bg-[#3665F3] px-3.5 text-[13px] font-semibold text-white"
                    >
                      Download
                    </button>
                    {row.productId ? (
                      <Link
                        href={`/listings/${row.productId}`}
                        className="inline-flex h-9 items-center rounded-full px-3.5 text-[13px] font-medium text-[#3665F3]"
                      >
                        Open listing
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </StudioFrame>
    </AppShell>
  );
}
