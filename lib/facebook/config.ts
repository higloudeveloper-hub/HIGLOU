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

/** Turn raw Graph (#200) blobs into actionable Spanish copy. */
export function humanizeFacebookGraphError(raw: string | null | undefined): string {
  const msg = String(raw || "").replace(/\\\s+/g, " ").trim();
  if (!msg) return "Error de Facebook Graph.";

  if (
    /pages_manage_posts|pages_read_engagement|publish_to_groups|#200/i.test(msg)
  ) {
    return (
      "Faltan permisos en el token. En Graph Explorer agregá " +
      "pages_manage_posts + pages_read_engagement, generá un token nuevo " +
      "con la Page seleccionada, y reconectá en Settings."
    );
  }
  if (/nonexisting field \(accounts\)/i.test(msg)) {
    return (
      "Estás con token de Page. Para /me/accounts usá Token del usuario, " +
      "o con la Page seleccionada usá GET /me para el Page ID."
    );
  }
  if (/invalid.*token|session has expired|oauthexception/i.test(msg)) {
    return "Token inválido o vencido. Generá uno nuevo en Graph y reconectá.";
  }
  return msg.length > 280 ? `${msg.slice(0, 277)}…` : msg;
}
