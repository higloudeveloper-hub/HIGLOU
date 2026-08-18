import type { SupabaseClient } from "@supabase/supabase-js";
import { getAmazonSpConfig } from "@/lib/amazon/sp-config";
import {
  getAmazonConnectionPublic,
  getValidAmazonAccessToken,
} from "@/lib/amazon/sp-oauth";
import { getValidAccessToken } from "@/lib/ebay/oauth";

export async function loadWinnerMarketTokens(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  amazonToken?: string;
  marketplaceId?: string;
  sellingPartnerId?: string;
  ebayToken?: string;
}> {
  const out: {
    amazonToken?: string;
    marketplaceId?: string;
    sellingPartnerId?: string;
    ebayToken?: string;
  } = {};
  try {
    const amazon = await getAmazonConnectionPublic(supabase, userId);
    if (amazon.connected) {
      const creds = await getValidAmazonAccessToken(supabase, userId);
      out.amazonToken = creds.token;
      out.sellingPartnerId = creds.sellingPartnerId;
      out.marketplaceId = getAmazonSpConfig().marketplaceId;
    }
  } catch {
    /* public Amazon search still works */
  }
  try {
    out.ebayToken = await getValidAccessToken(supabase, userId);
  } catch {
    /* eBay live prices are optional */
  }
  return out;
}
