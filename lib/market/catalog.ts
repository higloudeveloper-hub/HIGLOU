export type MarketDrop = {
  id: string;
  name: string;
  title: string;
  blurb: string;
  photo: string;
  photos: readonly string[];
  /** Supplier / landed cost estimate — not an invoice */
  buy: number;
  /** Suggested list price */
  sell: number;
  /** Recent ask comps for animation “from” */
  comps: number;
  supplier: string;
  ships: string;
  heat: "hot" | "warm" | "fresh";
  /** Optional ASIN for affiliate / buy path */
  asin?: string;
};

/** Curated drops people can one-click into their store. Spreads are estimates. */
export const MARKET_DROPS: readonly MarketDrop[] = [
  {
    id: "chrono-steel",
    name: "Chronograph",
    title: "Automatic Stainless Chronograph",
    blurb: "Unworn steel chronograph. Black sunburst dial, oyster bracelet, box ready.",
    photo:
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=80",
    photos: [
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&w=900&q=80",
    ],
    buy: 620,
    sell: 1895,
    comps: 2290,
    supplier: "US warehouse",
    ships: "2–4 day ship",
    heat: "hot",
  },
  {
    id: "anc-headphones",
    name: "Headphones",
    title: "Wireless Noise Cancelling Headphones",
    blurb: "Wireless ANC, 30-hour battery, champagne metal yoke.",
    photo:
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1200&q=80",
    photos: [
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1484704849700-f032a568e944?auto=format&fit=crop&w=900&q=80",
    ],
    buy: 118,
    sell: 349,
    comps: 429,
    supplier: "US warehouse",
    ships: "2–4 day ship",
    heat: "hot",
  },
  {
    id: "court-leather",
    name: "Sneakers",
    title: "Premium Leather Court Sneakers",
    blurb: "Full-grain leather court sneaker. Clean white, unworn pair.",
    photo:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80",
    photos: [
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1460353581641-37baddab0fa2?auto=format&fit=crop&w=900&q=80",
    ],
    buy: 64,
    sell: 220,
    comps: 279,
    supplier: "US warehouse",
    ships: "3–5 day ship",
    heat: "warm",
  },
  {
    id: "cuban-14k",
    name: "Gold",
    title: "14K Gold Cuban Link Bracelet",
    blurb: "Solid 14K yellow gold Cuban link. Stamped, heavy, ready to ship.",
    photo:
      "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=1200&q=80",
    photos: [
      "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=900&q=80",
    ],
    buy: 980,
    sell: 2450,
    comps: 2890,
    supplier: "US warehouse",
    ships: "2–4 day ship",
    heat: "hot",
  },
  {
    id: "mirrorless-50",
    name: "Camera",
    title: "Full-Frame Mirrorless + 50mm",
    blurb: "Full-frame body with 50mm prime. Low shutter, clean sensor.",
    photo:
      "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80",
    photos: [
      "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1502920917128-1aa500764cbd?auto=format&fit=crop&w=900&q=80",
    ],
    buy: 740,
    sell: 1799,
    comps: 2199,
    supplier: "US warehouse",
    ships: "2–4 day ship",
    heat: "fresh",
  },
  {
    id: "desk-lamp",
    name: "Lamp",
    title: "Architect Desk Lamp — Matte Black",
    blurb: "Spring-balanced arm, matte black. New in box, US plug.",
    photo:
      "https://images.unsplash.com/photo-1507473885765-e6ed557fef46?auto=format&fit=crop&w=1200&q=80",
    photos: [
      "https://images.unsplash.com/photo-1507473885765-e6ed557fef46?auto=format&fit=crop&w=900&q=80",
    ],
    buy: 38,
    sell: 129,
    comps: 159,
    supplier: "US warehouse",
    ships: "2–4 day ship",
    heat: "warm",
  },
];

export function getMarketDrop(id: string): MarketDrop | null {
  return MARKET_DROPS.find((d) => d.id === id) ?? null;
}

export function marketSpread(drop: MarketDrop) {
  return Math.max(0, drop.sell - drop.buy);
}

export function pickMarketDrop(seed = Date.now()): MarketDrop {
  const i = Math.abs(seed) % MARKET_DROPS.length;
  return MARKET_DROPS[i]!;
}
