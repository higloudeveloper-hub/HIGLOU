import { getEbayConfig } from "@/lib/ebay/config";

/**
 * Trading API GetStore — the seller's eBay Store name (not the username).
 * Returns null when the account has no Store or the call fails.
 */
export async function fetchEbayStoreName(
  accessToken: string,
): Promise<string | null> {
  const cfg = getEbayConfig();
  const xmlBody = `<?xml version="1.0" encoding="utf-8"?>
<GetStoreRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <CategoryStructureOnly>true</CategoryStructureOnly>
</GetStoreRequest>`;

  const res = await fetch(`${cfg.apiBase}/ws/api.dll`, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "X-EBAY-API-IAF-TOKEN": accessToken,
      "X-EBAY-API-CALL-NAME": "GetStore",
      "X-EBAY-API-SITEID": "0",
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1193",
    },
    body: xmlBody,
  });
  const xml = await res.text();
  if (!res.ok || /<Ack>Failure<\/Ack>/i.test(xml)) {
    return null;
  }
  const storeBlock = xml.match(/<Store\b[\s\S]*?<\/Store>/i)?.[0];
  const name = storeBlock?.match(/<Name>([^<]+)<\/Name>/i)?.[1]?.trim();
  return name || null;
}
