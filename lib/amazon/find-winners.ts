import { findOpportunities } from "@/lib/opportunity/engine";
import type { KeepaMode } from "@/lib/keepa/budget";
import type { OpportunityMode } from "@/lib/opportunity/types";

/** Back-compat wrapper around the opportunity engine. */
export async function findAmazonWinners(opts: {
  query: string;
  category?: string;
  categoryId?: string;
  keepaRoot?: string;
  limit?: number;
  pageOrigin?: string;
  amazonToken?: string;
  marketplaceId?: string;
  sellingPartnerId?: string;
  ebayToken?: string;
  mode?: OpportunityMode;
  onlySellable?: boolean;
  supplierCost?: number | null;
  seed?: number;
  excludeAsins?: string[];
  keepaMode?: KeepaMode;
  keepaPurpose?: "live" | "manual" | "enrich";
}) {
  return findOpportunities(opts);
}
