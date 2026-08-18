export type ProfitInput = {
  salePrice: number | null;
  cost: number | null;
  marketplaceFee: number | null;
  shipping?: number | null;
  packing?: number | null;
  returnsRate?: number | null;
};

export type ProfitResult = {
  shipping: number;
  packing: number;
  returnsReserve: number | null;
  netProfit: number | null;
  roi: number | null;
  margin: number | null;
};

const DEFAULT_SHIPPING = 7.5;
const DEFAULT_PACKING = 0.75;
const DEFAULT_RETURNS_RATE = 0.03;

function money(n: number) {
  return Math.round(n * 100) / 100;
}

function ratio(n: number) {
  return Math.round(n * 1000) / 1000;
}

/** Net profit after product cost, marketplace fee, ship, pack, and returns reserve. */
export function estimateNetProfit(input: ProfitInput): ProfitResult {
  const sale = input.salePrice && input.salePrice > 0 ? input.salePrice : null;
  const cost = input.cost && input.cost > 0 ? input.cost : null;
  const fee =
    input.marketplaceFee != null && input.marketplaceFee >= 0
      ? input.marketplaceFee
      : null;
  const shipping = input.shipping != null ? input.shipping : DEFAULT_SHIPPING;
  const packing = input.packing != null ? input.packing : DEFAULT_PACKING;
  const returnsRate =
    input.returnsRate != null ? input.returnsRate : DEFAULT_RETURNS_RATE;
  const returnsReserve = sale != null ? money(sale * returnsRate) : null;
  if (sale == null || cost == null || fee == null || returnsReserve == null) {
    return {
      shipping,
      packing,
      returnsReserve,
      netProfit: null,
      roi: null,
      margin: null,
    };
  }
  const net = money(sale - cost - fee - shipping - packing - returnsReserve);
  return {
    shipping,
    packing,
    returnsReserve,
    netProfit: net,
    roi: ratio(net / cost),
    margin: ratio(net / sale),
  };
}

/** eBay US managed-payments estimate. Not a live eBay fee invoice. */
export function estimateEbayReferralFee(salePrice: number | null): number | null {
  if (!salePrice || salePrice <= 0) return null;
  return money(salePrice * 0.1365 + 0.3);
}
