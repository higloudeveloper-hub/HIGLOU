/**
 * Amazon Selling Partner API / Login with Amazon.
 * Register the app in Seller Central → Apps and Services → Develop Apps.
 */

export type AmazonSpEnv = "sandbox" | "production";

export const AMAZON_US_MARKETPLACE_ID = "ATVPDKIKX0DER";

export function getAmazonSpEnv(): AmazonSpEnv {
  const raw = (process.env.AMAZON_SP_API_ENV || "production").toLowerCase();
  return raw === "sandbox" ? "sandbox" : "production";
}

export function getAmazonSpConfig() {
  const env = getAmazonSpEnv();
  const clientId = (process.env.AMAZON_LWA_CLIENT_ID || "").trim();
  const clientSecret = (process.env.AMAZON_LWA_CLIENT_SECRET || "").trim();
  const applicationId = (process.env.AMAZON_APP_ID || "").trim();
  const encryptionKey = (
    process.env.AMAZON_TOKEN_ENCRYPTION_KEY ||
    process.env.EBAY_TOKEN_ENCRYPTION_KEY ||
    ""
  ).trim();
  const marketplaceId = (
    process.env.AMAZON_MARKETPLACE_ID || AMAZON_US_MARKETPLACE_ID
  ).trim();
  const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

  return {
    env,
    clientId,
    clientSecret,
    applicationId,
    encryptionKey,
    marketplaceId,
    appOrigin,
    tokenUrl: "https://api.amazon.com/auth/o2/token",
    authorizeBase: "https://sellercentral.amazon.com/apps/authorize/consent",
    apiBase:
      env === "sandbox"
        ? "https://sandbox.sellingpartnerapi-na.amazon.com"
        : "https://sellingpartnerapi-na.amazon.com",
    loginPath: "/api/amazon/oauth/login",
    callbackPath: "/api/amazon/oauth/callback",
    draftApp: (process.env.AMAZON_APP_DRAFT || "1") !== "0",
  };
}

export function amazonCallbackUrl(origin?: string) {
  const cfg = getAmazonSpConfig();
  const base = (origin || cfg.appOrigin).replace(/\/$/, "");
  return `${base}${cfg.callbackPath}`;
}

export function amazonLoginUrl(origin?: string) {
  const cfg = getAmazonSpConfig();
  const base = (origin || cfg.appOrigin).replace(/\/$/, "");
  return `${base}${cfg.loginPath}`;
}

export function isAmazonSpConfigured(): boolean {
  const cfg = getAmazonSpConfig();
  return Boolean(
    cfg.clientId &&
      cfg.clientSecret &&
      cfg.applicationId &&
      cfg.encryptionKey.length >= 32,
  );
}

export function amazonSpMissingReason(): string {
  const cfg = getAmazonSpConfig();
  const missing: string[] = [];
  if (!cfg.clientId) missing.push("AMAZON_LWA_CLIENT_ID");
  if (!cfg.clientSecret) missing.push("AMAZON_LWA_CLIENT_SECRET");
  if (!cfg.applicationId) missing.push("AMAZON_APP_ID");
  if (cfg.encryptionKey.length < 32) {
    missing.push("AMAZON_TOKEN_ENCRYPTION_KEY or EBAY_TOKEN_ENCRYPTION_KEY (min 32 chars)");
  }
  if (!missing.length) return "";
  return `Amazon Seller is not configured. Set ${missing.join(", ")} in the environment.`;
}
