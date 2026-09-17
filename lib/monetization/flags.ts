/**
 * Money Engine feature flags. Default OFF — Higlou behaves exactly as before.
 * Pattern mirrors lib/don-baraton/config.ts.
 */

function envFlag(name: string, defaultOn = false): boolean {
  const raw = (process.env[name] || "").trim().toLowerCase();
  if (!raw) return defaultOn;
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") {
    return false;
  }
  if (raw === "1" || raw === "true" || raw === "on" || raw === "yes") {
    return true;
  }
  return defaultOn;
}

export type MonetizationFlags = {
  moneyEngine: boolean;
  affiliateEngine: boolean;
  smartLinks: boolean;
  moneyScore: boolean;
};

export function getMonetizationFlags(): MonetizationFlags {
  const moneyEngine = envFlag("MONEY_ENGINE_ENABLED", false);
  return {
    moneyEngine,
    affiliateEngine: moneyEngine && envFlag("AFFILIATE_ENGINE_ENABLED", false),
    smartLinks: moneyEngine && envFlag("SMART_LINKS_ENABLED", false),
    moneyScore: moneyEngine && envFlag("MONEY_SCORE_ENABLED", true),
  };
}

export function isMoneyEngineEnabled() {
  return getMonetizationFlags().moneyEngine;
}
