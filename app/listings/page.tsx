"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { EmptyPanel, SkeletonBlock } from "@/components/ui/studio";
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
    if (!q) return products;
    return products.filter((p) => {
      const hay = [p.title, p.brand, p.sku, p.categoryName, p.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [products, query]);

  return (
    <AppShell
      title="Listings"
      description="Your product library — open a draft, polish, export."
      actions={
        <Link
          href="/listings/new"
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-foreground px-4 text-sm font-medium text-background hover:opacity-90"
        >
          <Plus className="size-4" />
          New listing
        </Link>
      }
    >
      <div className="mb-8 max-w-md">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search brand, title, SKU…"
            className="h-11 w-full rounded-xl border-0 bg-surface pl-10 pr-4 text-sm text-foreground shadow-sm ring-1 ring-border placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/40"
          />
        </label>
      </div>

      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-2xl border border-border/70 bg-surface"
            >
              <SkeletonBlock className="aspect-[4/3] rounded-none" />
              <div className="space-y-2 p-4">
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="h-4 w-4/5" />
                <SkeletonBlock className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <EmptyPanel
          title="Couldn’t load listings"
          body={error}
          action={
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background"
            >
              Retry
            </button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyPanel
          title={products.length === 0 ? "No listings yet" : "No matches"}
          body={
            products.length === 0
              ? "Drop photos on New listing — Higlou drafts the eBay fields for you."
              : "Try a different search."
          }
          action={
            products.length === 0 ? (
              <Link
                href="/listings/new"
                className="inline-flex h-11 items-center rounded-xl bg-foreground px-5 text-sm font-semibold text-background"
              >
                New listing
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((product) => {
            const ready = readiness(product.status);
            return (
              <Link
                key={product.id}
                href={`/listings/${product.id}`}
                className="group flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-surface transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="relative aspect-[4/3] bg-zinc-100">
                  {product.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.coverUrl}
                      alt=""
                      className="size-full object-cover transition duration-500 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-xs text-zinc-400">
                      No photo yet
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2 px-4 py-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                      {product.brand || "Brand TBD"}
                    </p>
                    <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-zinc-950">
                      {product.title || "Untitled listing"}
                    </h3>
                  </div>
                  {product.categoryName ? (
                    <p className="truncate text-xs text-zinc-500">
                      {product.categoryName}
                    </p>
                  ) : null}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <span
                      className={cn(
                        "text-xs font-medium",
                        ready.ready ? "text-emerald-700" : "text-zinc-500",
                      )}
                    >
                      {ready.label}
                    </span>
                    <span className="text-[11px] text-zinc-400">
                      {formatRelativeTime(product.updatedAt)}
                    </span>
                  </div>
                  <span className="pt-1 text-sm font-medium text-zinc-950 underline-offset-4 group-hover:underline">
                    Open
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
