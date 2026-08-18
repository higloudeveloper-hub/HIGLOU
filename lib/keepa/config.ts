export function isKeepaConfigured(): boolean {
  return Boolean((process.env.KEEPA_API_KEY || "").trim());
}

export function keepaApiKey(): string {
  return (process.env.KEEPA_API_KEY || "").trim();
}

export const KEEPA_US_DOMAIN = 1;
