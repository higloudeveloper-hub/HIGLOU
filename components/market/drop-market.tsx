"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Loader2, Search, Sparkles, Store } from "lucide-react";
import {
  mergeMarketFeed,
  type MarketDropPublic,
} from "@/lib/market/from-opportunity";
import { loadLocalLedger } from "@/lib/opportunity/ledger";
import { marketSpread } from "@/lib/market/catalog";
import { cn } from "@/lib/utils";

function localVerifiedDrops(): MarketDropPublic[] {
  try {
    const ledger = loadLocalLedger("amazon_to_ebay");
    return mergeMarketFeed({ ledgerHits: ledger.hits, limit: 40 }).drops;
  } catch {
    return [];
  }
}

function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function signed(n: number) {
  const abs = money(Math.abs(n));
  return n >= 0 ? `+${abs}` : `−${abs}`;
}

export function DropMarketStudio() {
  const router = useRouter();
  const [drops, setDrops] = useState<MarketDropPublic[]>([]);
  const [note, setNote] = useState("Loading verified winners…");
  const [tagReady, setTagReady] = useState(false);
  const [ledgerCount, setLedgerCount] = useState(0);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const local = localVerifiedDrops();
    if (local.length) {
      setDrops(local);
      setLedgerCount(local.length);
      setNote(
        `${local.length} Higlou-verified winner${local.length === 1 ? "" : "s"} from Find Winners`,
      );
      setLoading(false);
    }
    void (async () => {
      try {
        const res = await fetch("/api/market/feed");
        if (!res.ok) throw new Error("feed");
        const body = (await res.json()) as {
          drops?: MarketDropPublic[];
          note?: string;
          affiliateTagConfigured?: boolean;
          ledgerCount?: number;
        };
        if (cancelled) return;
        const remote = body.drops || [];
        // Prefer remote when it has stock; otherwise keep local verified winners.
        if (remote.length) {
          setDrops(remote);
          setLedgerCount(Number(body.ledgerCount) || remote.length);
          setNote(body.note || "");
        } else if (!local.length) {
          setDrops([]);
          setLedgerCount(0);
          setNote(
            body.note ||
              "Market is empty until Find Winners verifies a real ask spread.",
          );
        }
        setTagReady(Boolean(body.affiliateTagConfigured));
        setActive(0);
      } catch {
        if (!cancelled && !local.length) setNote("Could not load market feed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const drop = drops[active] ?? null;
  const openKeep = useMemo(
    () => drops.reduce((sum, d) => sum + Math.max(0, d.netProfit ?? marketSpread(d)), 0),
    [drops],
  );

  const claim = useCallback(
    async (id: string) => {
      setBusy(id);
      try {
        const res = await fetch("/api/market/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dropId: id }),
        });
        const body = (await res.json()) as {
          error?: string;
          href?: string;
          note?: string;
        };
        if (!res.ok) {
          toast.error(body.error || "Could not add to your store");
          return;
        }
        toast.success("In your store — draft ready");
        if (body.note) toast.message(body.note);
        if (body.href) router.push(body.href);
      } catch {
        toast.error("Claim failed");
      } finally {
        setBusy(null);
      }
    },
    [router],
  );

  const earnLink = useCallback(async (item: MarketDropPublic) => {
    if (!item.asin) {
      toast.message("ASIN required — run Find Winners");
      return;
    }
    setBusy(`aff-${item.id}`);
    try {
      if (item.affiliateUrl) {
        window.open(item.affiliateUrl, "_blank", "noopener,noreferrer");
      }
      const res = await fetch("/api/money/affiliate/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asin: item.asin,
          source: "market",
          campaignName: "Higlou Market",
          createSmartLink: true,
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        link?: { destinationUrl?: string };
        smartLink?: { path?: string };
        warnings?: string[];
      };
      if (!res.ok) {
        if (!item.affiliateUrl) {
          toast.error(body.error || "Affiliate failed — check Settings tag");
        }
        return;
      }
      toast.success("Affiliate link ready");
      body.warnings?.slice(0, 1).forEach((w) => toast.message(w));
      if (body.smartLink?.path) {
        await navigator.clipboard?.writeText(
          `${window.location.origin}${body.smartLink.path}`,
        );
        toast.message("Smart link copied");
      } else if (body.link?.destinationUrl) {
        await navigator.clipboard?.writeText(body.link.destinationUrl);
      }
    } catch {
      toast.error("Affiliate failed");
    } finally {
      setBusy(null);
    }
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#f6f4ef] text-[#141414]">
      <header className="shrink-0 border-b border-[#e4e0d8] bg-[#141414] px-5 py-5 text-white md:px-8">
        <p className="font-display text-[13px] tracking-[0.2em] text-[#f4c928] uppercase">
          Higlou
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl leading-none md:text-4xl">
              Market
            </h1>
            <p className="mt-2 max-w-xl text-[14px] text-white/65">
              Only platform-verified winners from Find Winners. No demo
              catalog — if it is here, Higlou checked the ask keep.
            </p>
          </div>
          <Link
            href="/winners"
            className="inline-flex h-10 items-center gap-2 bg-[#f4c928] px-4 text-[13px] font-semibold text-[#141414]"
          >
            <Search className="size-4" />
            Find winners
          </Link>
        </div>
      </header>

      <div className="shrink-0 border-b border-[#e4e0d8] bg-white px-5 py-3 md:px-8">
        <div className="flex flex-wrap gap-4 text-[12px] text-[#6b6560]">
          <span className="inline-flex items-center gap-1.5">
            <Store className="size-3.5" />
            <strong className="text-[#141414]">{drops.length}</strong> verified
            on floor
          </span>
          <span>
            Pipeline keep{" "}
            <strong className="text-[#141414]">{signed(openKeep)}</strong>
          </span>
          <span>
            Ledger{" "}
            <strong className="text-[#141414]">{ledgerCount}</strong>
          </span>
          <span>{tagReady ? "Affiliate tag ready" : "Set tag in Settings"}</span>
          {!loading && note ? <span className="text-[#8a847c]">{note}</span> : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex min-h-[320px] items-center justify-center gap-2 text-[14px] text-[#6b6560]">
            <Loader2 className="size-4 animate-spin" />
            Loading verified winners…
          </div>
        ) : drops.length === 0 ? (
          <div className="mx-auto flex min-h-[420px] max-w-lg flex-col items-center justify-center px-6 text-center">
            <p className="font-display text-2xl text-[#141414]">
              Market is empty
            </p>
            <p className="mt-2 text-[14px] leading-relaxed text-[#6b6560]">
              Run Find Winners. Products with real Amazon cost vs eBay low-ask
              keep after fees stock this floor automatically — nothing invented.
            </p>
            <Link
              href="/winners"
              className="mt-6 inline-flex h-12 items-center gap-2 bg-[#141414] px-6 text-[14px] font-semibold text-white"
            >
              <Search className="size-4" />
              Open Find Winners
            </Link>
          </div>
        ) : (
          <div className="mx-auto grid max-w-6xl gap-6 px-5 py-6 md:grid-cols-[1.1fr_0.9fr] md:px-8">
            <div className="space-y-3">
              <p className="text-[11px] font-semibold tracking-[0.18em] text-[#6b6560] uppercase">
                Verified floor
              </p>
              <ul className="grid gap-3">
                {drops.map((item, i) => {
                  const keep = item.netProfit ?? marketSpread(item);
                  const selected = i === active;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setActive(i)}
                        className={cn(
                          "flex w-full gap-4 border bg-white p-3 text-left transition",
                          selected ? "border-[#141414]" : "border-[#e4e0d8]",
                        )}
                      >
                        <div className="relative size-20 shrink-0 overflow-hidden bg-[#f0ebe3]">
                          {item.photo ? (
                            <Image
                              src={item.photo}
                              alt=""
                              fill
                              className="object-contain p-1"
                              unoptimized
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-semibold tracking-wide text-[#6b6560] uppercase">
                            {item.name}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug">
                            {item.title}
                          </p>
                          <p className="mt-1 text-[13px] text-[#6b6560]">
                            Buy {money(item.buy)} → List {money(item.sell)}
                          </p>
                          <p className="mt-1 text-[11px] text-[#8a847c]">
                            {item.note || "Platform verified"}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[11px] font-semibold tracking-wide text-[#6b6560] uppercase">
                            You keep
                          </p>
                          <p
                            className={cn(
                              "font-display text-2xl leading-none",
                              keep >= 12 ? "text-[#1f7a4d]" : "text-[#141414]",
                            )}
                          >
                            {signed(keep)}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {drop ? (
              <aside className="sticky top-4 h-fit border border-[#e4e0d8] bg-white p-5">
                <div className="relative mx-auto aspect-square max-w-[280px] bg-[#f0ebe3]">
                  {drop.photo ? (
                    <Image
                      src={drop.photo}
                      alt={drop.title}
                      fill
                      className="object-contain p-4"
                      unoptimized
                    />
                  ) : null}
                </div>
                <p className="mt-4 text-[11px] font-semibold tracking-wide text-[#6b6560] uppercase">
                  {drop.name} · verified
                </p>
                <h2 className="mt-1 font-display text-2xl leading-tight">
                  {drop.title}
                </h2>
                <p className="mt-2 text-[13px] text-[#6b6560]">{drop.blurb}</p>
                <div className="mt-4 flex flex-wrap gap-4 text-[13px]">
                  <span>
                    Cost{" "}
                    <strong className="tabular-nums">{money(drop.buy)}</strong>
                  </span>
                  <span>
                    List{" "}
                    <strong className="tabular-nums">{money(drop.sell)}</strong>
                  </span>
                  <span>
                    Keep{" "}
                    <strong className="tabular-nums text-[#1f7a4d]">
                      {signed(drop.netProfit ?? marketSpread(drop))}
                    </strong>
                  </span>
                </div>
                {drop.asin ? (
                  <p className="mt-2 text-[11px] text-[#8a847c]">ASIN {drop.asin}</p>
                ) : null}
                <div className="mt-6 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy === drop.id}
                    onClick={() => void claim(drop.id)}
                    className="inline-flex h-11 items-center gap-2 bg-[#141414] px-5 text-[13px] font-semibold text-white disabled:opacity-50"
                  >
                    {busy === drop.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    Add to my store
                  </button>
                  {drop.asin ? (
                    <button
                      type="button"
                      disabled={busy === `aff-${drop.id}`}
                      onClick={() => void earnLink(drop)}
                      className="inline-flex h-11 items-center gap-2 border border-[#141414] bg-white px-4 text-[13px] font-semibold disabled:opacity-50"
                    >
                      <ExternalLink className="size-4" />
                      Earn link
                    </button>
                  ) : null}
                </div>
              </aside>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
