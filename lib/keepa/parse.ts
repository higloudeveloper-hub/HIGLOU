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
};

function firstImage(imagesCSV: unknown): string {
  const id = String(imagesCSV || "")
    .split(",")
    .map((part) => part.trim())
    .find(Boolean);
  if (!id) return "";
  return `https://m.media-amazon.com/images/I/${id}`;
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
  const buyBox =
    keepaCents(statsSlot(stats, "current", KEEPA_INDEX.BUY_BOX_SHIPPING)) ??
    keepaCents(keepaLastValue(csv[KEEPA_INDEX.BUY_BOX_SHIPPING]));
  const amazonNow =
    keepaCents(statsSlot(stats, "current", KEEPA_INDEX.AMAZON)) ??
    keepaCents(keepaLastValue(csv[KEEPA_INDEX.AMAZON]));
  const newPrice =
    keepaCents(statsSlot(stats, "current", KEEPA_INDEX.NEW)) ??
    keepaCents(keepaLastValue(csv[KEEPA_INDEX.NEW]));
  const min90 = keepaCents(statsSlot(stats, "min90", KEEPA_INDEX.NEW) ?? statsSlot(stats, "min", KEEPA_INDEX.NEW));
  const max90 = keepaCents(statsSlot(stats, "max90", KEEPA_INDEX.NEW) ?? statsSlot(stats, "max", KEEPA_INDEX.NEW));
  const avg90 = keepaCents(statsSlot(stats, "avg90", KEEPA_INDEX.NEW));
  const base = avg90 || newPrice || buyBox;
  const variation =
    min90 != null && max90 != null && base
      ? Math.round(((max90 - min90) / base) * 1000) / 1000
      : null;
  const currentNew = buyBox || newPrice;
  const discount90 =
    avg90 != null && avg90 > 0 && currentNew != null
      ? Math.round(((avg90 - currentNew) / avg90) * 1000) / 1000
      : null;
  const salesRank =
    statsSlot(stats, "current", KEEPA_INDEX.SALES) ??
    keepaLastValue(csv[KEEPA_INDEX.SALES]);
  const avgSalesRank90 = statsSlot(stats, "avg90", KEEPA_INDEX.SALES);
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
  return {
    asin,
    title: String(row.title || "").trim(),
    brand: String(row.brand || "").trim(),
    imageUrl: firstImage(row.imagesCSV),
    upc: firstUpc(row),
    mpn: firstMpn(row),
    amazonRetail: amazonNow != null,
    buyBoxPrice: buyBox || newPrice,
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
  };
}
