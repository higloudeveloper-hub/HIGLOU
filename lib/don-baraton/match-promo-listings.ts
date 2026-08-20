export function normalizePromoSku(sku: string | null | undefined): string {
  return (sku || "").trim().toLowerCase();
}

export type PromoShopProduct = {
  id: string;
  sku: string | null;
  slug: string;
  name: string;
};

export function matchListingToShopProduct<T extends PromoShopProduct>(
  listingSku: string | null | undefined,
  shop: T[],
): T | null {
  const sku = normalizePromoSku(listingSku);
  if (!sku) return null;
  return shop.find((product) => normalizePromoSku(product.sku) === sku) ?? null;
}
