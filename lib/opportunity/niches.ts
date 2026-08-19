import { OPPORTUNITY_CATEGORIES } from "@/lib/opportunity/categories";
import type { OpportunityProduct } from "@/lib/opportunity/types";

/** Specific product types per category. Generic Amazon searches always return the same bestsellers. */
export const CATEGORY_NICHES: Record<string, readonly string[]> = {
  home: [
    "bamboo drawer organizer",
    "under sink caddy sliding",
    "over the door hook rack",
    "cabinet spice rack organizer",
    "lazy susan pantry turntable",
    "kitchen sink strainer basket",
    "pan lid organizer rack",
    "utensil crock holder",
    "shelf riser kitchen cabinet",
    "paper towel holder under cabinet",
    "egg holder refrigerator",
    "cutting board organizer stand",
    "dish drying rack compact",
    "fridge drink organizer",
  ],
  office: [
    "desk cable management tray",
    "monitor stand riser wood",
    "pen holder desk organizer",
    "file folder organizer desktop",
    "laptop stand aluminum",
    "desk drawer organizer tray",
    "paper tray organizer stackable",
    "business card holder desk",
    "whiteboard small dry erase",
    "stapler heavy duty office",
  ],
  garden: [
    "plant saucer drip tray",
    "garden kneeling pad",
    "hose holder wall mount",
    "plant labels garden markers",
    "watering can indoor plants",
    "tomato cage garden",
    "seed starting trays",
    "patio furniture clips",
    "raised garden bed liner",
    "pruning shears bypass",
  ],
  pets: [
    "dog poop bag dispenser",
    "cat litter scoop holder",
    "elevated dog bowl stand",
    "cat scratching pad cardboard",
    "pet nail grinder clipper",
    "dog crate mat washable",
    "pet hair remover roller",
    "aquarium thermometer digital",
    "bird cage liner paper",
    "pet travel water bottle",
  ],
  tools: [
    "magnetic tool holder bar",
    "tool bag small organizer",
    "utility knife blades pack",
    "torpedo level magnetic",
    "caulk gun dripless",
    "stud finder electronic",
    "tape measure magnetic hook",
    "hex key set metric",
    "spring clamp 6 inch",
    "work gloves mechanic",
  ],
  industrial: [
    "cable gland nylon",
    "hose clamp stainless assorted",
    "zip ties heavy duty 12 inch",
    "rubber grommet kit",
    "threaded insert wood",
    "machine screw assortment",
    "wire nut assortment",
    "braided cable sleeve",
    "pipe hanger strap",
    "electrical box cover blank",
  ],
  crafts: [
    "rotary cutter fabric",
    "embroidery hoop wood",
    "vinyl weeding tool",
    "craft storage drawers small",
    "sewing clips fabric",
    "self healing cutting mat 12",
    "mini glue gun sticks",
    "heat transfer vinyl bundle",
    "beading needle set",
    "letter stencil alphabet",
  ],
  storage: [
    "over the door shoe organizer",
    "under bed storage bins",
    "closet shelf divider",
    "vacuum storage bags clothes",
    "cube storage bins fabric",
    "stackable closet storage bins",
    "hat rack hanger closet",
    "jewelry organizer drawer",
    "cable organizer box",
    "lazy susan pantry organizer",
  ],
};

export function opportunityFingerprint(title: string): string {
  const stemmed = String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(
      /\b(the|and|for|with|set|pack|inch|inches|cm|mm|pcs|pc|piece|pieces|luxury|premium|adjustable|expandable|large|small|mini|new|best|home|kitchen|wood|wooden|bamboo|silicone|plastic|black|white|gray|grey|royal|craft)\b/g,
      " ",
    )
    .replace(/\b\d+[a-z]?\b/g, " ")
    .replace(/\b(\w{4,})s\b/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const words = [...new Set(stemmed.split(" ").filter((word) => word.length > 3))];
  const type = [
    "organizer",
    "divider",
    "caddy",
    "holder",
    "rack",
    "tray",
    "bin",
    "mat",
    "pad",
    "glove",
    "knife",
    "level",
    "clamp",
    "hose",
    "saucer",
    "scoop",
    "stand",
    "liner",
    "shear",
    "gland",
    "grommet",
    "cutter",
    "hoop",
    "stapler",
    "whiteboard",
  ].find((word) => words.includes(word));
  const object = [
    "drawer",
    "spice",
    "cable",
    "desk",
    "door",
    "sink",
    "tool",
    "shoe",
    "closet",
    "plant",
    "pet",
    "hose",
    "file",
    "monitor",
    "laptop",
    "paper",
    "utensil",
    "lid",
    "egg",
    "board",
    "dish",
    "fridge",
    "pantry",
    "jewelry",
    "hat",
    "vacuum",
    "cube",
  ].find((word) => words.includes(word) && word !== type);
  const other = words.find((word) => word !== type && word !== object) || "";
  if (type && object) return `${object} ${type}`;
  if (type && other) return `${other} ${type}`;
  return words.slice(0, 3).sort().join(" ");
}

export function pickCategoryQueries(opts: {
  categoryId?: string;
  extra?: string;
  generic?: string;
  seed?: number;
  count?: number;
}): string[] {
  const extra = String(opts.extra || "").trim();
  if (extra && !/^[A-Z0-9]{10}$/i.test(extra)) {
    return [extra];
  }
  const niches = CATEGORY_NICHES[String(opts.categoryId || "")] || [];
  if (!niches.length) {
    const generic = String(opts.generic || "").trim();
    return generic ? [generic] : [];
  }
  const count = Math.min(Math.max(opts.count ?? 3, 1), 4);
  const start = Math.abs(Math.floor(Number(opts.seed) || 0)) % niches.length;
  const stride = Math.max(1, Math.floor(niches.length / count));
  const picked: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < niches.length && picked.length < count; i += 1) {
    const term = niches[(start + i * stride) % niches.length];
    if (seen.has(term)) continue;
    seen.add(term);
    picked.push(term);
  }
  return picked;
}

