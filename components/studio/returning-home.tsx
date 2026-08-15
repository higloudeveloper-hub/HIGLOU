"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { ListingPipeline } from "@/components/studio/listing-pipeline";
import { EbaySalesPulse } from "@/components/studio/ebay-sales-pulse";
import { StudioFrame } from "@/components/layout/studio-frame";

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

function CoverPhoto({
  src,
  priority = false,
}: {
  src?: string | null;
  priority?: boolean;
}) {
  if (!src) {
    return <div className="absolute inset-0 bg-[#f7f7f7]" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      className="absolute inset-0 size-full object-contain p-1"
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
      hint="One click · eBay · Amazon · Facebook · your site"
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
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
        <div className="flex min-h-0 flex-col bg-[#f7f7f7] p-3 lg:p-4">
          <ListingPipeline storeName={ebayStoreName} />
        </div>

        <div className="flex min-h-0 flex-col border-t border-[#e5e5e5] bg-white lg:border-t-0 lg:border-l">
          <div className="shrink-0 border-b border-[#eee] p-3">
            <EbaySalesPulse />
            {!ebayConnected ? (
              <Link
                href="/settings#ebay-store"
                className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-[#e5e5e5] bg-[#f7f7f7] px-3 py-2.5"
              >
                <p className="text-[12px] font-semibold text-[#191919]">
                  Connect eBay to publish live
                </p>
                <ArrowRight className="size-4 shrink-0 text-[#707070]" />
              </Link>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center justify-between border-b border-[#eee] px-4 py-2.5">
            <p className="text-[13px] font-semibold text-[#191919]">Work queue</p>
            <Link href="/listings" className="text-[12px] font-medium text-[#3665F3]">
              All listings
            </Link>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {drafts.length === 0 ? (
              <Link
                href="/listings/new"
                className="grid min-h-[160px] place-items-center rounded-xl border border-dashed border-[#d5d9d9] bg-[#f7f7f7] text-[13px] text-[#707070]"
              >
                No drafts waiting — start a new listing
              </Link>
            ) : (
              <ul className="space-y-2">
                {drafts.map((draft, i) => (
                  <li key={draft.id}>
                    <Link
                      href={`/listings/${draft.id}`}
                      className="flex gap-3 overflow-hidden rounded-xl border border-[#e5e5e5] bg-white p-2 transition hover:border-[#ccc]"
                    >
                      <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-white">
                        <CoverPhoto src={draft.coverUrl} priority={i === 0} />
                      </div>
                      <div className="min-w-0 py-0.5">
                        <StatusPill status={draft.status} />
                        <p className="mt-1 line-clamp-2 text-[13px] font-medium leading-snug text-[#191919]">
                          {draft.title || "Untitled listing"}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {exportsList.length > 0 ? (
              <section className="mt-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <p className="text-[13px] font-semibold text-[#191919]">Latest CSVs</p>
                  <Link href="/exports" className="text-[12px] font-medium text-[#3665F3]">
                    View all
                  </Link>
                </div>
                <ul className="divide-y divide-[#eee] overflow-hidden rounded-xl border border-[#e5e5e5]">
                  {exportsList.slice(0, 4).map((row) => (
                    <li key={row.id}>
                      <a
                        href={`/api/csv-history/${row.id}/download`}
                        className="flex items-center justify-between gap-3 px-3 py-2.5 text-[12px] hover:bg-[#f7f7f7]"
                      >
                        <span className="truncate font-medium text-[#191919]">
                          {row.fileName
                            .replace(/^Higlou_Draft_/, "")
                            .replace(/_\d{4}-\d{2}-\d{2}\.csv$/, "")}
                        </span>
                        <span className="shrink-0 text-[#707070]">
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
