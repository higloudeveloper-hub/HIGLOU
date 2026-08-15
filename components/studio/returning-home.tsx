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

function CoverPhoto({
  src,
  priority = false,
}: {
  src?: string | null;
  priority?: boolean;
}) {
  if (!src) {
    return (
      <div className="absolute inset-0 bg-[#f7f7f7]" />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      className="absolute inset-0 size-full object-contain p-4 sm:p-5"
    />
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className="inline-flex w-fit rounded-md bg-[#f0f2f2] px-2 py-0.5 text-[11px] font-medium text-[#565959]">
      {statusTone(status)}
    </span>
  );
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
          "group overflow-hidden rounded-xl border border-[#d5d9d9] bg-white shadow-[0_1px_2px_rgba(15,17,17,0.08)] transition",
          "hover:border-[#bbb] hover:shadow-[0_4px_12px_rgba(15,17,17,0.12)]",
          kind === "hero" &&
            "grid lg:grid-cols-[minmax(0,1.15fr)_minmax(240px,0.85fr)]",
        )}
      >
        {kind === "hero" ? (
          <>
            <div className="relative aspect-[4/3] bg-white lg:aspect-auto lg:min-h-[260px]">
              <CoverPhoto src={draft.coverUrl} priority />
            </div>
            <div className="flex flex-col justify-center gap-2 border-t border-[#eee] px-5 py-5 lg:border-t-0 lg:border-l">
              <StatusPill status={draft.status} />
              <p className="line-clamp-2 text-[18px] font-medium leading-snug tracking-tight text-[#0f1111] sm:text-[20px]">
                {title}
              </p>
              <p className="text-[13px] text-[#565959]">{meta}</p>
            </div>
          </>
        ) : (
          <>
            <div
              className={cn(
                "relative bg-white",
                wide ? "aspect-[4/3]" : "aspect-square",
              )}
            >
              <CoverPhoto src={draft.coverUrl} />
            </div>
            <div className={cn("px-3 pb-3.5 pt-2.5", wide && "px-4 pb-4")}>
              <StatusPill status={draft.status} />
              <p
                className={cn(
                  "mt-1.5 font-medium leading-snug text-[#0f1111]",
                  wide
                    ? "line-clamp-2 text-[15px] sm:text-[16px]"
                    : "line-clamp-2 text-[13.5px]",
                )}
              >
                {title}
              </p>
              <p className="mt-1 text-[12px] text-[#565959]">{meta}</p>
            </div>
          </>
        )}
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

      <EbaySalesPulse />

      <div className="mb-8">
        <ListingPipeline compact storeName={ebayStoreName} />
      </div>

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
