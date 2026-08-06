import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * AES-256-GCM helpers for eBay refresh/access tokens at rest.
 * Key: EBAY_TOKEN_ENCRYPTION_KEY (any secret ≥32 chars; hashed to 32 bytes).
 */

function keyBytes(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plaintext: string, secret: string): string {
  if (!plaintext) return "";
  if (!secret || secret.length < 32) {
    throw new Error("EBAY_TOKEN_ENCRYPTION_KEY must be at least 32 characters");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(secret), iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

export function decryptSecret(payload: string, secret: string): string {
  if (!payload) return "";
  if (!secret || secret.length < 32) {
    throw new Error("EBAY_TOKEN_ENCRYPTION_KEY must be at least 32 characters");
  }
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Invalid encrypted token payload");
  }
  const iv = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const data = Buffer.from(parts[3], "base64url");
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}

/** Signed OAuth state: userId.nonce.exp.hmac */
export function signOAuthState(
  userId: string,
  secret: string,
  ttlSeconds = 600,
): string {
  const nonce = randomBytes(16).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const body = `${userId}.${nonce}.${exp}`;
  const hmac = createHash("sha256")
    .update(`${body}.${secret}`)
    .digest("base64url");
  return `${body}.${hmac}`;
}

export function verifyOAuthState(
  state: string,
  secret: string,
): { userId: string } | null {
  const parts = String(state || "").split(".");
  if (parts.length !== 4) return null;
  const [userId, nonce, expStr, hmac] = parts;
  if (!userId || !nonce || !expStr || !hmac) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  const body = `${userId}.${nonce}.${exp}`;
  const expected = createHash("sha256")
    .update(`${body}.${secret}`)
    .digest("base64url");
  if (expected !== hmac) return null;
  return { userId };
}
