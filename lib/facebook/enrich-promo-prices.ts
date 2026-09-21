import {
  detectPromoDestination,
  extractAsinFromUrl,
  formatPromoPriceLabel,
} from "@/lib/facebook/destination-price";
import { isKeepaConfigured } from "@/lib/keepa/config";
import { keepaProducts } from "@/lib/keepa/finder";

type PriceCard = {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string;
  priceLabel?: string | null;
  asin?: string | null;
};

function resolveAsin(card: PriceCard): string | null {
  const fromUrl = extractAsinFromUrl(card.linkUrl);
  if (fromUrl) return fromUrl;
  const raw = String(card.asin || "").trim().toUpperCase();
  return /^[A-Z0-9]{10}$/.test(raw) ? raw : null;
}

function isAmazonPriced(card: PriceCard): boolean {
  const dest = detectPromoDestination(card.linkUrl);
  if (dest === "amazon") return true;
  // Smart /r/ redirects still open Amazon when we have an ASIN
  if (dest === "other" && resolveAsin(card)) return true;
  return false;
}

/**
 * Re-stamp carousel/ads price labels with live Amazon buy box when possible.
 * Clears Amazon price labels we cannot verify so FB never shows arbitrage "sell".
 */
export async function enrichPromoCardPrices<T extends PriceCard>(
  cards: T[],
): Promise<T[]> {
  if (!cards.length) return cards;

  const asinByIndex = cards.map((c) =>
    isAmazonPriced(c) ? resolveAsin(c) : null,
  );

  const asins = [
    ...new Set(asinByIndex.filter((a): a is string => Boolean(a))),
  ];

  const liveByAsin = new Map<string, number>();
  if (asins.length && isKeepaConfigured()) {
    try {
      const snaps = await keepaProducts(asins);
      for (const snap of snaps) {
        const price = snap.buyBoxPrice ?? snap.newPrice;
        if (price != null && price > 0) {
          liveByAsin.set(snap.asin.toUpperCase(), price);
        }
      }
    } catch {
      // Keepa down — clear unverified Amazon labels below
    }
  }

  return cards.map((card, i) => {
    if (!isAmazonPriced(card)) return card;
    const asin = asinByIndex[i];
    const live = asin ? liveByAsin.get(asin) : undefined;
    if (live != null) {
      return { ...card, priceLabel: formatPromoPriceLabel(live) };
    }
    // Do not trust client-sent sell/list prices for Amazon destinations
    return { ...card, priceLabel: null };
  });
}
