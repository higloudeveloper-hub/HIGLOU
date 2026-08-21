import { toEbayInventorySku } from "@/lib/ebay/listing-helpers";

export function normalizePromoSku(sku: string | null | undefined): string {
  return (sku || "").trim().toLowerCase();
}

export function compactPromoSku(sku: string | null | undefined): string {
  return normalizePromoSku(sku).replace(/[^a-z0-9]+/g, "");
}

export function normalizePromoTitle(name: string | null | undefined): string {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function promoSkuLookupKeys(sku: string | null | undefined): string[] {
  const raw = (sku || "").trim();
  if (!raw) return [];
  const keys = new Set<string>([raw, raw.toLowerCase(), raw.toUpperCase()]);
  const compact = compactPromoSku(raw);
  if (compact) {
    keys.add(compact);
    keys.add(compact.toUpperCase());
  }
  const ebay = toEbayInventorySku(raw);
  if (ebay && ebay !== "ITEM") keys.add(ebay);
  return [...keys];
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
  listingTitle?: string | null,
): T | null {
  const listingKeys = new Set(
    promoSkuLookupKeys(listingSku).map((key) => normalizePromoSku(key)),
  );
  const listingCompact = compactPromoSku(listingSku);
  const skuHit =
    shop.find((product) => {
      const productKeys = promoSkuLookupKeys(product.sku).map((key) =>
        normalizePromoSku(key),
      );
      if (productKeys.some((key) => listingKeys.has(key))) return true;
      return Boolean(listingCompact) && compactPromoSku(product.sku) === listingCompact;
    }) ?? null;
  if (skuHit) return skuHit;

  const title = normalizePromoTitle(listingTitle);
  if (!title) return null;
  const titleHits = shop.filter(
    (product) => normalizePromoTitle(product.name) === title,
  );
  return titleHits.length === 1 ? titleHits[0] : null;
}

export function uniqueListingCardsByShopProduct<
  T extends { shopProduct: { id: string } | null },
>(cards: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const card of cards) {
    const shopId = card.shopProduct?.id;
    if (shopId) {
      if (seen.has(shopId)) continue;
      seen.add(shopId);
    }
    unique.push(card);
  }
  return unique;
}

export function ebayItemUrl(listingId: string | null | undefined): string | null {
  const id = String(listingId || "").replace(/\D/g, "");
  if (id.length < 8 || id.length > 20) return null;
  return `https://www.ebay.com/itm/${id}`;
}
