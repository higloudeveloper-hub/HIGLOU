import type {
  MonetizationChannels,
  MonetizationInput,
  MoneyScoreResult,
} from "@/lib/monetization/types";

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

/**
 * Money Score 0–100 — separate from opportunity score.
 * Missing critical economics → Insufficient Data (score null).
 */
export function calculateMoneyScore(
  input: MonetizationInput,
  channels: MonetizationChannels,
): MoneyScoreResult {
  const factors: MoneyScoreResult["factors"] = [];

  const ebayProfit = channels.ebaySeller.netProfit.value;
  const amzProfit = channels.amazonSeller.netProfit.value;
  const bestProfit =
    ebayProfit != null || amzProfit != null
      ? Math.max(ebayProfit ?? -Infinity, amzProfit ?? -Infinity)
      : null;
  const bestRoi = (() => {
    const e = channels.ebaySeller.roi.value;
    const a = channels.amazonSeller.roi.value;
    if (e == null && a == null) return null;
    return Math.max(e ?? -Infinity, a ?? -Infinity);
  })();

  const hasEconomics =
    (channels.ebaySeller.cost.availability === "known" ||
      channels.amazonSeller.cost.availability === "known") &&
    (channels.ebaySeller.salePrice.availability === "known" ||
      channels.amazonSeller.salePrice.availability === "known") &&
    bestProfit != null;

  if (!hasEconomics) {
    factors.push({
      id: "economics",
      points: null,
      max: 35,
      note: "Insufficient Data — need cost and sale price for profit",
    });
    return { score: null, availability: "insufficient", factors };
  }

  let profitPts = 0;
  if (bestProfit != null) {
    if (bestProfit >= 20) profitPts = 20;
    else if (bestProfit >= 12) profitPts = 16;
    else if (bestProfit >= 8) profitPts = 12;
    else if (bestProfit > 0) profitPts = 6;
    else profitPts = 0;
  }
  factors.push({
    id: "profit",
    points: profitPts,
    max: 20,
    note:
      bestProfit == null
        ? "Insufficient Data"
        : `Best estimated net profit $${bestProfit.toFixed(2)}`,
  });

  let roiPts = 0;
  if (bestRoi != null) {
    if (bestRoi >= 50) roiPts = 15;
    else if (bestRoi >= 30) roiPts = 11;
    else if (bestRoi > 0) roiPts = 5;
  }
  factors.push({
    id: "roi",
    points: roiPts,
    max: 15,
    note: bestRoi == null ? "ROI unknown" : `ROI ${Math.round(bestRoi)}%`,
  });

  let demandPts: number | null = null;
  if (input.demandScore != null) {
    demandPts = Math.min(15, Math.max(0, Math.round(input.demandScore * 0.75)));
  }
  factors.push({
    id: "demand",
    points: demandPts,
    max: 15,
    note:
      demandPts == null
        ? "Demand Insufficient Data"
        : `Demand signal ${input.demandScore}`,
  });

  let competitionPts: number | null = null;
  if (input.sellerCount != null) {
    if (input.sellerCount <= 8) competitionPts = 10;
    else if (input.sellerCount <= 15) competitionPts = 7;
    else competitionPts = 3;
  }
  factors.push({
    id: "competition",
    points: competitionPts,
    max: 10,
    note:
      competitionPts == null
        ? "Competition Insufficient Data"
        : `${input.sellerCount} sellers`,
  });

  let eligibilityPts = 5;
  const amz = channels.amazonSeller.status;
  if (amz === "SELLABLE") eligibilityPts = 12;
  else if (amz === "APPROVAL_REQUIRED") eligibilityPts = 4;
  else if (amz === "RESTRICTED" || amz === "CONDITION_RESTRICTED") {
    eligibilityPts = 0;
  } else if (amz === "UNKNOWN" || amz === "NOT_CONNECTED") {
    eligibilityPts = 4;
  }
  if (channels.ebaySeller.available) eligibilityPts = Math.min(15, eligibilityPts + 3);
  factors.push({
    id: "eligibility",
    points: eligibilityPts,
    max: 15,
    note: `Amazon: ${String(amz)}; eBay: ${channels.ebaySeller.available ? "available" : "limited"}`,
  });

  let affiliatePts = 0;
  if (channels.amazonAffiliate.configured) {
    affiliatePts = channels.amazonAffiliate.available ? 10 : 4;
  } else {
    affiliatePts = 2;
  }
  factors.push({
    id: "affiliate",
    points: affiliatePts,
    max: 10,
    note: channels.amazonAffiliate.message,
  });

  let inventoryPts = 5;
  if (input.quantity != null) {
    if (input.quantity <= 0) inventoryPts = 2;
    else if (input.quantity <= 3) inventoryPts = 8;
    else inventoryPts = 6;
  }
  factors.push({
    id: "inventory",
    points: inventoryPts,
    max: 8,
    note:
      input.quantity == null
        ? "Inventory unknown — neutral"
        : `Qty ${input.quantity}`,
  });

  const knownPoints = factors
    .map((f) => f.points)
    .filter((p): p is number => p != null);
  const knownMax = factors
    .filter((f) => f.points != null)
    .reduce((sum, f) => sum + f.max, 0);

  if (knownMax < 40) {
    return { score: null, availability: "insufficient", factors };
  }

  const raw = (knownPoints.reduce((a, b) => a + b, 0) / knownMax) * 100;
  return {
    score: clamp(raw),
    availability: "known",
    factors,
  };
}
