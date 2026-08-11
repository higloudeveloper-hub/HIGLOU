/**
 * eBay Sell API / OAuth environment config.
 * Register the app at https://developer.ebay.com/ — RuName is the OAuth redirect_uri value.
 */

export type EbayEnv = "sandbox" | "production";

export const EBAY_OAUTH_SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
] as const;

export function getEbayEnv(): EbayEnv {
  const raw = (process.env.EBAY_ENV || "sandbox").toLowerCase();
  return raw === "production" ? "production" : "sandbox";
}

export function getEbayConfig() {
  const env = getEbayEnv();
  const clientId = (process.env.EBAY_CLIENT_ID || "").trim();
  const clientSecret = (process.env.EBAY_CLIENT_SECRET || "").trim();
  const ruName = (process.env.EBAY_RU_NAME || "").trim();
  const encryptionKey = (process.env.EBAY_TOKEN_ENCRYPTION_KEY || "").trim();

  const authorizeBase =
    env === "production"
      ? "https://auth.ebay.com/oauth2/authorize"
      : "https://auth.sandbox.ebay.com/oauth2/authorize";
  const apiBase =
    env === "production"
      ? "https://api.ebay.com"
      : "https://api.sandbox.ebay.com";

  return {
    env,
    clientId,
    clientSecret,
    ruName,
    encryptionKey,
    authorizeBase,
    apiBase,
    tokenUrl: `${apiBase}/identity/v1/oauth2/token`,
    scopes: [...EBAY_OAUTH_SCOPES],
  };
}

export function isEbayOAuthConfigured(): boolean {
  const cfg = getEbayConfig();
  return Boolean(
    cfg.clientId &&
      cfg.clientSecret &&
      cfg.ruName &&
      cfg.encryptionKey.length >= 32,
  );
}

export function ebayOAuthMissingReason(): string {
  const cfg = getEbayConfig();
  const missing: string[] = [];
  if (!cfg.clientId) missing.push("EBAY_CLIENT_ID");
  if (!cfg.clientSecret) missing.push("EBAY_CLIENT_SECRET");
  if (!cfg.ruName) missing.push("EBAY_RU_NAME");
  if (cfg.encryptionKey.length < 32) {
    missing.push("EBAY_TOKEN_ENCRYPTION_KEY (min 32 chars)");
  }
  if (!missing.length) return "";
  return `eBay OAuth is not configured. Set ${missing.join(", ")} in the environment (use Production keys for live sellers).`;
}
