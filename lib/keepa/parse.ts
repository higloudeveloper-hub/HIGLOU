/** Keepa csv / stats indexes. Prices are cents. Rating is stars * 10. */
export const KEEPA_INDEX = {
  AMAZON: 0,
  NEW: 1,
  SALES: 3,
  COUNT_NEW: 11,
  RATING: 16,
  COUNT_REVIEWS: 17,
  BUY_BOX_SHIPPING: 18,
} as const;

export function keepaLastValue(csv: unknown): number | null {
  if (!Array.isArray(csv) || csv.length < 2) return null;
  for (let i = csv.length - 1; i >= 1; i -= 2) {
    const value = Number(csv[i]);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

export function keepaCents(value: number | null): number | null {
  if (value == null || value < 0) return null;
  return Math.round(value) / 100;
}

export function keepaStars(value: number | null): number | null {
  if (value == null || value < 0) return null;
  return Math.round(value) / 10;
}

function statsSlot(
  stats: Record<string, unknown> | undefined,
  key: string,
  index: number,
): number | null {
  const row = stats?.[key];
  if (!Array.isArray(row)) return null;
  const value = Number(row[index]);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

export type KeepaSnapshot = {
  asin: string;
  title: string;
  brand: string;
  imageUrl: string;
  upc: string;
  mpn: string;
  amazonRetail: boolean;
  buyBoxPrice: number | null;
  newPrice: number | null;
  sellerCount: number | null;
  salesRank: number | null;
  avgSalesRank90: number | null;
  avgNew90: number | null;
  discount90: number | null;
  packageLb: number | null;
  bsrDrops90: number | null;
  priceVariation90: number | null;
  rating: number | null;
  reviewCount: number | null;
  /** Amazon "bought in past month" when Keepa has it */
  monthlySold: number | null;
  /** Amazon 90d out-of-stock % (0–100) */
  amazonOos90: number | null;
  /** % of time Amazon held Buy Box over 90d */
  buyBoxAmazonShare90: number | null;
  /** Active one-time coupon % if present */
  couponPercent: number | null;
};

function firstImage(row: Record<string, unknown>): string {
  // Modern Keepa product payloads use `images: [{ l, m, ... }]`
  const images = row.images;
  if (Array.isArray(images) && images.length) {
    for (const img of images) {
      if (!img || typeof img !== "object") continue;
      const id = String(
        (img as { l?: string; m?: string }).l ||
          (img as { l?: string; m?: string }).m ||
          "",
      )
        .trim()
        .replace(/\._.+$/i, "")
        .replace(/\.(jpe?g|png|webp|gif)$/i, "");
      if (id.length >= 3) {
        return `https://m.media-amazon.com/images/I/${id}._AC_SL1500_.jpg`;
      }
    }
  }
  // Legacy CSV: "abc.jpg,def.jpg"
  const csv = String(row.imagesCSV || "")
    .split(",")
    .map((part) => part.trim())
    .find(Boolean);
  if (csv) {
    const id = csv
      .replace(/\._.+$/i, "")
      .replace(/\.(jpe?g|png|webp|gif)$/i, "");
    if (id.length >= 3) {
      return `https://m.media-amazon.com/images/I/${id}._AC_SL1500_.jpg`;
    }
  }
  return "";
}

function firstUpc(row: Record<string, unknown>): string {
  const list = row.upcList;
  if (Array.isArray(list) && list[0]) return String(list[0]);
  return String(row.eanList && Array.isArray(row.eanList) ? row.eanList[0] || "" : "");
}

function firstMpn(row: Record<string, unknown>): string {
  const part = row.partNumber;
  if (Array.isArray(part) && part[0]) return String(part[0]).trim();
  if (typeof part === "string" && part.trim()) return part.trim();
  return String(row.model || "").trim();
}

function packageLbFromKeepa(row: Record<string, unknown>): number | null {
  const grams = Number(row.packageWeight);
  if (!Number.isFinite(grams) || grams <= 0) return null;
  return Math.round((grams / 453.592) * 100) / 100;
}

export function parseKeepaProduct(row: Record<string, unknown>): KeepaSnapshot | null {
  const asin = String(row.asin || "").toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) return null;
  const csv = (row.csv as unknown[] | undefined) || [];
  const stats = row.stats as Record<string, unknown> | undefined;
  // Prefer live NEW / Buy Box — Keepa often has buy-box -1 when Amazon holds it.
  const buyBox =
    keepaCents(statsSlot(stats, "current", KEEPA_INDEX.BUY_BOX_SHIPPING)) ??
    keepaCents(keepaLastValue(csv[KEEPA_INDEX.BUY_BOX_SHIPPING]));
  const amazonNow =
    keepaCents(statsSlot(stats, "current", KEEPA_INDEX.AMAZON)) ??
    keepaCents(keepaLastValue(csv[KEEPA_INDEX.AMAZON]));
  const newPrice =
    keepaCents(statsSlot(stats, "current", KEEPA_INDEX.NEW)) ??
    keepaCents(keepaLastValue(csv[KEEPA_INDEX.NEW]));
  const min90 = keepaCents(
    statsSlot(stats, "min90", KEEPA_INDEX.NEW) ??
      statsSlot(stats, "min", KEEPA_INDEX.NEW),
  );
  const max90 = keepaCents(
    statsSlot(stats, "max90", KEEPA_INDEX.NEW) ??
      statsSlot(stats, "max", KEEPA_INDEX.NEW),
  );
  const avg90 = keepaCents(statsSlot(stats, "avg90", KEEPA_INDEX.NEW));
  const base = avg90 || newPrice || buyBox;
  const variation =
    min90 != null && max90 != null && base
      ? Math.round(((max90 - min90) / base) * 1000) / 1000
      : null;
  // Discount vs 90d NEW average — never mix buy-box into this math.
  const discount90 =
    avg90 != null && avg90 > 0 && newPrice != null
      ? Math.round(((avg90 - newPrice) / avg90) * 1000) / 1000
      : null;
  const salesRank =
    statsSlot(stats, "current", KEEPA_INDEX.SALES) ??
    keepaLastValue(csv[KEEPA_INDEX.SALES]);
  const avgSalesRank90 = statsSlot(stats, "avg90", KEEPA_INDEX.SALES);
  // salesRankDrops90 lives on stats when requesting /product?stats=90
  const drops = Number(row.salesRankDrops90 ?? stats?.salesRankDrops90 ?? 0);
  const sellerCount =
    statsSlot(stats, "current", KEEPA_INDEX.COUNT_NEW) ??
    keepaLastValue(csv[KEEPA_INDEX.COUNT_NEW]);
  const rating =
    keepaStars(statsSlot(stats, "current", KEEPA_INDEX.RATING)) ??
    keepaStars(keepaLastValue(csv[KEEPA_INDEX.RATING]));
  const reviewCount =
    statsSlot(stats, "current", KEEPA_INDEX.COUNT_REVIEWS) ??
    keepaLastValue(csv[KEEPA_INDEX.COUNT_REVIEWS]);

  const monthlySoldRaw = Number(row.monthlySold ?? stats?.monthlySold ?? 0);
  const monthlySold =
    Number.isFinite(monthlySoldRaw) && monthlySoldRaw > 0
      ? Math.round(monthlySoldRaw)
      : null;

  const oosRaw = Number(row.outOfStockPercentage90 ?? stats?.outOfStockPercentage90);
  const amazonOos90 =
    Number.isFinite(oosRaw) && oosRaw >= 0
      ? Math.min(100, Math.round(oosRaw))
      : null;

  const bbAmazonShareRaw = Number(
    row.buyBoxStatsAmazon90 ?? stats?.buyBoxStatsAmazon90,
  );
  const buyBoxAmazonShare90 =
    Number.isFinite(bbAmazonShareRaw) && bbAmazonShareRaw >= 0
      ? Math.min(100, Math.round(bbAmazonShareRaw))
      : null;

  let couponPercent: number | null = null;
  if (Array.isArray(row.coupon) && row.coupon.length >= 2) {
    const pct = Number(row.coupon[1]);
    if (Number.isFinite(pct) && pct > 0) couponPercent = Math.round(pct);
  } else {
    const couponRaw = Number(row.couponOneTimePercent ?? 0);
    if (Number.isFinite(couponRaw) && couponRaw > 0 && couponRaw <= 90) {
      couponPercent = Math.round(couponRaw);
    }
  }

  return {
    asin,
    title: String(row.title || "").trim(),
    brand: String(row.brand || "").trim(),
    imageUrl: firstImage(row),
    upc: firstUpc(row),
    mpn: firstMpn(row),
    // Amazon is "retail present" only when Amazon has a live offer (>0 cents).
    amazonRetail: amazonNow != null && amazonNow > 0,
    buyBoxPrice: buyBox || newPrice || amazonNow,
    newPrice,
    sellerCount,
    salesRank,
    avgSalesRank90,
    avgNew90: avg90,
    discount90,
    packageLb: packageLbFromKeepa(row),
    bsrDrops90: Number.isFinite(drops) && drops > 0 ? drops : null,
    priceVariation90: variation,
    rating,
    reviewCount,
    monthlySold,
    amazonOos90,
    buyBoxAmazonShare90,
    couponPercent,
  };
}
