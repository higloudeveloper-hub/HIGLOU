/**
 * Pull a selling-partner / merchant id out of SP-API JSON or an LWA access token.
 */

const ID_KEYS = /^(sellingPartnerId|selling_partner_id|sellerId|seller_id|merchantId|merchant_id)$/i;
const MERCHANT_ID = /^A[A-Z0-9]{9,}$/i;

function walkIds(value: unknown, found: string[]) {
  if (value == null) return;
  if (Array.isArray(value)) {
    for (const item of value) walkIds(item, found);
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (ID_KEYS.test(key) && typeof nested === "string" && nested.trim()) {
      found.push(nested.trim());
    }
    walkIds(nested, found);
  }
}

export function sellingPartnerIdFromPayload(payload: unknown): string {
  const found: string[] = [];
  walkIds(payload, found);
  return found.find((id) => MERCHANT_ID.test(id)) || found[0] || "";
}

export function sellingPartnerIdFromAccessToken(token: string): string {
  const parts = String(token || "").split(".");
  if (parts.length < 2) return "";
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    return sellingPartnerIdFromPayload(JSON.parse(json) as unknown);
  } catch {
    return "";
  }
}

export function isAmazonRefreshToken(value: string): boolean {
  const token = String(value || "").trim();
  return token.startsWith("Atzr|") && token.length >= 40;
}
