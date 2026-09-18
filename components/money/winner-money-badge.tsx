"use client";

import { useMemo } from "react";
import type { OpportunityProduct } from "@/lib/opportunity/types";
import { recommendFromOpportunity } from "@/lib/monetization/from-opportunity";
import { cn } from "@/lib/utils";

const LABEL: Record<string, string> = {
  SELL: "SELL",
  AFFILIATE: "AFF",
  BOTH: "BOTH",
  WATCH: "WATCH",
  SKIP: "SKIP",
};

/**
 * Compact Money Engine verdict on a Find Winners row.
 * Uses the same hit economics already scored — no duplicate API scan.
 */
export function WinnerMoneyBadge({
  hit,
  enabled,
}: {
  hit: OpportunityProduct;
  enabled: boolean;
}) {
  const decision = useMemo(() => {
    if (!enabled) return null;
    return recommendFromOpportunity(hit, {
      moneyScoreEnabled: true,
      affiliateEngineEnabled: false,
      affiliateTagConfigured: false,
    });
  }, [hit, enabled]);

  if (!enabled || !decision) return null;

  const tone =
    decision.recommendation === "SELL" || decision.recommendation === "BOTH"
      ? "bg-[#0f1111] text-[#f4c928]"
      : decision.recommendation === "SKIP"
        ? "bg-[#f3f3f3] text-[#565959]"
        : "bg-[#232f3e] text-white";

  const score =
    decision.moneyScore == null
      ? "—"
      : String(decision.moneyScore);

  return (
    <span
      className={cn(
        "inline-flex flex-col gap-0.5 rounded px-1.5 py-1 text-[10px] font-semibold tracking-wide",
        tone,
      )}
      title={[
        decision.primaryAction,
        ...decision.reasons.slice(0, 3).map((r) => r.text),
      ].join(" · ")}
    >
      <span>{LABEL[decision.recommendation] || decision.recommendation}</span>
      <span className="tabular-nums opacity-90">{score}</span>
    </span>
  );
}
