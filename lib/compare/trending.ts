import { amazonAsinImageCandidates } from "@/lib/amazon/asin-image";
import { isWeakFacebookPictureUrl } from "@/lib/facebook/promo-media";
import {
  keepaFindHotWinners,
  keepaProducts,
  keepaSearchAsins,
} from "@/lib/keepa/finder";
import type { KeepaStrategyId } from "@/lib/keepa/strategies";
import { isKeepaStrategyId } from "@/lib/keepa/strategies";
import { OPPORTUNITY_CATEGORIES } from "@/lib/opportunity/categories";
import { buildAmazonAssociatesUrl } from "@/lib/monetization/channels/affiliate";
import { getAmazonAssociateTag } from "@/lib/monetization/affiliate/amazon-associates";

export type CompareLane = "hot_deals" | "price_drop" | "velocity" | "rising_price";

export type CompareTrendItem = {
  asin: string;
  title: string;
  brand: string;
  imageUrl: string;
  amazonPrice: number | null;
  discount90: number | null;
  salesRank: number | null;
  amazonUrl: string;
  lane: CompareLane;
  categoryId: string;
  categoryLabel: string;
};

const LANES: CompareLane[] = [
  "hot_deals",
  "price_drop",
  "velocity",
  "rising_price",
];

function productImage(preferred: string, asin: string): string {
  const direct = String(preferred || "").trim();
  if (/^https?:\/\//i.test(direct) && !isWeakFacebookPictureUrl(direct)) {
    return direct;
  }
  const strong = amazonAsinImageCandidates(asin).find(
    (u) => !isWeakFacebookPictureUrl(u),
  );
  return strong || direct || "";
}

function resolveLane(raw: unknown): CompareLane {
  const s = String(raw || "").trim();
  if (LANES.includes(s as CompareLane)) return s as CompareLane;
  if (isKeepaStrategyId(s) && LANES.includes(s as CompareLane)) {
    return s as CompareLane;
  }
  return "hot_deals";
}

function categoryMeta(categoryId: string): {
  id: string;
  label: string;
  keepaRoot: string;
} {
  const row = OPPORTUNITY_CATEGORIES.find((c) => c.id === categoryId);
  if (row && row.id !== "all") {
    return {
      id: row.id,
      label: row.label,
      keepaRoot: row.keepaRoot,
    };
  }
  return { id: "all", label: "En tendencia", keepaRoot: "" };
}

function toItem(
  snap: Awaited<ReturnType<typeof keepaProducts>>[number],
  lane: CompareLane,
  categoryId: string,
  categoryLabel: string,
  tag: string | null,
): CompareTrendItem | null {
  const asin = String(snap.asin || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) return null;
  const imageUrl = productImage(snap.imageUrl, asin);
  if (!/^https?:\/\//i.test(imageUrl)) return null;
  const amazonPrice = snap.buyBoxPrice ?? snap.newPrice;
  const amazonUrl =
    (tag &&
      buildAmazonAssociatesUrl({
        asin,
        associateTag: tag,
      })) ||
    `https://www.amazon.com/dp/${asin}`;
  return {
    asin,
    title: snap.title || `Deal ${asin}`,
    brand: snap.brand || "",
    imageUrl,
    amazonPrice,
    discount90: snap.discount90,
    salesRank: snap.salesRank,
    amazonUrl,
    lane,
    categoryId,
    categoryLabel,
  };
}

/**
 * Public marketplace floor: Keepa hot winners for Compare.
 */
export async function loadCompareTrending(opts?: {
  lane?: string | null;
  categoryId?: string | null;
  limit?: number;
  seed?: number;
}): Promise<{
  ok: true;
  lane: CompareLane;
  categoryId: string;
  items: CompareTrendItem[];
  note: string;
}> {
  const lane = resolveLane(opts?.lane);
  const cat = categoryMeta(String(opts?.categoryId || "all"));
  const limit = Math.min(Math.max(opts?.limit || 12, 4), 24);
  const tag = getAmazonAssociateTag();

  const found = await keepaFindHotWinners({
    mode: "amazon",
    rootCategory: cat.keepaRoot || undefined,
    seed: opts?.seed ?? Date.now() % 97,
    preferGlobal: !cat.keepaRoot,
    maxRoots: cat.keepaRoot ? 1 : 4,
    strategy: lane as KeepaStrategyId,
  });

  const snaps = await keepaProducts(found.asins.slice(0, limit + 6));
  const items: CompareTrendItem[] = [];
  const seen = new Set<string>();
  for (const snap of snaps) {
    const row = toItem(snap, lane, cat.id, cat.label, tag);
    if (!row || seen.has(row.asin)) continue;
    seen.add(row.asin);
    items.push(row);
    if (items.length >= limit) break;
  }

  // Prefer deeper discounts first when available
  items.sort((a, b) => {
    const da = a.discount90 ?? 0;
    const db = b.discount90 ?? 0;
    if (db !== da) return db - da;
    return (a.amazonPrice ?? 9e9) - (b.amazonPrice ?? 9e9);
  });

  return {
    ok: true,
    lane,
    categoryId: cat.id,
    items,
    note:
      items.length > 0
        ? `${items.length} productos Keepa · ${cat.label}`
        : "Sin tendencias ahora — buscá un producto o pegá un link de Amazon.",
  };
}

/**
 * Keyword → Keepa product search for the marketplace search bar.
 */
export async function searchCompareProducts(
  term: string,
  opts?: { limit?: number },
): Promise<{
  ok: true;
  query: string;
  items: CompareTrendItem[];
  note: string;
}> {
  const query = term.trim().slice(0, 120);
  if (query.length < 2) {
    return {
      ok: true,
      query,
      items: [],
      note: "Escribí al menos 2 caracteres.",
    };
  }
  const tag = getAmazonAssociateTag();
  let asins = await keepaSearchAsins(query);
  // Fallback: Product Finder by title when search tokens are dry
  if (!asins.length) {
    const found = await keepaFindHotWinners({
      mode: "amazon",
      title: query,
      preferGlobal: true,
      maxRoots: 3,
      strategy: "hot_deals",
      seed: query.length,
    });
    asins = found.asins;
  }
  const snaps = await keepaProducts(
    asins.slice(0, Math.min(Math.max(opts?.limit || 16, 4), 20)),
  );
  const items: CompareTrendItem[] = [];
  for (const snap of snaps) {
    const row = toItem(snap, "hot_deals", "all", "Búsqueda", tag);
    if (row) items.push(row);
  }
  return {
    ok: true,
    query,
    items,
    note:
      items.length > 0
        ? `${items.length} resultados para “${query}”`
        : `Nada para “${query}”. Probá otra palabra o un link de Amazon.`,
  };
}

export const COMPARE_LANES: Array<{
  id: CompareLane;
  label: string;
  blurb: string;
}> = [
  { id: "hot_deals", label: "Hot deals", blurb: "Drops Keepa del momento" },
  { id: "price_drop", label: "Price drop", blurb: "Bajó fuerte en 30d" },
  { id: "velocity", label: "Velocity", blurb: "Se está vendiendo ya" },
  { id: "rising_price", label: "Rising", blurb: "Precio subiendo" },
];

export const COMPARE_CATEGORIES = OPPORTUNITY_CATEGORIES.map((c) => ({
  id: c.id,
  label: c.id === "all" ? "Todo" : c.label.replace(/\s*&\s*/g, " · "),
}));
