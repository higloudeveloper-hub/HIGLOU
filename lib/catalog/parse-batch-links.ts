import { parseAmazonLink } from "@/lib/amazon/asin";
import { parseHomeDepotLink } from "@/lib/homedepot/item-id";
import { parseWalmartLink } from "@/lib/walmart/item-id";
import { detectCatalogStore, type CatalogStore } from "@/lib/catalog/detect-store";

export const BATCH_IMPORT_LIMIT = 5;

export type BatchCatalogLink = {
  url: string;
  store: CatalogStore;
  key: string;
};

const URL_RE = /https?:\/\/[^\s,;]+/gi;

function catalogKey(url: string, store: CatalogStore): string {
  if (store === "amazon") {
    return parseAmazonLink(url)?.asin || url;
  }
  if (store === "walmart") {
    return parseWalmartLink(url)?.itemId || url;
  }
  return parseHomeDepotLink(url)?.itemId || url;
}

function canonicalUrl(raw: string, store: CatalogStore): string {
  if (store === "amazon") {
    return parseAmazonLink(raw)?.canonicalUrl || raw;
  }
  if (store === "walmart") {
    return parseWalmartLink(raw)?.canonicalUrl || raw;
  }
  return parseHomeDepotLink(raw)?.canonicalUrl || raw;
}

/** Split pasted text into up to 5 unique Amazon / Home Depot / Walmart product links. */
export function parseBatchCatalogLinks(input: string): {
  links: BatchCatalogLink[];
  skipped: string[];
} {
  const chunks = String(input || "")
    .split(/[\n,;]+/)
    .flatMap((part) => {
      const urls = part.match(URL_RE) || [];
      const rest = part.replace(URL_RE, " ").trim();
      return [...urls, rest].map((row) => row.replace(/[)\].,]+$/g, "").trim());
    })
    .filter(Boolean);

  const links: BatchCatalogLink[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();

  for (const chunk of chunks) {
    const store = detectCatalogStore(chunk);
    if (!store) {
      skipped.push(chunk.slice(0, 80));
      continue;
    }
    const key = catalogKey(chunk, store);
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({
      url: canonicalUrl(chunk, store),
      store,
      key,
    });
    if (links.length >= BATCH_IMPORT_LIMIT) break;
  }

  return { links, skipped };
}
