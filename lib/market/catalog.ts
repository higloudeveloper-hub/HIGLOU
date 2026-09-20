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

type Seed = {
  id: string;
  name: string;
  title: string;
  blurb: string;
  photo: string;
  buy: number;
  sell: number;
  comps: number;
  heat: MarketDrop["heat"];
  ships?: string;
};

function drop(seed: Seed): MarketDrop {
  return {
    ...seed,
    photos: [seed.photo],
    supplier: "US warehouse",
    ships: seed.ships || "2–4 day ship",
  };
}

/**
 * Legacy seed catalog — kept for pulse helpers / tests only.
 * Live Market no longer stocks these; floor = Find Winners verified ledger.
 */
const SEEDS: readonly Seed[] = [
  {
    id: "chrono-steel",
    name: "Chronograph",
    title: "Automatic Stainless Chronograph",
    blurb: "Unworn steel chronograph. Black sunburst dial, box ready.",
    photo:
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80",
    buy: 620,
    sell: 1895,
    comps: 2290,
    heat: "hot",
  },
  {
    id: "anc-headphones",
    name: "Headphones",
    title: "Wireless Noise Cancelling Headphones",
    blurb: "Wireless ANC, 30-hour battery, champagne metal yoke.",
    photo:
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80",
    buy: 118,
    sell: 349,
    comps: 429,
    heat: "hot",
  },
  {
    id: "court-leather",
    name: "Sneakers",
    title: "Premium Leather Court Sneakers",
    blurb: "Full-grain leather court sneaker. Clean white, unworn.",
    photo:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80",
    buy: 64,
    sell: 220,
    comps: 279,
    heat: "warm",
    ships: "3–5 day ship",
  },
  {
    id: "cuban-14k",
    name: "Gold",
    title: "14K Gold Cuban Link Bracelet",
    blurb: "Solid 14K yellow gold Cuban link. Stamped, heavy.",
    photo:
      "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=900&q=80",
    buy: 980,
    sell: 2450,
    comps: 2890,
    heat: "hot",
  },
  {
    id: "mirrorless-50",
    name: "Camera",
    title: "Full-Frame Mirrorless + 50mm",
    blurb: "Full-frame body with 50mm prime. Low shutter count.",
    photo:
      "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=80",
    buy: 740,
    sell: 1799,
    comps: 2199,
    heat: "fresh",
  },
  {
    id: "desk-lamp",
    name: "Lamp",
    title: "Architect Desk Lamp — Matte Black",
    blurb: "Spring-balanced arm, matte black. New in box.",
    photo:
      "https://images.unsplash.com/photo-1507473885765-e6ed557fef46?auto=format&fit=crop&w=900&q=80",
    buy: 38,
    sell: 129,
    comps: 159,
    heat: "warm",
  },
  {
    id: "mech-keyboard",
    name: "Keyboard",
    title: "Hot-Swap Mechanical Keyboard",
    blurb: "Aluminum case, gasket mount, RGB — sealed retail.",
    photo:
      "https://images.unsplash.com/photo-1511467687898-710165f63232?auto=format&fit=crop&w=900&q=80",
    buy: 72,
    sell: 189,
    comps: 229,
    heat: "hot",
  },
  {
    id: "espresso-pro",
    name: "Espresso",
    title: "Prosumer Espresso Machine",
    blurb: "Dual boiler look, steam wand, new in box.",
    photo:
      "https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?auto=format&fit=crop&w=900&q=80",
    buy: 310,
    sell: 799,
    comps: 949,
    heat: "hot",
  },
  {
    id: "drone-4k",
    name: "Drone",
    title: "4K Foldable Camera Drone",
    blurb: "GPS hold, 4K gimbal, fly-more kit style bundle.",
    photo:
      "https://images.unsplash.com/photo-1473968512647-3e447244af8f?auto=format&fit=crop&w=900&q=80",
    buy: 289,
    sell: 699,
    comps: 849,
    heat: "warm",
  },
  {
    id: "leather-tote",
    name: "Bag",
    title: "Full-Grain Leather Tote",
    blurb: "Vegetable-tanned leather tote. Unlined, brass hardware.",
    photo:
      "https://images.unsplash.com/photo-1548036328-c165bcf0e8d2?auto=format&fit=crop&w=900&q=80",
    buy: 55,
    sell: 168,
    comps: 210,
    heat: "fresh",
  },
  {
    id: "smartwatch-pro",
    name: "Watch",
    title: "GPS Smartwatch — Titanium",
    blurb: "Always-on display, GPS, titanium case, band included.",
    photo:
      "https://images.unsplash.com/photo-1434493789847-2f02dc6ca35d?auto=format&fit=crop&w=900&q=80",
    buy: 195,
    sell: 449,
    comps: 529,
    heat: "hot",
  },
  {
    id: "air-purifier",
    name: "Home",
    title: "HEPA Air Purifier — Large Room",
    blurb: "True HEPA, quiet night mode, sealed carton.",
    photo:
      "https://images.unsplash.com/photo-1585771724680-ef6eb600e2bd?auto=format&fit=crop&w=900&q=80",
    buy: 89,
    sell: 249,
    comps: 299,
    heat: "warm",
  },
  {
    id: "gaming-chair",
    name: "Chair",
    title: "Ergonomic Mesh Office Chair",
    blurb: "Lumbar support, mesh back, new boxed.",
    photo:
      "https://images.unsplash.com/photo-1580480055273-228ff5388ef8?auto=format&fit=crop&w=900&q=80",
    buy: 140,
    sell: 379,
    comps: 449,
    heat: "fresh",
  },
  {
    id: "bluetooth-speaker",
    name: "Audio",
    title: "Portable Bluetooth Speaker — Pro",
    blurb: "IPX7, 20h battery, punchy bass. Retail sealed.",
    photo:
      "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=900&q=80",
    buy: 42,
    sell: 129,
    comps: 159,
    heat: "hot",
  },
  {
    id: "robot-vac",
    name: "Robot",
    title: "Robot Vacuum — Mapping LiDAR",
    blurb: "LiDAR map, self-empty dock compatible SKU.",
    photo:
      "https://images.unsplash.com/photo-1558317374-067fb5f30001?auto=format&fit=crop&w=900&q=80",
    buy: 210,
    sell: 549,
    comps: 649,
    heat: "hot",
  },
  {
    id: "perfume-niche",
    name: "Fragrance",
    title: "Niche Eau de Parfum 100ml",
    blurb: "Sealed 100ml, batch code intact, gift box.",
    photo:
      "https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=900&q=80",
    buy: 48,
    sell: 145,
    comps: 175,
    heat: "warm",
  },
  {
    id: "power-tool-kit",
    name: "Tools",
    title: "Brushless Drill Combo Kit",
    blurb: "2-battery brushless kit, charger, hard case.",
    photo:
      "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=900&q=80",
    buy: 95,
    sell: 259,
    comps: 319,
    heat: "warm",
  },
  {
    id: "yoga-mat-pro",
    name: "Fitness",
    title: "Pro Grip Yoga Mat — Extra Thick",
    blurb: "Non-slip, 6mm, carrying strap included.",
    photo:
      "https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?auto=format&fit=crop&w=900&q=80",
    buy: 18,
    sell: 58,
    comps: 72,
    heat: "fresh",
  },
  {
    id: "sunglasses-avi",
    name: "Eyewear",
    title: "Polarized Aviator Sunglasses",
    blurb: "Polarized lenses, metal frame, soft case.",
    photo:
      "https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=900&q=80",
    buy: 22,
    sell: 79,
    comps: 99,
    heat: "hot",
  },
  {
    id: "tablet-stand",
    name: "Desk",
    title: "Aluminum Laptop / Tablet Stand",
    blurb: "CNC aluminum, fold flat, cable pass-through.",
    photo:
      "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=900&q=80",
    buy: 16,
    sell: 49,
    comps: 64,
    heat: "warm",
  },
  {
    id: "cast-iron",
    name: "Kitchen",
    title: "Seasoned Cast Iron Skillet 12\"",
    blurb: "Pre-seasoned, USA-style skillet, retail pack.",
    photo:
      "https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=900&q=80",
    buy: 28,
    sell: 79,
    comps: 95,
    heat: "fresh",
  },
  {
    id: "ring-light",
    name: "Creator",
    title: "18\" LED Ring Light Kit",
    blurb: "Tripod + phone mount + remote. Creator kit.",
    photo:
      "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=900&q=80",
    buy: 34,
    sell: 99,
    comps: 129,
    heat: "warm",
  },
  {
    id: "backpack-tech",
    name: "Travel",
    title: "Tech Backpack — TSA Laptop",
    blurb: "17L tech pack, TSA laptop sleeve, water resistant.",
    photo:
      "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=80",
    buy: 41,
    sell: 119,
    comps: 149,
    heat: "hot",
  },
  {
    id: "wine-set",
    name: "Gift",
    title: "Electric Wine Opener Set",
    blurb: "Opener + aerator + stoppers. Gift boxed.",
    photo:
      "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=900&q=80",
    buy: 19,
    sell: 54,
    comps: 69,
    heat: "fresh",
  },
  {
    id: "projector-mini",
    name: "AV",
    title: "Portable HD Mini Projector",
    blurb: "1080p support, HDMI + USB, carry pouch.",
    photo:
      "https://images.unsplash.com/photo-1478720568477-152d9b164e26?auto=format&fit=crop&w=900&q=80",
    buy: 78,
    sell: 219,
    comps: 269,
    heat: "hot",
  },
  {
    id: "camping-lantern",
    name: "Outdoor",
    title: "Rechargeable Camping Lantern",
    blurb: "USB-C, 1000 lm, IPX4. Hang hook included.",
    photo:
      "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=900&q=80",
    buy: 14,
    sell: 42,
    comps: 55,
    heat: "warm",
  },
  {
    id: "electric-toothbrush",
    name: "Health",
    title: "Sonic Electric Toothbrush Kit",
    blurb: "Handle + 4 heads + travel case. Sealed.",
    photo:
      "https://images.unsplash.com/photo-1607613009820-a29f7bb451c0?auto=format&fit=crop&w=900&q=80",
    buy: 26,
    sell: 79,
    comps: 99,
    heat: "fresh",
  },
  {
    id: "bike-pump",
    name: "Bike",
    title: "Floor Bike Pump — Gauge",
    blurb: "High-volume floor pump, analog gauge, Presta/Schrader.",
    photo:
      "https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=900&q=80",
    buy: 17,
    sell: 49,
    comps: 62,
    heat: "warm",
  },
  {
    id: "desk-mic",
    name: "Podcast",
    title: "USB Condenser Microphone",
    blurb: "Cardioid USB mic, mute, gain, boom arm ready.",
    photo:
      "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=900&q=80",
    buy: 45,
    sell: 129,
    comps: 159,
    heat: "hot",
  },
  {
    id: "plant-pot-set",
    name: "Home",
    title: "Ceramic Planter Set (3)",
    blurb: "Matte ceramic trio with drainage + trays.",
    photo:
      "https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=900&q=80",
    buy: 21,
    sell: 64,
    comps: 79,
    heat: "fresh",
  },
];

export const MARKET_DROPS: readonly MarketDrop[] = SEEDS.map(drop);

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

/** Rotate heat labels for “live floor” feel without inventing money. */
export function marketPulseLabels(now = Date.now()): string[] {
  const n = MARKET_DROPS.length;
  const i = Math.floor(now / 4000) % n;
  return [
    `Scanning ${n}+ drops on the floor`,
    `Repricing ${MARKET_DROPS[i]!.name.toLowerCase()}…`,
    `Ask compression on ${MARKET_DROPS[(i + 3) % n]!.title.slice(0, 28)}`,
    "Active asks ≠ sold comps — verifying spreads",
  ];
}
