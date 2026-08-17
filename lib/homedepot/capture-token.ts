import { signOAuthState, verifyOAuthState } from "@/lib/ebay/crypto-tokens";

function captureSecret(): string {
  const key =
    String(process.env.EBAY_TOKEN_ENCRYPTION_KEY || "").trim() ||
    String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return key.length >= 32 ? key : "";
}

export function signHomeDepotCaptureToken(userId: string): string {
  const secret = captureSecret();
  if (!secret) return "";
  return signOAuthState(userId, secret, 30 * 60);
}

export function verifyHomeDepotCaptureToken(
  token: string,
): { userId: string } | null {
  const secret = captureSecret();
  if (!secret) return null;
  return verifyOAuthState(token, secret);
}
