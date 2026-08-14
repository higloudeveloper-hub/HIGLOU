"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Sparkles } from "lucide-react";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { cn } from "@/lib/utils";

type ProductRow = {
  id: string;
  title: string;
  brand: string;
  status: string;
  updatedAt: string;
  coverUrl?: string | null;
};

type CsvRow = {
  id: string;
  fileName: string;
  createdAt: string;
};

function statusTone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("csv") || normalized.includes("ready")) {
    return "Ready to export";
  }
  if (normalized.includes("draft")) return "Draft";
  return "Needs a look";
}

export function ReturningHome({
  name,
  listingCount,
  drafts,
  exportsList,
  ebayConnected,
}: {
  name: string | null;
  listingCount: number;
  drafts: ProductRow[];
  exportsList: CsvRow[];
  ebayConnected: boolean;
}) {
  const hello = name ? `Hi, ${name}` : "Higlou";

  return (
    <div className="mx-auto max-w-[880px] pb-16">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-end justify-between gap-4 pt-2 pb-8"
      >
        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            Today
          </p>
          <h1 className="mt-1 font-display text-4xl tracking-tight">{hello}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {drafts.length
              ? `${drafts.length} listing${drafts.length === 1 ? "" : "s"} waiting · ${listingCount} in the library`
              : `${listingCount} listings in the library`}
          </p>
        </div>
        <Link
          href="/listings/new"
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-foreground px-5 text-sm font-semibold text-background"
        >
          <Sparkles className="size-4" />
          New listing
        </Link>
      </motion.header>

      {!ebayConnected ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <Link
            href="/settings#ebay-store"
            className="mb-8 flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 transition hover:bg-muted/50"
          >
            <div>
              <p className="text-sm font-semibold">Connect eBay to publish live</p>
              <p className="text-[12px] text-muted-foreground">
                You can still draft. This is the only missing store step.
              </p>
            </div>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </motion.div>
      ) : null}

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold tracking-tight">Work queue</h2>
          <Link href="/listings" className="text-[13px] text-muted-foreground hover:text-foreground">
            All listings
          </Link>
        </div>
        <div className="grid gap-2">
          {drafts.map((draft, i) => (
            <motion.div
              key={draft.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 * i, duration: 0.35 }}
            >
              <Link
                href={`/listings/${draft.id}`}
                className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-surface px-3 py-2.5 transition hover:border-border hover:bg-muted/40"
              >
                <div className="size-12 shrink-0 overflow-hidden rounded-xl bg-muted">
                  {draft.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={draft.coverUrl} alt="" className="size-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {draft.title || "Untitled listing"}
                  </p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {draft.brand || "Brand TBD"} · {statusTone(draft.status)} ·{" "}
                    {formatRelativeTime(draft.updatedAt)}
                  </p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground/30 group-hover:text-foreground" />
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {exportsList.length > 0 ? (
        <section className="mt-10">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold tracking-tight">Latest CSVs</h2>
            <Link href="/exports" className="text-[13px] text-muted-foreground hover:text-foreground">
              View all
            </Link>
          </div>
          <ul className="divide-y divide-border/70 rounded-2xl border border-border/70 bg-surface px-4">
            {exportsList.slice(0, 4).map((row) => (
              <li key={row.id}>
                <a
                  href={`/api/csv-history/${row.id}/download`}
                  className={cn(
                    "flex items-center justify-between gap-3 py-3 text-sm hover:text-foreground",
                    "text-muted-foreground",
                  )}
                >
                  <span className="truncate font-medium text-foreground">
                    {row.fileName.replace(/^Higlou_Draft_/, "").replace(/_\d{4}-\d{2}-\d{2}\.csv$/, "")}
                  </span>
                  <span className="shrink-0 text-[12px]">
                    {formatRelativeTime(row.createdAt)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
