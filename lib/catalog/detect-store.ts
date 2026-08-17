import { parseAmazonLink } from "@/lib/amazon/asin";
import { parseHomeDepotLink } from "@/lib/homedepot/item-id";

export type CatalogStore = "amazon" | "homedepot";

/** Which catalog a pasted link belongs to. All-numeric ids are Home Depot. */
export function detectCatalogStore(input: string): CatalogStore | null {
  const trimmed = String(input || "").trim();
  if (!trimmed) return null;
  if (/^\d{8,12}$/.test(trimmed)) return "homedepot";
  if (parseHomeDepotLink(trimmed)) return "homedepot";
  if (parseAmazonLink(trimmed)) return "amazon";
  return null;
}
