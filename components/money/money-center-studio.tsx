"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { cn } from "@/lib/utils";

type DashboardPayload = {
  enabled?: boolean;
  demo?: boolean;
  revenue?: {
    amazonSales: number | null;
    ebaySales: number | null;
    affiliateRevenue: number | null;
    availability?: string;
    notes?: string[];
  };
  profit?: {
    estimatedGross: number | null;
    estimatedNet: number | null;
    availability?: string;
    note?: string;
  };
  performance?: {
    clicks: number;
    uniqueClicks: number | null;
    conversions: number | null;
    conversionRate: number | null;
    revenuePerClick: number | null;
    notes?: string[];
  };
  inventory?: {
    activeProducts: number | null;
    lowStock: number | null;
    potentialWinners: number | null;
  };
  opportunities?: Record<string, number>;
};

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-surface p-5">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-2 font-display text-3xl tracking-tight text-foreground tabular-nums">
        {value}
      </p>
      {hint ? (
        <p className="mt-2 text-[12px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function moneyOrNa(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "Not Available";
  return `$${v.toFixed(2)}`;
}

function numOrNa(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "Not Available";
  return String(v);
}

export function MoneyCenterStudio() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/money/dashboard");
        if (res.status === 404) {
          if (!cancelled) setDisabled(true);
          return;
        }
        if (!res.ok) {
          if (!cancelled) setError("Could not load Money Center");
          return;
        }
        const body = (await res.json()) as DashboardPayload;
        if (!cancelled) setData(body);
      } catch {
        if (!cancelled) setError("Could not load Money Center");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (disabled) {
    return (
      <AppShell
        title="Money Center"
        description="Enable MONEY_ENGINE_ENABLED to activate this module."
      >
        <div className="rounded-2xl border border-border bg-surface p-8 text-sm text-muted-foreground">
          Money Engine is off. Set <code>MONEY_ENGINE_ENABLED=true</code> in
          your environment and restart. Existing Higlou flows stay unchanged
          while it is disabled.
        </div>
      </AppShell>
    );
  }

  const opp = data?.opportunities || {};

  return (
    <AppShell
      title="Money Center"
      description="Private monetization OS — real data only. Unknown stays Unknown."
      actions={
        <Link
          href="/listings/new"
          className="inline-flex h-9 items-center rounded-lg bg-brand px-3 text-[13px] font-semibold text-brand-foreground"
        >
          New listing
        </Link>
      }
    >
      <div className="space-y-8">
        {data?.demo ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-[13px] font-semibold text-amber-950">
            DEMO DATA
          </div>
        ) : null}
        {error ? (
          <p className="text-sm text-amber-800">{error}</p>
        ) : null}

        <section>
          <h2 className="mb-3 font-display text-2xl tracking-tight">Revenue</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Metric
              label="Amazon Sales"
              value={moneyOrNa(data?.revenue?.amazonSales)}
              hint="API Required for order sync"
            />
            <Metric
              label="eBay Sales"
              value={moneyOrNa(data?.revenue?.ebaySales)}
              hint="From ebay_sold_qty × price when present"
            />
            <Metric
              label="Affiliate Revenue"
              value={moneyOrNa(data?.revenue?.affiliateRevenue)}
              hint="Only attributed provider reports"
            />
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-display text-2xl tracking-tight">Profit</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Metric
              label="Estimated Gross Profit"
              value={moneyOrNa(data?.profit?.estimatedGross)}
              hint={data?.profit?.note || "Insufficient Data"}
            />
            <Metric
              label="Estimated Net Profit"
              value={moneyOrNa(data?.profit?.estimatedNet)}
              hint={data?.profit?.availability || "insufficient"}
            />
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-display text-2xl tracking-tight">
            Performance
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Metric label="Clicks" value={numOrNa(data?.performance?.clicks)} />
            <Metric
              label="Unique Clicks"
              value={numOrNa(data?.performance?.uniqueClicks)}
              hint="Not Available until privacy-safe unique tracking"
            />
            <Metric
              label="Conversions"
              value={numOrNa(data?.performance?.conversions)}
              hint="Not invented — provider attribution only"
            />
            <Metric
              label="Conversion Rate"
              value={
                data?.performance?.conversionRate == null
                  ? "Not Available"
                  : `${(data.performance.conversionRate * 100).toFixed(1)}%`
              }
            />
            <Metric
              label="Revenue Per Click"
              value={moneyOrNa(data?.performance?.revenuePerClick)}
            />
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-display text-2xl tracking-tight">
            Inventory
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Metric
              label="Active Products"
              value={numOrNa(data?.inventory?.activeProducts)}
            />
            <Metric
              label="Low Stock"
              value={numOrNa(data?.inventory?.lowStock)}
            />
            <Metric
              label="Potential Winners"
              value={numOrNa(data?.inventory?.potentialWinners)}
              hint="From opportunity ledger count"
            />
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-display text-2xl tracking-tight">
            Opportunities
          </h2>
          <div className="grid gap-3 sm:grid-cols-4">
            {(["SELL", "AFFILIATE", "BOTH", "WATCH"] as const).map((key) => (
              <div
                key={key}
                className={cn(
                  "rounded-2xl border border-border/70 bg-surface px-4 py-4",
                )}
              >
                <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  {key}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {opp[key] ?? 0}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12.5px] text-muted-foreground">
            Counts come from saved monetization_opportunities rows. Empty means
            no stored decisions yet — not fake zeros presented as performance.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
