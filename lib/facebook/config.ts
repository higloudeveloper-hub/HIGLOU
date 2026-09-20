import {
  decryptSecret,
  encryptSecret,
} from "@/lib/ebay/crypto-tokens";

/** Prefer dedicated FB key; fall back to eBay encryption key already in env. */
export function facebookEncryptionKey(): string {
  return (
    process.env.FACEBOOK_TOKEN_ENCRYPTION_KEY ||
    process.env.EBAY_TOKEN_ENCRYPTION_KEY ||
    ""
  ).trim();
}

export function canEncryptFacebookToken(): boolean {
  return facebookEncryptionKey().length >= 32;
}

export function encryptFacebookToken(token: string): string {
  return encryptSecret(token, facebookEncryptionKey());
}

export function decryptFacebookToken(payload: string): string {
  return decryptSecret(payload, facebookEncryptionKey());
}

export function facebookSharerUrl(destinationUrl: string): string {
  const u = new URL("https://www.facebook.com/sharer/sharer.php");
  u.searchParams.set("u", destinationUrl);
  return u.toString();
}
