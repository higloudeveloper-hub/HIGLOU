export type ReadyListing = {
  name: string;
  title: string;
  description: string;
  photo: string;
  photos: readonly string[];
  buy: number;
  sell: number;
  comps: number;
  supplier: string;
  ships: string;
};

export const READY_LISTINGS: readonly ReadyListing[] = [
  {
    name: "Watch",
    title: "Automatic Stainless Chronograph",
    description: "Unworn steel chronograph. Black sunburst dial, oyster bracelet, box ready.",
    photo: "/demo/wow-watch.webp",
    photos: [
      "/demo/wow-watch.webp",
      "/demo/wow-watch-dial.webp",
      "/demo/wow-watch-side.webp",
    ],
    buy: 620,
    sell: 1895,
    comps: 2290,
    supplier: "US warehouse",
    ships: "2–4 day ship",
  },
  {
    name: "Headphones",
    title: "Wireless Noise Cancelling Headphones",
    description: "Wireless ANC, 30-hour battery, champagne metal yoke, unmarked.",
    photo: "/demo/wow-headphones.webp",
    photos: [
      "/demo/wow-headphones.webp",
      "/demo/wow-headphones-side.webp",
      "/demo/wow-headphones-cup.webp",
    ],
    buy: 118,
    sell: 349,
    comps: 429,
    supplier: "US warehouse",
    ships: "2–4 day ship",
  },
  {
    name: "Sneakers",
    title: "Premium Leather Court Sneakers",
    description: "Full-grain leather court sneaker. Clean white, unworn pair.",
    photo: "/demo/wow-sneakers.webp",
    photos: [
      "/demo/wow-sneakers.webp",
      "/demo/wow-sneakers-pair.webp",
      "/demo/wow-sneakers-top.webp",
    ],
    buy: 64,
    sell: 220,
    comps: 279,
    supplier: "US warehouse",
    ships: "3–5 day ship",
  },
  {
    name: "Gold",
    title: "14K Gold Cuban Link Bracelet",
    description: "Solid 14K yellow gold Cuban link. Stamped, heavy, ready to ship.",
    photo: "/demo/wow-gold.webp",
    photos: ["/demo/wow-gold.webp", "/demo/wow-gold-line.webp", "/demo/wow-gold-links.webp"],
    buy: 980,
    sell: 2450,
    comps: 2890,
    supplier: "US warehouse",
    ships: "2–4 day ship",
  },
  {
    name: "Camera",
    title: "Full-Frame Mirrorless + 50mm",
    description: "Full-frame body with 50mm prime. Low shutter, clean sensor.",
    photo: "/demo/wow-camera.webp",
    photos: [
      "/demo/wow-camera.webp",
      "/demo/wow-camera-back.webp",
      "/demo/wow-camera-lens.webp",
    ],
    buy: 740,
    sell: 1799,
    comps: 2199,
    supplier: "US warehouse",
    ships: "2–4 day ship",
  },
  {
    name: "Chronograph",
    title: "Chronograph — new in box",
    description: "Unworn steel chronograph. New in box, papers ready.",
    photo: "/demo/wow-watch-dial.webp",
    photos: [
      "/demo/wow-watch-dial.webp",
      "/demo/wow-watch.webp",
      "/demo/wow-watch-side.webp",
    ],
    buy: 690,
    sell: 1895,
    comps: 2290,
    supplier: "US warehouse",
    ships: "2–4 day ship",
  },
];

export type StoryItem = {
  name: string;
  title: string;
  description: string;
  price: number;
  comps: number;
  photos: readonly string[];
};

export const STORY_CATALOG: StoryItem[] = READY_LISTINGS.map((item) => ({
  name: item.name,
  title: item.title,
  description: item.description,
  price: item.sell,
  comps: item.comps,
  photos: item.photos,
}));
