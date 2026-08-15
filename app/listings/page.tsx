"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { StudioFrame } from "@/components/layout/studio-frame";
import { EmptyPanel, SkeletonBlock } from "@/components/ui/studio";
import { ListingPipeline } from "@/components/studio/listing-pipeline";
import { ListingCard } from "@/components/studio/listing-card";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { cn } from "@/lib/utils";

type ProductRow = {
  id: string;
  title: string;
  brand: string;
  sku: string;
  status: string;
  price: number | null;
  updatedAt: string;
  coverUrl?: string | null;
  categoryName?: string | null;
};

function readiness(status: string): { label: string; ready: boolean } {
  const s = status.toLowerCase();
  if (s.includes("csv") || s.includes("ready") || s.includes("exported")) {
    return { label: "Ready to export", ready: true };
  }
  if (s.includes("draft")) {
    return { label: "Draft", ready: false };
  }
  return { label: "Needs review", ready: false };
}

export default function ListingsPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "draft" | "ready">("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/products");
        if (response.status === 401 || response.status === 503) {
          if (!cancelled) {
            setError("Sign in to see your listings.");
            setProducts([]);
          }
          return;
        }
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error || "Failed to load listings");
        }
        const body = (await response.json()) as { products: ProductRow[] };
        if (!cancelled) setProducts(body.products ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load listings");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      const ready = readiness(p.status);
      if (filter === "draft" && ready.ready) return false;
      if (filter === "ready" && !ready.ready) return false;
      if (!q) return true;
      const hay = [p.title, p.brand, p.sku, p.categoryName, p.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [products, query, filter]);

  const draftCount = products.filter((p) => !readiness(p.status).ready).length;
  const readyCount = products.length - draftCount;

  return (
    <AppShell hideHeader flush>
      <StudioFrame
        kicker="Library"
        title="Listings"
        hint={`${products.length} in the store`}
        action={
          <Link
            href="/listings/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#3665F3] px-4 text-[13px] font-semibold text-white"
          >
            <Plus className="size-3.5" />
            New listing
          </Link>
        }
        scroll={false}
      >
        <div className="grid min-h-0 flex-1 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="flex shrink-0 flex-col gap-3 border-b border-[#e5e5e5] bg-[#f7f7f7] p-4 lg:border-r lg:border-b-0">
            <label className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-[#9b9b9b]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="h-9 w-full rounded-full border border-[#ccc] bg-white pr-3 pl-8 text-[13px] text-[#191919] outline-none focus:border-[#3665F3]"
              />
            </label>
            <div className="grid gap-1">
              {(
                [
                  { id: "all" as const, label: "All", count: products.length },
                  { id: "draft" as const, label: "Drafts", count: draftCount },
                  { id: "ready" as const, label: "Ready", count: readyCount },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={cn(
                    "flex items-center justify-between rounded-full px-3 py-2 text-left text-[13px] font-medium",
                    filter === item.id
                      ? "bg-[#3665F3] text-white"
                      : "text-[#565959] hover:bg-white hover:text-[#191919]",
                  )}
                >
                  {item.label}
                  <span
                    className={cn(
                      "tabular-nums",
                      filter === item.id ? "text-white/80" : "text-[#9b9b9b]",
                    )}
                  >
                    {item.count}
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <div className="min-h-0 flex-1 overflow-y-auto bg-white p-5">
            {loading ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white"
                  >
                    <SkeletonBlock className="aspect-[4/3] rounded-none" />
                    <div className="space-y-2 p-3">
                      <SkeletonBlock className="h-3 w-20" />
                      <SkeletonBlock className="h-4 w-4/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="grid min-h-full place-items-center">
                <EmptyPanel
                  title="Couldn’t load listings"
                  body={error}
                  action={
                    <button
                      type="button"
                      onClick={() => window.location.reload()}
                      className="rounded-full bg-[#191919] px-4 py-2.5 text-sm font-semibold text-white"
                    >
                      Retry
                    </button>
                  }
                />
              </div>
            ) : filtered.length === 0 ? (
              <div className="grid min-h-full place-items-center gap-6">
                {products.length === 0 ? <ListingPipeline compact /> : null}
                <EmptyPanel
                  title={products.length === 0 ? "No listings yet" : "No matches"}
                  body={
                    products.length === 0
                      ? "Drop photos on New listing — Higlou drafts the eBay fields for you."
                      : "Try a different search or filter."
                  }
                  action={
                    products.length === 0 ? (
                      <Link
                        href="/listings/new"
                        className="inline-flex h-10 items-center rounded-full bg-[#3665F3] px-5 text-sm font-semibold text-white"
                      >
                        New listing
                      </Link>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {filtered.map((product, i) => {
                  const ready = readiness(product.status);
                  return (
                    <ListingCard
                      key={product.id}
                      href={`/listings/${product.id}`}
                      photo={product.coverUrl}
                      title={product.title}
                      brand={product.brand}
                      meta={formatRelativeTime(product.updatedAt)}
                      price={
                        product.price != null
                          ? `$${product.price.toFixed(2)}`
                          : null
                      }
                      badge={ready.label}
                      badgeTone={ready.ready ? "ready" : "muted"}
                      priority={i < 4}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </StudioFrame>
    </AppShell>
  );
}
