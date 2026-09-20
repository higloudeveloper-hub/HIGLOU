/** Credit costs per paid action. Keep labels short — shown in UI. */
export const CREDIT_ACTIONS = {
  winners_scan: {
    id: "winners_scan",
    label: "Find Winners scan",
    cost: 5,
  },
  market_claim: {
    id: "market_claim",
    label: "Add winner to store",
    cost: 3,
  },
  analyze_product: {
    id: "analyze_product",
    label: "AI listing analysis",
    cost: 8,
  },
  affiliate_link: {
    id: "affiliate_link",
    label: "Create affiliate link",
    cost: 1,
  },
  facebook_share: {
    id: "facebook_share",
    label: "Facebook Page post",
    cost: 2,
  },
} as const;

export type CreditActionId = keyof typeof CREDIT_ACTIONS;

export function creditCost(action: CreditActionId): number {
  return CREDIT_ACTIONS[action].cost;
}

/** Welcome pack for new public users (no Stripe yet). */
export const WELCOME_BONUS_CREDITS = 40;

/**
 * Recharge packs. `stripePriceId` reserved — wire when Stripe is connected.
 * Prices in USD cents for future Checkout Session.
 */
export const CREDIT_PACKS = [
  {
    id: "starter",
    name: "Starter",
    credits: 50,
    priceUsd: 9,
    priceCents: 900,
    blurb: "Para probar Find Winners y Market",
    popular: false,
    stripePriceId: null as string | null,
  },
  {
    id: "grow",
    name: "Grow",
    credits: 150,
    priceUsd: 19,
    priceCents: 1900,
    blurb: "El pack que más conviene",
    popular: true,
    stripePriceId: null as string | null,
  },
  {
    id: "pro",
    name: "Pro",
    credits: 400,
    priceUsd: 39,
    priceCents: 3900,
    blurb: "Volumen serio · listings + ads",
    popular: false,
    stripePriceId: null as string | null,
  },
] as const;

export type CreditPackId = (typeof CREDIT_PACKS)[number]["id"];

export function getCreditPack(id: string) {
  return CREDIT_PACKS.find((p) => p.id === id) || null;
}
