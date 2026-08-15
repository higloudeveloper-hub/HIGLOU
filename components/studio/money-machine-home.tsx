"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { ListingPipeline } from "@/components/studio/listing-pipeline";
import { LiveDot } from "@/components/ui/studio";

type Draft = {
  id: string;
  title: string;
};

export function MoneyMachineHome({
  name,
  storeName,
  nextDraft,
  ebayConnected,
  setupHref,
}: {
  name: string | null;
  storeName?: string | null;
  nextDraft?: Draft | null;
  ebayConnected: boolean;
  setupHref?: string | null;
}) {
  const hello = name ? `${name}, make money` : "Make money";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white md:h-full">
      <div className="flex shrink-0 items-center gap-4 bg-[#3665F3] px-5 py-2.5 text-white">
        <span className="relative flex size-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-white/70" />
          <span className="relative size-2 rounded-full bg-white" />
        </span>
        <p className="text-[11px] font-semibold tracking-[0.2em] uppercase">
          Money machine
        </p>
        <p className="hidden min-w-0 flex-1 truncate text-[13px] text-white/80 sm:block">
          Photos in · Higlou writes · one click · eBay · Amazon · Facebook · your website
        </p>
      </div>

      <header className="flex shrink-0 items-center gap-3 border-b border-[#e5e5e5] px-5 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.18em] text-[#707070] uppercase">
            <LiveDot /> Easy money
          </p>
          <h1 className="truncate text-[17px] font-semibold tracking-tight text-[#191919]">
            {hello}
          </h1>
        </div>
        <Link
          href="/listings/new"
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#3665F3] px-5 text-[13px] font-semibold text-white"
        >
          <Sparkles className="size-3.5" />
          New listing
        </Link>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_240px]">
        <ListingPipeline storeName={storeName} />

        <aside className="flex min-h-0 flex-col border-t border-[#e5e5e5] bg-[#f7f7f7] lg:border-t-0 lg:border-l">
          <p className="shrink-0 border-b border-[#e5e5e5] bg-white px-4 py-2.5 text-[12px] font-semibold tracking-[0.14em] text-[#707070] uppercase">
            Your next click
          </p>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
            <Link
              href="/listings/new"
              className="rounded-xl bg-[#3665F3] px-4 py-3 text-white"
            >
              <p className="text-[14px] font-semibold">1. Drop photos</p>
              <p className="mt-0.5 text-[12px] text-white/80">
                That’s the only hard part.
              </p>
            </Link>
            {nextDraft ? (
              <Link
                href={`/listings/${nextDraft.id}`}
                className="rounded-xl border border-[#e5e5e5] bg-white px-4 py-3"
              >
                <p className="text-[14px] font-semibold text-[#191919]">
                  2. Finish this one
                </p>
                <p className="mt-0.5 line-clamp-2 text-[12px] text-[#707070]">
                  {nextDraft.title || "Untitled listing"}
                </p>
              </Link>
            ) : (
              <Link
                href="/stats"
                className="rounded-xl border border-[#e5e5e5] bg-white px-4 py-3"
              >
                <p className="text-[14px] font-semibold text-[#191919]">
                  2. Collect the money
                </p>
                <p className="mt-0.5 text-[12px] text-[#707070]">
                  Offers and price drops, one tap.
                </p>
              </Link>
            )}
            {!ebayConnected && setupHref ? (
              <Link
                href={setupHref}
                className="flex items-center justify-between rounded-xl border border-[#e5e5e5] bg-white px-4 py-3"
              >
                <div>
                  <p className="text-[14px] font-semibold text-[#191919]">
                    3. Connect eBay
                  </p>
                  <p className="mt-0.5 text-[12px] text-[#707070]">
                    Then one click goes live.
                  </p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-[#707070]" />
              </Link>
            ) : (
              <Link
                href="/stats"
                className="flex items-center justify-between rounded-xl border border-[#e5e5e5] bg-white px-4 py-3"
              >
                <div>
                  <p className="text-[14px] font-semibold text-[#191919]">
                    3. Live machine
                  </p>
                  <p className="mt-0.5 text-[12px] text-[#707070]">
                    Watch carts. Send the offer.
                  </p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-[#707070]" />
              </Link>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