/** Household Amazon #1s. Without Keepa these are bestsellers, not opportunities. */
export function isCrowdedBestseller(reviewCount: number | null | undefined): boolean {
  return (reviewCount || 0) >= 10_000;
}

export function nextLiveScanTarget(step: number): {
  categoryId: string;
  label: string;
  seed: number;
  query: string;
} {
  const cats = OPPORTUNITY_CATEGORIES;
  const index = Math.max(0, Math.floor(Number(step) || 0));
  const row = cats[index % cats.length];
  const niches = CATEGORY_NICHES[row.id] || [];
  const nicheIndex = niches.length
    ? Math.floor(index / cats.length) % niches.length
    : 0;
  return {
    categoryId: row.id,
    label: row.label,
    seed: nicheIndex,
    query: niches[nicheIndex] || row.query,
  };
}

function pickNum(a: number | null | undefined, b: number | null | undefined) {
  return a != null ? a : b ?? null;
}

function mergeHit(
  prev: OpportunityProduct,
  next: OpportunityProduct,
): OpportunityProduct {
  const primary = next.score >= prev.score ? next : prev;
  const fallback = primary === next ? prev : next;
  return {
    ...fallback,
    ...primary,
    title: primary.title || fallback.title,
    imageUrl: primary.imageUrl || fallback.imageUrl,
    brand: primary.brand || fallback.brand,
    amazonPrice: pickNum(primary.amazonPrice, fallback.amazonPrice),
    ebayPrice: pickNum(primary.ebayPrice, fallback.ebayPrice),
    ebayActiveMedian: pickNum(primary.ebayActiveMedian, fallback.ebayActiveMedian),
    cost: pickNum(primary.cost, fallback.cost),
    netProfit: pickNum(primary.netProfit, fallback.netProfit),
    roi: pickNum(primary.roi, fallback.roi),
    margin: pickNum(primary.margin, fallback.margin),
    ebayFees: pickNum(primary.ebayFees, fallback.ebayFees),
    amazonFees: pickNum(primary.amazonFees, fallback.amazonFees),
    rating: pickNum(primary.rating, fallback.rating),
    reviewCount: pickNum(primary.reviewCount, fallback.reviewCount),
  };
}

export function diversifyOpportunityHits(
  hits: OpportunityProduct[],
  cap = 24,
): OpportunityProduct[] {
  const ranked = [...hits].sort((a, b) => (b.score || 0) - (a.score || 0));
  const out: OpportunityProduct[] = [];
  const fingerprints = new Set<string>();
  for (const hit of ranked) {
    const fingerprint =
      opportunityFingerprint(hit.title) || String(hit.asin || "").toUpperCase();
    if (fingerprint && fingerprints.has(fingerprint)) continue;
    if (fingerprint) fingerprints.add(fingerprint);
    out.push(hit);
    if (out.length >= cap) break;
  }
  return out;
}

export function mergeOpportunityHits(
  current: OpportunityProduct[],
  incoming: OpportunityProduct[],
  cap = 24,
): OpportunityProduct[] {
  const map = new Map(current.map((hit) => [hit.asin, hit]));
  for (const hit of incoming) {
    const prev = map.get(hit.asin);
    map.set(hit.asin, prev ? mergeHit(prev, hit) : hit);
  }
  return diversifyOpportunityHits([...map.values()], cap);
}
