import type { KeepaSnapshot } from "@/lib/keepa/parse";

type CacheEntry = {
  snap: KeepaSnapshot;
  at: number;
};

const store = new Map<string, CacheEntry>();
const TTL_MS = 6 * 60 * 60 * 1000;
const MAX_ENTRIES = 400;

export function getCachedKeepaProduct(asin: string): KeepaSnapshot | null {
  const id = asin.toUpperCase();
  const row = store.get(id);
  if (!row) return null;
  if (Date.now() - row.at > TTL_MS) {
    store.delete(id);
    return null;
  }
  return row.snap;
}

export function setCachedKeepaProduct(snap: KeepaSnapshot): void {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  store.set(snap.asin.toUpperCase(), { snap, at: Date.now() });
}

export function takeCachedKeepaProducts(
  asins: string[],
): { hits: KeepaSnapshot[]; missing: string[] } {
  const hits: KeepaSnapshot[] = [];
  const missing: string[] = [];
  for (const asin of asins) {
    const cached = getCachedKeepaProduct(asin);
    if (cached) hits.push(cached);
    else missing.push(asin.toUpperCase());
  }
  return { hits, missing };
}
