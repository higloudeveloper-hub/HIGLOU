import {
  estimateEbayReferralFee,
  estimateNetProfit,
} from "@/lib/opportunity/profit";
import type { EligibilityStatus } from "@/lib/opportunity/types";
import type {
  MonetizationInput,
  MoneyValue,
  SellChannelSnapshot,
} from "@/lib/monetization/types";

function money(
  value: number | null | undefined,
  availability: MoneyValue["availability"],
  label?: string,
): MoneyValue {
  if (value == null || !Number.isFinite(value)) {
    return {
      value: null,
      availability: availability === "estimated" ? "unknown" : availability,
      label,
    };
  }
  return {
    value: Math.round(value * 100) / 100,
    availability,
    label,
  };
}

function amazonSellerStatus(input: MonetizationInput): {
  available: boolean;
  status: SellChannelSnapshot["status"];
  message: string;
} {
  if (input.amazonSellerConnected === false) {
    return {
      available: false,
      status: "NOT_CONNECTED",
      message: "Amazon seller not connected",
    };
  }
  const el = input.amazonEligibility;
  if (!el || el === "UNKNOWN") {
    return {
      available: false,
      status: "UNKNOWN",
      message:
        input.amazonEligibilityMessage ||
        "Amazon eligibility unknown — API required",
    };
  }
  if (el === "API_ERROR") {
    return {
      available: false,
      status: "API_ERROR" as EligibilityStatus,
      message: input.amazonEligibilityMessage || "Amazon eligibility API error",
    };
  }
  if (el === "SELLABLE") {
    return {
      available: true,
      status: "SELLABLE",
      message: input.amazonEligibilityMessage || "You can sell on Amazon",
    };
  }
  if (el === "APPROVAL_REQUIRED") {
    return {
      available: false,
      status: "APPROVAL_REQUIRED",
      message: input.amazonEligibilityMessage || "Amazon approval required",
    };
  }
  return {
    available: false,
    status: el,
    message:
      input.amazonEligibilityMessage ||
      "Amazon seller restriction detected",
  };
}

function buildProfitLane(opts: {
  salePrice: number | null;
  cost: number | null;
  fees: number | null;
  shipping: number | null | undefined;
  packing: number | null | undefined;
  feeIsEstimated: boolean;
}): Pick<
  SellChannelSnapshot,
  | "salePrice"
  | "cost"
  | "fees"
  | "shipping"
  | "packing"
  | "netProfit"
  | "roi"
  | "margin"
> {
  const saleAvail: MoneyValue["availability"] =
    opts.salePrice != null ? "known" : "insufficient";
  const costAvail: MoneyValue["availability"] =
    opts.cost != null ? "known" : "insufficient";
  const feeAvail: MoneyValue["availability"] =
    opts.fees != null
      ? opts.feeIsEstimated
        ? "estimated"
        : "known"
      : "insufficient";

  const shippingProvided = opts.shipping != null;
  const packingProvided = opts.packing != null;

  const profit = estimateNetProfit({
    salePrice: opts.salePrice,
    cost: opts.cost,
    marketplaceFee: opts.fees,
    shipping: opts.shipping,
    packing: opts.packing,
  });

  const hasCore =
    opts.salePrice != null && opts.cost != null && opts.fees != null;
  const profitAvail: MoneyValue["availability"] = !hasCore
    ? "insufficient"
    : shippingProvided && packingProvided
      ? opts.feeIsEstimated
        ? "estimated"
        : "estimated"
      : "estimated";

  return {
    salePrice: money(opts.salePrice, saleAvail),
    cost: money(opts.cost, costAvail),
    fees: money(opts.fees, feeAvail, opts.feeIsEstimated ? "estimated" : undefined),
    shipping: money(
      profit.shipping,
      shippingProvided ? "known" : "estimated",
      shippingProvided ? undefined : "default estimate",
    ),
    packing: money(
      profit.packing,
      packingProvided ? "known" : "estimated",
      packingProvided ? undefined : "default estimate",
    ),
    netProfit: money(profit.netProfit, profitAvail),
    roi: money(
      profit.roi != null ? profit.roi * 100 : null,
      profit.netProfit == null ? "insufficient" : "estimated",
      "percent",
    ),
    margin: money(
      profit.margin != null ? profit.margin * 100 : null,
      profit.netProfit == null ? "insufficient" : "estimated",
      "percent",
    ),
  };
}

/** eBay sell lane — reuses estimateNetProfit / estimateEbayReferralFee only. */
export function evaluateEbaySellChannel(
  input: MonetizationInput,
): SellChannelSnapshot {
  const connected = input.ebayConnected !== false;
  const salePrice = input.ebayPrice ?? null;
  const cost =
    input.cost ??
    (input.amazonPrice != null && input.amazonPrice > 0
      ? input.amazonPrice
      : null);
  const fees =
    input.ebayFees ??
    (salePrice != null ? estimateEbayReferralFee(salePrice) : null);
  const feeIsEstimated = input.ebayFees == null && fees != null;

  const lane = buildProfitLane({
    salePrice,
    cost,
    fees,
    shipping: input.shipping,
    packing: input.packing,
    feeIsEstimated,
  });

  return {
    available: connected && salePrice != null && salePrice > 0,
    status: connected ? "AVAILABLE" : "NOT_CONNECTED",
    message: !connected
      ? "eBay store not connected"
      : salePrice == null
        ? "eBay sale price not set"
        : cost == null
          ? "eBay lane available — product cost unknown (profit insufficient)"
          : "eBay seller lane available",
    ...lane,
  };
}

/** Amazon seller lane — consumes eligibility; does not call publish APIs. */
export function evaluateAmazonSellChannel(
  input: MonetizationInput,
): SellChannelSnapshot {
  const status = amazonSellerStatus(input);
  const salePrice = input.amazonPrice ?? null;
  const cost = input.cost ?? null;
  const fees = input.amazonFees ?? null;

  const lane = buildProfitLane({
    salePrice,
    cost,
    fees,
    shipping: input.shipping,
    packing: input.packing,
    feeIsEstimated: false,
  });

  return {
    available: status.available,
    status: status.status,
    message: status.message,
    ...lane,
  };
}
