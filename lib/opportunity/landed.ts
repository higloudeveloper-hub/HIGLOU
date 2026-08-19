import { estimateEbayReferralFee } from "@/lib/opportunity/profit";
import { OPPORTUNITY_RULES } from "@/lib/opportunity/types";

function money(n: number) {
  return Math.round(n * 100) / 100;
}

function ratio(n: number) {
  return Math.round(n * 1000) / 1000;
}

export function conservativeSalePrice(opts: {
  soldVerified?: boolean;
  medianSold30?: number | null;
  p25Sold90?: number | null;
}): number | null {
  if (!opts.soldVerified) return null;
  const median = opts.medianSold30;
  const p25 = opts.p25Sold90;
  if (median != null && p25 != null) return money(Math.min(median, p25));
  return median ?? p25 ?? null;
}

export function estimateLandedCost(opts: {
  amazonPrice: number | null;
  amazonShipping?: number | null;
  salesTaxRate?: number;
  salePrice: number | null;
  ebayFee?: number | null;
  promotedRate?: number;
  outboundShipping?: number | null;
  packing?: number | null;
  returnsRate?: number;
  priceDropRate?: number;
}): {
  amazonShipping: number;
  salesTax: number;
  ebayFee: number | null;
  promotedFee: number;
  outboundShipping: number;
  packing: number;
  returnsReserve: number | null;
  priceDropReserve: number | null;
  totalCost: number | null;
  netProfit: number | null;
  roi: number | null;
  margin: number | null;
} {
  const amazon = opts.amazonPrice && opts.amazonPrice > 0 ? opts.amazonPrice : null;
  const sale = opts.salePrice && opts.salePrice > 0 ? opts.salePrice : null;
  const amazonShipping = opts.amazonShipping ?? 0;
  const taxRate = opts.salesTaxRate ?? OPPORTUNITY_RULES.salesTaxRate;
  const salesTax = amazon != null ? money(amazon * taxRate) : 0;
  const outbound = opts.outboundShipping ?? OPPORTUNITY_RULES.defaultOutboundShip;
  const packing = opts.packing ?? OPPORTUNITY_RULES.defaultPacking;
  const ebayFee =
    opts.ebayFee ?? (sale != null ? estimateEbayReferralFee(sale) : null);
  const promotedRate = opts.promotedRate ?? OPPORTUNITY_RULES.promotedRate;
  const promotedFee = sale != null ? money(sale * promotedRate) : 0;
  const returnsRate = opts.returnsRate ?? OPPORTUNITY_RULES.returnsRate;
  const dropRate = opts.priceDropRate ?? OPPORTUNITY_RULES.priceDropRate;
  const returnsReserve = sale != null ? money(sale * returnsRate) : null;
  const priceDropReserve = sale != null ? money(sale * dropRate) : null;
  if (
    amazon == null ||
    sale == null ||
    ebayFee == null ||
    returnsReserve == null ||
    priceDropReserve == null
  ) {
    return {
      amazonShipping,
      salesTax,
      ebayFee,
      promotedFee,
      outboundShipping: outbound,
      packing,
      returnsReserve,
      priceDropReserve,
      totalCost: null,
      netProfit: null,
      roi: null,
      margin: null,
    };
  }
  const totalCost = money(
    amazon +
      amazonShipping +
      salesTax +
      ebayFee +
      promotedFee +
      outbound +
      packing +
      returnsReserve +
      priceDropReserve,
  );
  const net = money(sale - totalCost);
  return {
    amazonShipping,
    salesTax,
    ebayFee,
    promotedFee,
    outboundShipping: outbound,
    packing,
    returnsReserve,
    priceDropReserve,
    totalCost,
    netProfit: net,
    roi: ratio(net / totalCost),
    margin: ratio(net / sale),
  };
}

export function sellThrough90(sold90: number | null, active: number | null): number | null {
  const sold = sold90 ?? 0;
  const competitors = active ?? 0;
  if (sold <= 0 && competitors <= 0) return null;
  return ratio(sold / (sold + competitors));
}

export function daysToSellEstimate(
  sold30: number | null,
  active: number | null,
): number | null {
  if (sold30 == null || sold30 <= 0) return null;
  const competitors = Math.max(1, active ?? 1);
  return Math.max(1, Math.round((competitors / sold30) * 30));
}
