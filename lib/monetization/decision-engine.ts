import { evaluateAmazonAffiliateChannel } from "@/lib/monetization/channels/affiliate";
import {
  evaluateAmazonSellChannel,
  evaluateEbaySellChannel,
} from "@/lib/monetization/channels/sell";
import { getMonetizationFlags } from "@/lib/monetization/flags";
import { calculateMoneyScore } from "@/lib/monetization/money-score";
import { logMonetizationEvent } from "@/lib/monetization/observability";
import type {
  MonetizationDecision,
  MonetizationInput,
  MonetizationReason,
  MonetizationRecommendation,
} from "@/lib/monetization/types";

function clampConfidence(n: number) {
  return Math.max(0, Math.min(1, Math.round(n * 100) / 100));
}

/**
 * Central monetization decision — explainable, never invents economics.
 * Does not publish or mutate existing sell pipelines.
 */
export function getMonetizationRecommendation(
  input: MonetizationInput,
): MonetizationDecision {
  const flags = getMonetizationFlags();
  const enriched: MonetizationInput = {
    ...input,
    affiliateEngineEnabled:
      input.affiliateEngineEnabled ?? flags.affiliateEngine,
    affiliateTagConfigured:
      input.affiliateTagConfigured ??
      Boolean((process.env.AMAZON_ASSOCIATE_TAG || "").trim()),
    moneyScoreEnabled: input.moneyScoreEnabled ?? flags.moneyScore,
  };

  const amazonSeller = evaluateAmazonSellChannel(enriched);
  const ebaySeller = evaluateEbaySellChannel(enriched);
  const amazonAffiliate = evaluateAmazonAffiliateChannel(enriched);
  const channels = { amazonSeller, ebaySeller, amazonAffiliate };

  const scoreResult = enriched.moneyScoreEnabled
    ? calculateMoneyScore(enriched, channels)
    : {
        score: null as number | null,
        availability: "insufficient" as const,
        factors: [],
      };

  const reasons: MonetizationReason[] = [];
  const warnings: string[] = [];

  const ebayProfit = ebaySeller.netProfit.value;
  const ebayRoi = ebaySeller.roi.value;
  const sellReady =
    ebaySeller.available &&
    ebayProfit != null &&
    ebayProfit >= 8 &&
    (ebayRoi == null || ebayRoi >= 25);

  const sellWeak =
    ebaySeller.available &&
    ebayProfit != null &&
    ebayProfit > 0 &&
    ebayProfit < 8;

  const amazonBlocked =
    amazonSeller.status === "RESTRICTED" ||
    amazonSeller.status === "CONDITION_RESTRICTED";

  const amazonNeedsApproval = amazonSeller.status === "APPROVAL_REQUIRED";
  const amazonSellable = amazonSeller.status === "SELLABLE";

  const affiliateReady =
    amazonAffiliate.available && amazonAffiliate.configured;

  if (ebayProfit != null) {
    reasons.push({
      ok: ebayProfit >= 8,
      text: `eBay estimated net profit $${ebayProfit.toFixed(2)}${
        ebayRoi != null ? ` (ROI ${Math.round(ebayRoi)}%)` : ""
      }`,
    });
  } else if (ebaySeller.salePrice.value != null) {
    reasons.push({
      ok: false,
      text: "eBay price set but cost/fees insufficient for profit",
    });
  } else {
    reasons.push({
      ok: false,
      text: "eBay economics: Insufficient Data",
    });
  }

  reasons.push({
    ok: amazonSellable,
    text:
      amazonSeller.message ||
      `Amazon seller: ${String(amazonSeller.status)}`,
  });

  reasons.push({
    ok: affiliateReady,
    text: amazonAffiliate.message,
  });

  if (ebaySeller.netProfit.availability === "estimated") {
    warnings.push(
      "Profit uses estimated fees and/or default shipping/packing — not an invoice",
    );
  }
  if (amazonAffiliate.configured) {
    warnings.push(
      "Do not assume affiliate commission on self-purchases; follow Amazon Associates policies",
    );
  }
  if (amazonNeedsApproval) {
    warnings.push("Amazon seller approval required before listing");
  }
  if (amazonBlocked) {
    warnings.push("Amazon seller restriction detected");
  }
  if (enriched.soldVerified === false) {
    warnings.push("Sales velocity not verified");
  }

  let recommendation: MonetizationRecommendation = "WATCH";
  let primaryAction = "WATCH PRODUCT";
  let secondaryAction: string | null = null;
  let confidence = 0.35;

  if (amazonBlocked && !sellReady && !affiliateReady) {
    recommendation = "SKIP";
    primaryAction = "SKIP — restricted and no viable lane";
    confidence = 0.7;
    reasons.push({ ok: false, text: "No viable monetization lane" });
  } else if (sellReady && affiliateReady) {
    recommendation = "BOTH";
    primaryAction = "SELL ON EBAY + AFFILIATE";
    secondaryAction = "CREATE AMAZON AFFILIATE LINK";
    confidence = 0.78;
    reasons.push({
      ok: true,
      text: "Strong eBay margin and affiliate channel available",
    });
  } else if (sellReady) {
    recommendation = "SELL";
    primaryAction = "SELL ON EBAY";
    secondaryAction = affiliateReady
      ? "CREATE AMAZON AFFILIATE LINK"
      : amazonNeedsApproval
        ? "Amazon seller — approval required"
        : amazonAffiliate.asin
          ? "Affiliate — configuration available later"
          : null;
    confidence = ebayRoi != null && ebayRoi >= 40 ? 0.82 : 0.68;
    if (amazonBlocked || amazonNeedsApproval) {
      reasons.push({
        ok: true,
        text: "Prefer eBay sell while Amazon seller is limited",
      });
    }
  } else if (affiliateReady && !sellReady) {
    recommendation = "AFFILIATE";
    primaryAction = "CREATE AMAZON AFFILIATE LINK";
    secondaryAction = sellWeak ? "WATCH EBAY MARGIN" : "WATCH PRODUCT";
    confidence = 0.55;
    reasons.push({
      ok: true,
      text: "Affiliate channel available — sell economics insufficient",
    });
  } else if (sellWeak || amazonSellable) {
    recommendation = "WATCH";
    primaryAction = "WATCH PRODUCT";
    secondaryAction = amazonSellable ? "Amazon seller available" : null;
    confidence = 0.45;
  } else {
    recommendation = "WATCH";
    primaryAction = "WATCH PRODUCT";
    confidence = 0.3;
    reasons.push({
      ok: false,
      text: "Insufficient Data for a strong monetization call",
    });
  }

  if (scoreResult.availability === "insufficient") {
    confidence = Math.min(confidence, 0.5);
  }

  const decision: MonetizationDecision = {
    recommendation,
    confidence: clampConfidence(confidence),
    moneyScore: scoreResult.score,
    moneyScoreAvailability: scoreResult.availability,
    reasons,
    channels,
    warnings,
    primaryAction,
    secondaryAction,
  };

  logMonetizationEvent({
    level: "info",
    event: "decision",
    detail: {
      productId: enriched.productId ?? null,
      asin: enriched.asin ?? null,
      recommendation: decision.recommendation,
      moneyScore: decision.moneyScore,
      confidence: decision.confidence,
      missingCost: enriched.cost == null && enriched.amazonPrice == null,
    },
  });

  return decision;
}
