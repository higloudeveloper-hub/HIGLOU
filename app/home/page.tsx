"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  Circle,
  FileSpreadsheet,
  Images,
  Sparkles,
  Store,
  Truck,
  Palette,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/client";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { EmptyPanel, LiveDot, SkeletonBlock } from "@/components/ui/studio";
import { FirstRunHome } from "@/components/studio/first-run-home";
import { MoneyEngine } from "@/components/studio/money-engine";
import { WelcomeGate } from "@/components/studio/welcome-gate";
import { cn } from "@/lib/utils";

type ProductRow = {
  id: string;
  title: string;
  brand: string;
  status: string;
  updatedAt: string;
  coverUrl?: string | null;
  categoryName?: string | null;
};

type CsvRow = {
  id: string;
  fileName: string;
  createdAt: string;
  productId?: string | null;
};

type SetupState = {
  ebayConnected: boolean;
  policiesReady: boolean;
  brandingReady: boolean;
};

function firstNameFromEmail(email: string | null | undefined) {
  if (!email) return null;
  const local = email.split("@")[0]?.trim();
  if (!local) return null;
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function statusTone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("csv") || normalized.includes("ready")) {
    return "Ready to export";
  }
  if (normalized.includes("draft")) return "Draft";
  return "Needs review";
}

