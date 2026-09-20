import type { ReadyListing } from "@/components/studio/ready-catalog";
import type { MarketDropPublic } from "@/lib/market/from-opportunity";
import { marketSpread } from "@/lib/market/catalog";

/**
 * Map verified Market drops → Home animation catalog.
 * Dedupes by ASIN/id so the machine never repeats the same winner.
 */
export function marketDropsToReadyListings(
  drops: MarketDropPublic[],
  limit = 8,
): ReadyListing[] {
  const seen = new Set<string>();
  const out: ReadyListing[] = [];

  for (const drop of drops) {
    const asin = String(drop.asin || "")
      .trim()
      .toUpperCase();
    const key = /^[A-Z0-9]{10}$/.test(asin) ? asin : drop.id;
    if (!key || seen.has(key)) continue;
    const photo = String(drop.photo || "").trim();
    if (!photo) continue;
    seen.add(key);

    const photos =
      drop.photos?.length && drop.photos.some(Boolean)
        ? [...drop.photos].filter(Boolean)
        : [photo];

    out.push({
      name: drop.name || "Winner",
      title: drop.title,
      description: drop.blurb || drop.title,
      photo,
      photos,
      buy: drop.buy,
      sell: drop.sell,
      comps: drop.comps > drop.sell ? drop.comps : drop.sell,
      supplier: drop.supplier || "Verified",
      ships: drop.ships || "2–4 day ship",
      marketId: drop.id,
      asin: asin || undefined,
      affiliateUrl: drop.affiliateUrl,
      keep: drop.netProfit ?? marketSpread(drop),
    });

    if (out.length >= limit) break;
  }

  return out;
}
