export function isKeepaConfigured(): boolean {
  return Boolean((process.env.KEEPA_API_KEY || "").trim());
}

export function keepaApiKey(): string {
  return (process.env.KEEPA_API_KEY || "").trim();
}

export const KEEPA_US_DOMAIN = 1;

export {
  keepaLiveEnabled,
  keepaVariationsEnabled,
  keepaMinTokens,
  keepaMaxProductsPerScan,
  resolveKeepaMode,
  type KeepaMode,
} from "@/lib/keepa/budget";