export default function HomeWorkspacePage() {
  const [name, setName] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [exportsList, setExportsList] = useState<CsvRow[]>([]);
  const [ready, setReady] = useState(false);
  const [setup, setSetup] = useState<SetupState>({
    ebayConnected: false,
    policiesReady: false,
    brandingReady: false,
  });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled || !user) return;
        const metaName =
          (user.user_metadata?.full_name as string | undefined) ??
          (user.user_metadata?.name as string | undefined) ??
          null;
        setName(metaName?.split(" ")[0] || firstNameFromEmail(user.email));
      } catch {
        /* guest / unconfigured */
      }
    })();

    void (async () => {
      try {
        const res = await fetch("/api/products");
        if (!res.ok) return;
        const body = (await res.json()) as { products: ProductRow[] };
        if (!cancelled) setProducts(body.products ?? []);
      } catch {
        /* degrade gracefully */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    void (async () => {
      try {
        const res = await fetch("/api/csv-history");
        if (!res.ok) return;
        const body = (await res.json()) as { files: CsvRow[] };
        if (!cancelled) setExportsList(body.files ?? []);
      } catch {
        /* degrade gracefully */
      }
    })();

    void (async () => {
      try {
        const [connRes, policyRes, brandRes] = await Promise.all([
          fetch("/api/ebay/connection"),
          fetch("/api/settings/policies"),
          fetch("/api/settings/branding"),
        ]);
        const conn = connRes.ok
          ? ((await connRes.json()) as { connected?: boolean })
          : null;
        const policies = policyRes.ok
          ? ((await policyRes.json()) as {
              policies?: {
                shippingPolicyId?: string;
                returnPolicyId?: string;
                paymentPolicyId?: string;
              };
            })
          : null;
        const branding = brandRes.ok
          ? ((await brandRes.json()) as {
              branding?: { storeName?: string };
              storeName?: string;
            })
          : null;
        if (cancelled) return;
        const p = policies?.policies;
        setSetup({
          ebayConnected: Boolean(conn?.connected),
          policiesReady: Boolean(
            p?.shippingPolicyId?.trim() &&
              p?.returnPolicyId?.trim() &&
              p?.paymentPolicyId?.trim(),
          ),
          brandingReady: Boolean(
            branding?.branding?.storeName?.trim() ||
              branding?.storeName?.trim(),
          ),
        });
      } catch {
        /* degrade gracefully */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const drafts = useMemo(
    () =>
      products
        .filter((p) => {
          const s = (p.status || "").toLowerCase();
          return !s.includes("csv generated") && !s.includes("exported");
        })
        .slice(0, 6),
    [products],
  );

  const greeting = name ? `Welcome back, ${name}` : "Welcome to Higlou";
  const draftCount = products.filter((p) => {
    const s = (p.status || "").toLowerCase();
    return !s.includes("csv generated") && !s.includes("exported");
  }).length;
  const setupItems = [
    {
      done: setup.ebayConnected,
      title: "Connect eBay",
      body: "Link your seller account",
      href: "/settings#ebay-store",
      icon: Store,
    },
    {
      done: setup.policiesReady,
      title: "Shipping & returns",
      body: "Create or import the 3 policies",
      href: "/settings#policies",
      icon: Truck,
    },
    {
      done: setup.brandingReady,
      title: "Store branding",
      body: "Name and listing look",
      href: "/settings#branding",
      icon: Palette,
    },
  ] as const;
  const setupDoneCount = setupItems.filter((i) => i.done).length;
  const setupComplete = setupDoneCount === setupItems.length;

  const isFirstRun = ready && products.length === 0;

  return (
    <WelcomeGate>
    <AppShell hideHeader>
      {!ready ? (
        <div className="mx-auto max-w-3xl space-y-4 pt-6">
          <SkeletonBlock className="h-8 w-40" />
          <SkeletonBlock className="h-16 w-3/4" />
          <SkeletonBlock className="h-48 rounded-3xl" />
          <div className="grid gap-3 sm:grid-cols-2">
            <SkeletonBlock className="h-28 rounded-2xl" />
            <SkeletonBlock className="h-28 rounded-2xl" />
          </div>
        </div>
      ) : isFirstRun ? (
        <FirstRunHome
          name={name}
          setupDoneCount={setupDoneCount}
          setupItems={setupItems.map(({ done, title, body, href }) => ({
            done,
            title,
            body,
            href,
          }))}
        />
      ) : (
      <div className="mx-auto max-w-3xl">
        <section className="relative overflow-hidden pb-8 pt-2">
          <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.22em] text-muted-foreground">
            <LiveDot />
            Listing engine
          </p>
          <h1 className="mt-3 font-display text-4xl tracking-tight text-foreground sm:text-5xl">
            {greeting}
          </h1>
          <p className="mt-3 max-w-lg text-base text-muted-foreground">
            Photos in. Higlou writes. You publish. Same four parts, every listing.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/listings/new"
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-foreground px-6 text-sm font-semibold text-background transition hover:opacity-90"
            >
              <Sparkles className="size-4" />
              New listing
            </Link>
            {!setupComplete ? (
              <Link
                href="/settings#ebay-store"
                className="inline-flex h-12 items-center gap-2 rounded-xl border border-border bg-surface px-5 text-sm font-medium text-foreground hover:bg-muted"
              >
                Finish setup
                <ArrowRight className="size-4" />
              </Link>
            ) : null}
          </div>
        </section>

        <div className="mb-8">
          <MoneyEngine compact />
        </div>

        <section className="grid gap-3 sm:grid-cols-3">
          {[
            {
              label: "Listings",
              value: ready ? String(products.length) : "—",
              icon: Images,
            },
            {
              label: "In progress",
              value: ready ? String(draftCount) : "—",
              icon: Sparkles,
            },
            {
              label: "CSV exports",
              value: ready ? String(exportsList.length) : "—",
              icon: FileSpreadsheet,
            },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="rounded-2xl border border-border/80 bg-surface px-4 py-4"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    {stat.label}
                  </p>
                  <Icon className="size-4 text-muted-foreground" />
                </div>
                <p className="mt-2 font-display text-3xl tracking-tight">
                  {stat.value}
                </p>
              </div>
            );
          })}
        </section>

        <section className="border-t border-border/80 py-8">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Get ready to sell
            </h2>
            <p className="text-sm text-muted-foreground">
              {setupDoneCount}/{setupItems.length} done
            </p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {setupItems.map((item, index) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-2xl border px-4 py-4 transition",
                    item.done
                      ? "border-success/30 bg-success-soft/40"
                      : "border-border bg-surface hover:bg-muted/60",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                      Step {index + 1}
                    </span>
                    {item.done ? (
                      <Check className="size-4 text-success" strokeWidth={3} />
                    ) : (
                      <Circle className="size-4 text-muted-foreground/50" />
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Icon className="size-4 text-foreground/80" />
                    <p className="text-sm font-semibold text-foreground">
                      {item.title}
                    </p>
                  </div>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {item.body}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="space-y-4 border-t border-border/80 py-8">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Continue working
            </h2>
            <Link
              href="/listings"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              All listings
            </Link>
          </div>
          { !ready ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex gap-3 rounded-2xl border border-border/70 bg-surface p-3"
                >
                  <SkeletonBlock className="size-16 rounded-xl" />
                  <div className="flex-1 space-y-2 py-1">
                    <SkeletonBlock className="h-4 w-3/4" />
                    <SkeletonBlock className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : drafts.length === 0 ? (
            <EmptyPanel
              title="No drafts yet"
              body="Start a listing and Higlou drafts title, category, and specifics from your photos."
              action={
                <Link
                  href="/listings/new"
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-foreground px-5 text-sm font-semibold text-background"
                >
                  <Sparkles className="size-4" />
                  New listing
                </Link>
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {drafts.map((draft) => (
                <Link
                  key={draft.id}
                  href={`/listings/${draft.id}`}
                  className="group flex gap-3 rounded-2xl border border-border/70 bg-surface p-3 transition hover:bg-muted/50"
                >
                  <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                    {draft.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={draft.coverUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-[10px] text-muted-foreground">
                        No photo
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 py-0.5">
                    <p className="truncate text-sm font-medium text-foreground">
                      {draft.title || "Untitled listing"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {draft.brand || "Brand TBD"} · {statusTone(draft.status)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground/80">
                      Edited {formatRelativeTime(draft.updatedAt)}
                    </p>
                  </div>
                  <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground/40 transition group-hover:text-foreground" />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4 border-t border-border/80 py-8">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Recent exports
            </h2>
            <Link
              href="/exports"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              View all
            </Link>
          </div>
          {exportsList.length === 0 ? (
            <EmptyPanel
              title="No exports yet"
              body="When you export a CSV for eBay Seller Hub, it lands here."
            />
          ) : (
            <ul className="space-y-2">
              {exportsList.slice(0, 5).map((row) => (
                <li key={row.id}>
                  <a
                    href={`/api/csv-history/${row.id}/download`}
                    className="flex items-center justify-between gap-3 rounded-xl px-1 py-2.5 text-sm transition hover:bg-surface"
                  >
                    <span className="truncate font-medium text-foreground">
                      {row.fileName}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatRelativeTime(row.createdAt)}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      )}
    </AppShell>
    </WelcomeGate>
  );
}
