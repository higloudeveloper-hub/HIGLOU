export type ShippingServiceOption = {
  code: string;
  label: string;
  hint: string;
};

/** Domestic services commonly shown in Seller Hub "Add services". */
export const SHIPPING_SERVICE_OPTIONS: ShippingServiceOption[] = [
  {
    code: "USPSGroundAdvantage",
    label: "USPS Ground Advantage",
    hint: "Cheapest · 2–5 days · default for all Higlou parcels",
  },
  {
    code: "UPSGround",
    label: "UPS Ground",
    hint: "Only for very large/heavy freight-scale boxes",
  },
  {
    code: "EconomyShipping",
    label: "Economy Shipping",
    hint: "Fallback economy when Ground Advantage unavailable",
  },
];

export function findShippingServiceOption(code: string | null | undefined) {
  const normalized = String(code || "").trim();
  return (
    SHIPPING_SERVICE_OPTIONS.find((o) => o.code === normalized) ?? null
  );
}
