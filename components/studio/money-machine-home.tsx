"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { ListingPipeline } from "@/components/studio/listing-pipeline";
import { ListingCard } from "@/components/studio/listing-card";
import { MarketPromos } from "@/components/studio/market-promos";
import { NewListingButton } from "@/components/brand/new-listing-button";
import { HomeWallet } from "@/components/studio/home-wallet";
import { ReadyGrabGhost } from "@/components/studio/ready-grab-ghost";
import { amazonListingUrl } from "@/lib/amazon/asin";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { type ReadyListing, type StoryItem } from "@/components/studio/ready-catalog";
import { marketDropsToReadyListings } from "@/lib/market/home-winners";
import type { MarketDropPublic } from "@/lib/market/from-opportunity";

export type HomeDraft = {
  id: string;
  title: string;
  brand?: string | null;
  sku?: string | null;
  amazonAsin?: string | null;
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
  readyListings: _readyListings,
  connectHref = null,
  showRestCta = false,
}: {
  name?: string | null;
  storeName?: string | null;
  nextDraft?: { id: string; title: string } | null;
  ebayConnected?: boolean;
  setupHref?: string | null;
  connectHref?: string | null;
  showRestCta?: boolean;
  drafts?: HomeDraft[];
  /** @deprecated Home animation uses live Market feed only */
  readyListings?: ReadyListing[];
}) {
  const [floorListings, setFloorListings] = useState<ReadyListing[] | null>(
    null,
  );
  const [wallet, setWallet] = useState(0);
  const [resting, setResting] = useState(false);
  const [story, setStory] = useState<{
    sku: number;
    phase: "grab" | "drag" | "drop" | "gone";
    cover: string;
  }>({ sku: 0, phase: "gone", cover: "" });

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/market/feed", { cache: "no-store" });
        if (!res.ok) throw new Error("feed");
        const body = (await res.json()) as { drops?: MarketDropPublic[] };
        if (!alive) return;
        setFloorListings(marketDropsToReadyListings(body.drops || [], 8));
      } catch {
        if (alive) setFloorListings([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Exact winners only — never mix demo SKUs with the live floor.
  const listings: ReadyListing[] =
    floorListings === null
      ? [] // loading — wait for feed so animation matches Market
      : floorListings;

  const usingLiveWinners = listings.length > 0;
  const storyCatalog: StoryItem[] = listings.map((item) => ({
    name: item.name,
    title: item.title,
    description: item.description,
    price: item.sell,
    comps: item.comps,
    photos: item.photos,
    marketHref: item.marketId
      ? `/market?drop=${encodeURIComponent(item.marketId)}`
      : "/market",
  }));

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white md:h-full">
      <div className="flex shrink-0 items-center gap-4 bg-[#3665F3] px-5 py-2.5 text-white">
        <span className="size-2 rounded-full bg-white" />
        <p className="text-[11px] font-semibold tracking-[0.2em] uppercase">
          Money machine
        </p>
        <p className="hidden min-w-0 flex-1 truncate text-[13px] text-white/85 sm:block">
          {usingLiveWinners
            ? "Winners verificados · click abre Market"
            : "One photo. Five live storefronts."}
        </p>
        {connectHref ? (
          <a
            href={connectHref}
            className="shrink-0 text-[13px] font-medium text-white/90 underline-offset-2 hover:underline"
          >
            Connect eBay
          </a>
        ) : null}
        <HomeWallet available={wallet} compact />
        <NewListingButton tone="on-blue" size="sm" className="shrink-0" />
      </div>

      <div className="relative grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
        {floorListings === null ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 bg-[#fafafa] px-6 text-center">
            <p className="text-[13px] text-[#6b6560]">Cargando winners del Market…</p>
          </div>
        ) : listings.length > 0 ? (
          <ListingPipeline
            storeName={storeName}
            catalogItems={storyCatalog}
            onWallet={setWallet}
            onStory={setStory}
            onRest={setResting}
            showRestCta={showRestCta}
          />
        ) : (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 bg-[#fafafa] px-6 text-center">
            <Sparkles className="size-6 text-[#3665F3]" />
            <p className="font-display text-[28px] leading-none text-[#141414]">
              Sin winners aún
            </p>
            <p className="max-w-sm text-[14px] text-[#6b6560]">
              Escanea Find Winners. Los productos verificados aparecen aquí —
              sin duplicados, sin demos.
            </p>
            <Link
              href="/winners"
              className="mt-2 inline-flex h-11 items-center rounded-full bg-[#141414] px-5 text-[13px] font-semibold text-white"
            >
              Abrir Find Winners
            </Link>
          </div>
        )}

        <aside className="flex min-h-0 flex-col border-t border-[#eee] bg-[#f3f3f3] lg:border-t-0 lg:border-l">
          <HomeWallet available={wallet} />
          <div className="flex shrink-0 items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-[15px] font-medium tracking-tight text-[#191919]">
                {usingLiveWinners ? "Winners en Market" : "Ready to list"}
              </p>
              <p className="mt-0.5 text-[12px] text-[#707070]">
                {usingLiveWinners
                  ? "Mismos productos del floor · click → Market"
                  : "Cost in. Six stores out. You keep the spread."}
              </p>
            </div>
            <Link
              href="/market"
              className="shrink-0 text-[13px] font-medium text-[#3665F3]"
            >
              Open market
            </Link>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {listings.length > 0 ? (
              <MarketPromos
                activeIndex={resting ? -1 : story.sku}
                listings={listings}
              />
            ) : (
              <p className="rounded-2xl border border-dashed border-[#ddd] bg-white px-4 py-8 text-center text-[13px] text-[#707070]">
                Cuando haya winners, la animación y esta lista muestran
                exactamente esos productos — sin repetir.
              </p>
            )}
            <p className="mt-3 text-[12px] text-[#707070]">
              Hot drops con motion viven en{" "}
              <Link href="/market" className="font-medium text-[#3665F3]">
                Higlou Market
              </Link>
              .
            </p>
            {drafts.length > 0 ? (
              <div className="mt-6">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[13px] font-semibold text-[#191919]">
                    Your drafts
                  </p>
                  <Link
                    href="/listings"
                    className="text-[13px] font-semibold text-[#3665F3]"
                  >
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
                        amazonHref={
                          amazonListingUrl({
                            sku: draft.sku || "",
                            amazonAsin: draft.amazonAsin || "",
                          }) || null
                        }
                      />
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </aside>
        {story.phase !== "gone" && listings.length > 0 ? (
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
