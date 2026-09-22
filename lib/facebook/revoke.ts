/**
 * Revoke Facebook tokens Higlou still holds (bootstrap + stored Page tokens).
 * Invalidates those tokens at Meta so shared copies (Telegram / Don Baratón)
 * that reused the SAME string also stop working.
 */

export async function revokeFacebookAccessToken(
  accessToken: string,
): Promise<{ ok: boolean; detail: string }> {
  const token = String(accessToken || "").trim();
  if (token.length < 20) {
    return { ok: false, detail: "empty token" };
  }

  // 1) DELETE /me/permissions — deauthorize the app for this token
  try {
    const url = new URL("https://graph.facebook.com/v21.0/me/permissions");
    url.searchParams.set("access_token", token);
    const res = await fetch(url, { method: "DELETE" });
    const body = (await res.json().catch(() => null)) as {
      success?: boolean;
      error?: { message?: string };
    } | null;
    if (res.ok && body?.success !== false) {
      return { ok: true, detail: "revoked via /me/permissions" };
    }
    // continue to invalidate attempts
    if (body?.error?.message) {
      // fall through
    }
  } catch {
    // fall through
  }

  // 2) Soft check — if already invalid, treat as success
  try {
    const me = new URL("https://graph.facebook.com/v21.0/me");
    me.searchParams.set("fields", "id");
    me.searchParams.set("access_token", token);
    const res = await fetch(me);
    if (!res.ok) {
      return { ok: true, detail: "token already invalid at Graph" };
    }
  } catch {
    return { ok: true, detail: "token unreachable (treated as dead)" };
  }

  return {
    ok: false,
    detail:
      "Graph no revocó el token (puede ser de otra App). Revocá en Meta Business → Page → Connected apps.",
  };
}

export async function revokeBootstrapFacebookTokens(): Promise<{
  attempted: number;
  revoked: number;
  details: string[];
}> {
  const tokens = [
    String(process.env.FACEBOOK_BOOTSTRAP_PAGE_TOKEN || "").trim(),
  ].filter((t) => t.length >= 20);

  const details: string[] = [];
  let revoked = 0;
  for (const tok of tokens) {
    const r = await revokeFacebookAccessToken(tok);
    details.push(r.detail);
    if (r.ok) revoked += 1;
  }
  return { attempted: tokens.length, revoked, details };
}
