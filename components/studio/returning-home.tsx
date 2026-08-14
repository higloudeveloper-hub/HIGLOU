"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Sparkles } from "lucide-react";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { ListingPipeline } from "@/components/studio/listing-pipeline";
import { EbaySalesPulse } from "@/components/studio/ebay-sales-pulse";
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

/** Mix of a hero banner, wide banners, and square tiles. */
function tileKind(index: number): "hero" | "banner" | "square" {
  if (index === 0) return "hero";
  const slot = index % 5;
  return slot === 3 ? "banner" : "square";
}

function QueueCard({
  draft,
  kind,
  index,
}: {
  draft: ProductRow;
  kind: "hero" | "banner" | "square";
  index: number;
}) {
  const wide = kind !== "square";
  const title = draft.title || "Untitled listing";
  const meta = `${draft.brand || "Brand TBD"} · ${formatRelativeTime(draft.updatedAt)}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.03 * index, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        kind === "hero" && "col-span-2 lg:col-span-4",
        kind === "banner" && "col-span-2",
        kind === "square" && "col-span-1",
      )}
    >
      <Link
        href={`/listings/${draft.id}`}
        className={cn(
          "group relative block overflow-hidden rounded-[28px] bg-muted shadow-[0_12px_32px_-24px_rgba(20,16,8,0.55)] ring-1 ring-black/5 transition duration-300",
          "hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-24px_rgba(20,16,8,0.55)]",
          kind === "hero" && "aspect-[16/7] min-h-[168px] sm:aspect-[24/8]",
          kind === "banner" && "aspect-[16/8] min-h-[140px]",
          kind === "square" && "aspect-square",
        )}
      >
        {draft.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={draft.coverUrl}
            alt=""
            className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-muted to-muted-foreground/15" />
        )}
        <div
          className={cn(
            "absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent",
            wide && "via-black/10",
          )}
        />
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 text-white",
            wide ? "p-4 sm:p-5" : "p-3 sm:p-3.5",
          )}
        >
          <span className="inline-flex rounded-full bg-white/18 px-2 py-0.5 text-[10px] font-semibold tracking-wide backdrop-blur-md">
            {statusTone(draft.status)}
          </span>
          <p
            className={cn(
              "mt-1.5 font-semibold tracking-tight",
              wide
                ? "line-clamp-1 text-[17px] sm:text-[20px]"
                : "line-clamp-2 text-[13.5px] leading-snug sm:text-[15px]",
            )}
          >
            {title}
          </p>
          <p
            className={cn(
              "mt-0.5 text-white/75",
              wide ? "text-[12.5px]" : "text-[11px]",
            )}
          >
            {meta}
          </p>
        </div>
      </Link>
    </motion.div>
  );
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
  const [ebayStoreName, setEbayStoreName] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/ebay/store-name");
        if (!res.ok) return;
        const body = (await res.json()) as { storeName?: string | null };
        if (body.storeName) setEbayStoreName(body.storeName);
      } catch {
        /* optional */
      }
    })();
  }, []);

  return (
    <div className="mx-auto max-w-[1080px] pb-16">
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

      <div className="mb-8">
        <ListingPipeline compact storeName={ebayStoreName} />
      </div>

      {ebayConnected ? <EbaySalesPulse /> : null}

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
        {drafts.length === 0 ? (
          <Link
            href="/listings/new"
            className="flex aspect-[21/8] items-center justify-center rounded-[28px] border border-dashed border-border bg-muted/40 text-sm text-muted-foreground hover:bg-muted"
          >
            No drafts waiting — start a new listing
          </Link>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            {drafts.map((draft, i) => (
              <QueueCard
                key={draft.id}
                draft={draft}
                kind={tileKind(i)}
                index={i}
              />
            ))}
          </div>
        )}
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
