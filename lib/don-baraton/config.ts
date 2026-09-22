/**
 * Kill switch: Don Baratón storefront sync + FB promo from Higlou.
 * Always off — Affiliate Facebook Ads use /api/facebook/* only.
 */
export type DonBaratonConfig = {
  apiUrl: string;
  importToken: string;
  enabled: boolean;
  publicUrl: string;
};

export function getDonBaratonConfig(): DonBaratonConfig {
  // Hard kill — Higlou no longer drives Don Baratón publish/sync.
  // Telegram / Don Baratón must use their own stack; we revoke shared FB tokens separately.
  return {
    apiUrl: "",
    importToken: "",
    enabled: false,
    publicUrl: "",
  };
}

export function isDonBaratonSyncEnabled(): boolean {
  return false;
}
