/** Keepa spend controls — tokens are expensive; never burn them on idle loops. */

export type KeepaPurpose = "live" | "manual" | "enrich" | "variations" | "status";

export type KeepaMode = "off" | "enrich" | "full";

function envFlag(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "on", "yes"].includes(raw)) return true;
  if (["0", "false", "off", "no"].includes(raw)) return false;
  return fallback;
}

function envInt(name: string, fallback: number): number {
  const raw = (process.env[name] || "").trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Live Find Winners loop must not call Keepa (default off). */
export function keepaLiveEnabled(): boolean {
  return envFlag("KEEPA_LIVE_ENABLED", false);
}

/** Optional variation fallback on Amazon import (default off — 1–2 tokens each). */
export function keepaVariationsEnabled(): boolean {
  return envFlag("KEEPA_VARIATIONS_ENABLED", false);
}

/** Stop using Keepa when balance falls below this. */
export function keepaMinTokens(): number {
  return Math.max(0, envInt("KEEPA_MIN_TOKENS", 150));
}

/** Cap product hydrations per scan (1 token each). */
export function keepaMaxProductsPerScan(): number {
  return Math.min(20, Math.max(1, envInt("KEEPA_MAX_PRODUCTS_PER_SCAN", 10)));
}

export function resolveKeepaMode(
  requested: KeepaMode | undefined,
  purpose: KeepaPurpose,
): KeepaMode {
  if (requested) return requested;
  if (purpose === "live") return keepaLiveEnabled() ? "enrich" : "off";
  if (purpose === "manual") return "full";
  if (purpose === "enrich") return "enrich";
  return "off";
}

type TokenCache = {
  tokensLeft: number;
  checkedAt: number;
};

let tokenCache: TokenCache | null = null;
const TOKEN_CACHE_MS = 60_000;

export function rememberKeepaTokens(tokensLeft: number): void {
  if (!Number.isFinite(tokensLeft)) return;
  tokenCache = { tokensLeft, checkedAt: Date.now() };
}

export function cachedKeepaTokens(): number | null {
  if (!tokenCache) return null;
  if (Date.now() - tokenCache.checkedAt > TOKEN_CACHE_MS) return null;
  return tokenCache.tokensLeft;
}

export function noteKeepaSpend(consumed: number): void {
  if (!tokenCache || !Number.isFinite(consumed) || consumed <= 0) return;
  tokenCache = {
    tokensLeft: Math.max(0, tokenCache.tokensLeft - consumed),
    checkedAt: tokenCache.checkedAt,
  };
}

export function keepaBudgetOk(needed = 1): boolean {
  const left = cachedKeepaTokens();
  if (left == null) return true; // unknown — allow once, then cache fills
  return left - needed >= keepaMinTokens();
}

export function keepaAllowedFor(purpose: KeepaPurpose): boolean {
  if (purpose === "status") return true;
  if (purpose === "live" && !keepaLiveEnabled()) return false;
  if (purpose === "variations" && !keepaVariationsEnabled()) return false;
  return keepaBudgetOk(purpose === "manual" ? 20 : 8);
}
