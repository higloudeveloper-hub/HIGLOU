"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Sparkles } from "lucide-react";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { ListingPipeline } from "@/components/studio/listing-pipeline";
import { EbaySalesPulse } from "@/components/studio/ebay-sales-pulse";
import { StudioFrame } from "@/components/layout/studio-frame";
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
    <StudioFrame
      kicker="Today"
      title={hello}
      hint={
        drafts.length
          ? `${drafts.length} waiting · ${listingCount} in the library`
          : `${listingCount} listings in the library`
      }
      action={
        <Link
          href="/listings/new"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[#3665F3] px-4 text-[13px] font-semibold text-white"
        >
          <Sparkles className="size-3.5" />
          New listing
        </Link>
      }
      scroll={false}
    >
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(380px,0.92fr)_minmax(0,1.12fr)]">
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto border-b border-[#e5e5e5] bg-[#f7f7f7] p-4 lg:border-r lg:border-b-0">
          <EbaySalesPulse />
          {!ebayConnected ? (
            <Link
              href="/settings#ebay-store"
              className="flex items-center justify-between gap-3 rounded-xl border border-[#e5e5e5] bg-white px-4 py-3 transition hover:border-[#ccc]"
            >
              <div>
                <p className="text-[13px] font-semibold text-[#191919]">
                  Connect eBay to publish live
                </p>
                <p className="text-[12px] text-[#707070]">
                  You can still draft. This is the only missing store step.
                </p>
              </div>
              <ArrowRight className="size-4 shrink-0 text-[#707070]" />
            </Link>
          ) : null}
          <div className="min-h-0 flex-1">
            <ListingPipeline compact storeName={ebayStoreName} />
          </div>
        </div>

        <div className="flex min-h-0 flex-col bg-white">
          <div className="flex shrink-0 items-center justify-between border-b border-[#eee] px-4 py-2.5">
            <p className="text-[13px] font-semibold text-[#191919]">Work queue</p>
            <Link
              href="/listings"
              className="text-[12px] font-medium text-[#3665F3]"
            >
              All listings
            </Link>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {drafts.length === 0 ? (
              <Link
                href="/listings/new"
                className="grid min-h-[240px] place-items-center rounded-xl border border-dashed border-[#d5d9d9] bg-[#f7f7f7] text-[13px] text-[#707070]"
              >
                No drafts waiting — start a new listing
              </Link>
            ) : (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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

            {exportsList.length > 0 ? (
              <section className="mt-6">
                <div className="mb-2 flex items-baseline justify-between">
                  <p className="text-[13px] font-semibold text-[#191919]">
                    Latest CSVs
                  </p>
                  <Link
                    href="/exports"
                    className="text-[12px] font-medium text-[#3665F3]"
                  >
                    View all
                  </Link>
                </div>
                <ul className="divide-y divide-[#eee] overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
                  {exportsList.slice(0, 6).map((row) => (
                    <li key={row.id}>
                      <a
                        href={`/api/csv-history/${row.id}/download`}
                        className="flex items-center justify-between gap-3 px-4 py-3 text-[13px] hover:bg-[#f7f7f7]"
                      >
                        <span className="truncate font-medium text-[#191919]">
                          {row.fileName
                            .replace(/^Higlou_Draft_/, "")
                            .replace(/_\d{4}-\d{2}-\d{2}\.csv$/, "")}
                        </span>
                        <span className="shrink-0 text-[12px] text-[#707070]">
                          {formatRelativeTime(row.createdAt)}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </StudioFrame>
  );
}
