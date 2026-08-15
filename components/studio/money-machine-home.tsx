"use client";

import { useState } from "react";
import Link from "next/link";
import { ListingPipeline } from "@/components/studio/listing-pipeline";
import { ListingCard } from "@/components/studio/listing-card";
import { MarketPromos } from "@/components/studio/market-promos";
import { NewListingButton } from "@/components/brand/new-listing-button";
import { HomeWallet } from "@/components/studio/home-wallet";
import { ReadyGrabGhost } from "@/components/studio/ready-grab-ghost";
import { formatRelativeTime } from "@/lib/format-relative-time";
import {
  READY_LISTINGS,
  type ReadyListing,
  type StoryItem,
} from "@/components/studio/ready-catalog";

export type HomeDraft = {
  id: string;
  title: string;
  brand?: string | null;
  status?: string;
  updatedAt?: string;
  coverUrl?: string | null;
  price?: number | null;
};

function statusLabel(status?: string) {
  const s = (status || "").toLowerCase();
  if (s.includes("csv") || s.includes("ready") || s.includes("exported")) {
    return { label: "Ready", ready: true };
  }
  if (s.includes("draft")) return { label: "Draft", ready: false };
  return { label: "Needs a look", ready: false };
}

export function MoneyMachineHome({
  storeName,
  drafts = [],
  readyListings,
}: {
  name?: string | null;
  storeName?: string | null;
  nextDraft?: { id: string; title: string } | null;
  ebayConnected?: boolean;
  setupHref?: string | null;
  drafts?: HomeDraft[];
  readyListings?: ReadyListing[];
}) {
  const listings =
    readyListings && readyListings.length > 0 ? readyListings : READY_LISTINGS;
  const storyCatalog: StoryItem[] = listings.map((item) => ({
    name: item.name,
    title: item.title,
    description: item.description,
    price: item.sell,
    comps: item.comps,
    photos: item.photos,
  }));
  const [wallet, setWallet] = useState(0);
  const [resting, setResting] = useState(false);
  const [story, setStory] = useState<{
    sku: number;
    phase: "grab" | "drag" | "drop" | "gone";
    cover: string;
  }>({ sku: 0, phase: "gone", cover: "" });

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white md:h-full">
      <div className="flex shrink-0 items-center gap-4 bg-[#3665F3] px-5 py-2.5 text-white">
        <span className="size-2 rounded-full bg-white" />
        <p className="text-[11px] font-semibold tracking-[0.2em] uppercase">
          Money machine
        </p>
        <p className="hidden min-w-0 flex-1 truncate text-[13px] text-white/85 sm:block">
          One photo. Five live storefronts.
        </p>
        <HomeWallet available={wallet} compact />
        <NewListingButton tone="on-blue" size="sm" className="shrink-0" />
      </div>

      <div className="relative grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
        <ListingPipeline
          storeName={storeName}
          catalogItems={storyCatalog}
          onWallet={setWallet}
          onStory={setStory}
          onRest={setResting}
        />

        <aside className="flex min-h-0 flex-col border-t border-[#eee] bg-[#f3f3f3] lg:border-t-0 lg:border-l">
          <HomeWallet available={wallet} />
          <div className="flex shrink-0 items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-[15px] font-medium tracking-tight text-[#191919]">
                Ready to list
              </p>
              <p className="mt-0.5 text-[12px] text-[#707070]">
                Cost in. List price out. You keep the spread.
              </p>
            </div>
            <Link
              href="/listings/new"
              className="shrink-0 text-[13px] font-medium text-[#3665F3]"
            >
              List one
            </Link>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            <MarketPromos activeIndex={resting ? -1 : story.sku} listings={listings} />
            {drafts.length > 0 ? (
              <div className="mt-6">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[13px] font-semibold text-[#191919]">Your drafts</p>
                  <Link href="/listings" className="text-[13px] font-semibold text-[#3665F3]">
                    See all
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {drafts.map((draft, i) => {
                    const ready = statusLabel(draft.status);
                    return (
                      <ListingCard
                        key={draft.id}
                        href={`/listings/${draft.id}`}
                        photo={draft.coverUrl}
                        title={draft.title}
                        brand={draft.brand}
                        meta={
                          draft.updatedAt
                            ? formatRelativeTime(draft.updatedAt)
                            : undefined
                        }
                        price={
                          draft.price != null
                            ? `$${draft.price.toFixed(2)}`
                            : null
                        }
                        badge={ready.label}
                        badgeTone={ready.ready ? "ready" : "muted"}
                        priority={i < 2}
                      />
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </aside>
        {story.phase !== "gone" ? (
          <ReadyGrabGhost
            key={story.sku}
            sku={story.sku}
            phase={story.phase}
            src={story.cover}
          />
        ) : null}
      </div>
    </div>
  );
}
