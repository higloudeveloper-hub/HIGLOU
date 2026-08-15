"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StudioFrame } from "@/components/layout/studio-frame";
import { EmptyPanel, SkeletonBlock } from "@/components/ui/studio";
import { cn } from "@/lib/utils";

type CostDashboard = {
  disclaimer: string;
  status: "ok" | "warning" | "high_warning" | "over_limit";
  percentOfBudgetUsed: number;
  budget: {
    monthlyProductTarget: number;
    monthlyBudgetWarningUsd: number;
    monthlyBudgetLimitUsd: number;
    enforcementMode: string;
  };
  snapshot: {
    productsProcessed: number;
    openAICost: number;
    googleVisionCost: number;
    zxingScans: number;
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    ocrUnits: number;
    cacheHits: number;
    retries: number;
    imagesAnalyzed: number;
  };
  projection: {
    estimatedAiCostToDate: number;
    estimatedInfrastructure: number;
    estimatedTotalToDate: number;
    averageCostPerProduct: number;
    projectedMonthEndTotal: number;
    productsRemainingToTarget: number;
  };
};

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

function statusLabel(status: CostDashboard["status"]) {
  switch (status) {
    case "warning":
      return "Warning (~75%)";
    case "high_warning":
      return "High warning (~90%)";
    case "over_limit":
      return "At / over target";
    default:
      return "On track";
  }
}

export default function UsageCostsPage() {
  const [data, setData] = useState<CostDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/costs")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load cost dashboard");
        const json = (await res.json()) as CostDashboard;
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AppShell hideHeader flush>
      <StudioFrame
        kicker="Spend"
        title="Usage & costs"
        hint="Estimates only — not an invoice"
        action={
          <Link
            href="/settings"
            className="inline-flex h-9 items-center rounded-full px-3 text-[13px] font-medium text-[#3665F3]"
          >
            Settings
          </Link>
        }
        scroll={false}
      >
        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.15fr)]">
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto border-b border-[#e5e5e5] bg-[#f7f7f7] p-5 lg:border-r lg:border-b-0">
            {!data && !error ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonBlock key={i} className="h-24 rounded-xl" />
                ))}
              </div>
            ) : error ? (
              <EmptyPanel title="Couldn’t load usage" body={error} />
            ) : data ? (
              <>
                <div className="rounded-xl border border-[#e5e5e5] bg-white px-4 py-3">
                  <p className="text-[11px] font-semibold tracking-[0.16em] text-[#707070] uppercase">
                    {statusLabel(data.status)}
                  </p>
                  <p className="mt-1 text-[22px] font-semibold tabular-nums text-[#191919]">
                    {data.percentOfBudgetUsed.toFixed(0)}%
                    <span className="ml-1.5 text-[13px] font-medium text-[#707070]">
                      of ${data.budget.monthlyBudgetLimitUsd} target
                    </span>
                  </p>
                  <p className="mt-2 text-[12px] leading-relaxed text-[#707070]">
                    {data.disclaimer}
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Metric
                    label="Products processed"
                    value={`${data.snapshot.productsProcessed} / ${data.budget.monthlyProductTarget}`}
                  />
                  <Metric
                    label="Products remaining"
                    value={String(data.projection.productsRemainingToTarget)}
                  />
                  <Metric
                    label="Estimated AI"
                    value={money(data.projection.estimatedAiCostToDate)}
                  />
                  <Metric
                    label="Estimated total"
                    value={money(data.projection.estimatedTotalToDate)}
                  />
                  <Metric
                    label="Avg / product"
                    value={
                      data.snapshot.productsProcessed > 0
                        ? money(data.projection.averageCostPerProduct)
                        : "—"
                    }
                  />
                  <Metric
                    label="Projected month-end"
                    value={money(data.projection.projectedMonthEndTotal)}
                  />
                </div>
              </>
            ) : null}
          </div>

          <div className="min-h-0 overflow-y-auto bg-white p-5">
            {data ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-xl border border-[#e5e5e5] bg-white p-4">
                  <h2 className="text-[14px] font-semibold text-[#191919]">
                    Usage this month
                  </h2>
                  <div className="mt-3 space-y-2 text-[13px] text-[#565959]">
                    <Row label="Images analyzed" value={data.snapshot.imagesAnalyzed} />
                    <Row label="OpenAI input tokens" value={data.snapshot.inputTokens} />
                    <Row label="OpenAI output tokens" value={data.snapshot.outputTokens} />
                    <Row
                      label="OpenAI cached tokens"
                      value={data.snapshot.cachedInputTokens}
                    />
                    <Row label="Google Vision OCR units" value={data.snapshot.ocrUnits} />
                    <Row label="ZXing successful scans" value={data.snapshot.zxingScans} />
                    <Row label="Cache hits" value={data.snapshot.cacheHits} />
                    <Row label="Retries" value={data.snapshot.retries} />
                  </div>
                </section>
                <section className="rounded-xl border border-[#e5e5e5] bg-white p-4">
                  <h2 className="text-[14px] font-semibold text-[#191919]">
                    Cost breakdown
                  </h2>
                  <div className="mt-3 space-y-2 text-[13px] text-[#565959]">
                    <Row label="OpenAI" value={money(data.snapshot.openAICost)} />
                    <Row
                      label="Google Vision"
                      value={money(data.snapshot.googleVisionCost)}
                    />
                    <Row
                      label="Fixed infra (allocated)"
                      value={money(data.projection.estimatedInfrastructure)}
                    />
                    <p className="pt-2 text-[12px] leading-relaxed text-[#9b9b9b]">
                      Infrastructure is an internal allocation estimate (Supabase +
                      Vercel + misc).
                    </p>
                  </div>
                </section>
              </div>
            ) : null}
          </div>
        </div>
      </StudioFrame>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#e5e5e5] bg-white px-4 py-3">
      <p className="text-[11px] font-medium tracking-wide text-[#707070] uppercase">
        {label}
      </p>
      <p className="mt-1 text-[20px] font-semibold tabular-nums text-[#191919]">
        {value}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={cn("flex items-center justify-between gap-3")}>
      <span>{label}</span>
      <span className="font-medium tabular-nums text-[#191919]">{value}</span>
    </div>
  );
}
