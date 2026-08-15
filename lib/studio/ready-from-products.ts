import type { ReadyListing } from "@/components/studio/ready-catalog";

export type ProductForReady = {
  id?: string;
  title?: string | null;
  brand?: string | null;
  descriptionSummary?: string | null;
  descriptionHtml?: string | null;
  price?: number | null;
  status?: string | null;
  itemLocation?: string | null;
  handlingTime?: number | null;
  coverUrl?: string | null;
  photos?: string[] | null;
  photoCount?: number | null;
};

function plain(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function shipsLabel(handling?: number | null) {
  const days = Math.max(1, Number(handling) || 2);
  if (days <= 1) return "1–2 day ship";
  if (days <= 2) return "2–4 day ship";
  return `${days}–${days + 2} day ship`;
}

function scoreProduct(product: ProductForReady) {
  const photos = (product.photos ?? []).filter(Boolean);
  const cover = product.coverUrl || photos[0] || "";
  const title = String(product.title ?? "").trim();
  const price = Number(product.price) || 0;
  const status = String(product.status ?? "").toLowerCase();
  let score = photos.length * 24;
  if (cover) score += 20;
  if (photos.length >= 3) score += 36;
  if (photos.length >= 5) score += 16;
  if (title.length >= 18) score += 12;
  if (price > 0) score += 14;
  if (price >= 80) score += 8;
  if (status.includes("publish") || status.includes("ready") || status.includes("csv")) {
    score += 10;
  }
  return { score, photos, cover, title, price };
}

export function productToReadyListing(product: ProductForReady): ReadyListing | null {
  const { photos, cover, title, price } = scoreProduct(product);
  if (!cover || !title) return null;
  const shots = (photos.length ? photos : [cover]).slice(0, 5);
  const sell = price > 0 ? price : 189;
  const buy = Math.max(8, Math.round(sell * 0.38));
  const comps = Math.max(sell + 12, Math.round(sell * 1.22));
  const description =
    plain(String(product.descriptionSummary || product.descriptionHtml || "")) ||
    title;
  const name =
    String(product.brand || "").trim() ||
    title.split(/\s+/).slice(0, 2).join(" ");
  return {
    name,
    title,
    description: description.slice(0, 140),
    photo: cover,
    photos: shots,
    buy,
    sell,
    comps,
    supplier: String(product.itemLocation || "").trim() || "US warehouse",
    ships: shipsLabel(product.handlingTime),
  };
}

export function pickBestReadyListings(
  products: ProductForReady[],
  limit = 5,
): ReadyListing[] {
  return products
    .map((product) => {
      const ranked = scoreProduct(product);
      const listing = productToReadyListing(product);
      return listing ? { listing, score: ranked.score } : null;
    })
    .filter((row): row is { listing: ReadyListing; score: number } => Boolean(row))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.listing);
}
