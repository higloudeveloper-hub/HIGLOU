import type { OpportunityProduct } from "@/lib/opportunity/types";
import { recommendFromOpportunity } from "@/lib/monetization/from-opportunity";
import type {
  MonetizationDecision,
  MonetizationRecommendation,
} from "@/lib/monetization/types";
import { logMonetizationEvent } from "@/lib/monetization/observability";

export type AutopilotMode = "suggest_only" | "queue_ready";

export type AutopilotAction = {
  asin: string;
  title: string;
  brand: string;
  imageUrl: string;
  recommendation: MonetizationRecommendation;
  moneyScore: number | null;
  primaryAction: string;
  secondaryAction: string | null;
  estimatedProfit: number | null;
  confidence: number;
  reasons: string[];
  href: string;
};

export type AutopilotCycleResult = {
  mode: AutopilotMode;
  scanned: number;
  queued: number;
  actions: AutopilotAction[];
  learningNote: string;
  safeGuards: string[];
};

function profitFromDecision(d: MonetizationDecision): number | null {
  const ebay = d.channels.ebaySeller.netProfit.value;
  const amz = d.channels.amazonSeller.netProfit.value;
  if (ebay == null && amz == null) return null;
  return Math.max(ebay ?? -Infinity, amz ?? -Infinity);
}

/**
 * Autopilot v1 — ranks existing market opportunities into money actions.
 * Does NOT publish, buy inventory, or place affiliate self-orders.
 * Learning = persist ranked recommendations for later reinforcement.
 */
export function runAutopilotOnOpportunities(
  hits: OpportunityProduct[],
  opts?: { mode?: AutopilotMode; limit?: number },
): AutopilotCycleResult {
  const mode = opts?.mode || "suggest_only";
  const limit = Math.min(Math.max(opts?.limit || 12, 1), 40);

  const ranked: AutopilotAction[] = hits
    .filter((hit) => /^[A-Z0-9]{10}$/i.test(String(hit.asin || "")))
    .map((hit) => {
      const decision = recommendFromOpportunity(hit, {
        moneyScoreEnabled: true,
        affiliateEngineEnabled: false,
        affiliateTagConfigured: false,
      });
      return {
        asin: hit.asin.toUpperCase(),
        title: hit.title || hit.asin,
        brand: hit.brand || "",
        imageUrl: hit.imageUrl || "",
        recommendation: decision.recommendation,
        moneyScore: decision.moneyScore,
        primaryAction: decision.primaryAction,
        secondaryAction: decision.secondaryAction,
        estimatedProfit: profitFromDecision(decision),
        confidence: decision.confidence,
        reasons: decision.reasons.slice(0, 4).map((r) => r.text),
        href: `/winners`,
      };
    })
    .filter(
      (row) =>
        row.recommendation === "SELL" ||
        row.recommendation === "BOTH" ||
        row.recommendation === "AFFILIATE" ||
        (row.recommendation === "WATCH" && (row.moneyScore ?? 0) >= 55),
    )
    .sort((a, b) => {
      const sa = a.moneyScore ?? -1;
      const sb = b.moneyScore ?? -1;
      if (sb !== sa) return sb - sa;
      return (b.estimatedProfit ?? -1) - (a.estimatedProfit ?? -1);
    })
    .slice(0, limit);

  const result: AutopilotCycleResult = {
    mode,
    scanned: hits.length,
    queued: ranked.length,
    actions: ranked,
    learningNote:
      "Higlou ranks what Find Winners / ledger already found across Amazon→eBay lanes. Each cycle teaches which recommendations you act on.",
    safeGuards: [
      "Never auto-publishes to eBay or Amazon without your click",
      "Never auto-buys inventory",
      "Never claims affiliate commission on self-purchase",
      "Skips hits with Insufficient Data for economics when possible",
    ],
  };

  logMonetizationEvent({
    level: "info",
    event: "autopilot_cycle",
    detail: {
      mode,
      scanned: result.scanned,
      queued: result.queued,
      top: ranked.slice(0, 5).map((a) => ({
        asin: a.asin,
        recommendation: a.recommendation,
        moneyScore: a.moneyScore,
      })),
    },
  });

  return result;
}
