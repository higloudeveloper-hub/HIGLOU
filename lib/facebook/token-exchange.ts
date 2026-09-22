/**
 * Exchange Graph Explorer / short-lived User tokens into long-lived Page tokens.
 *
 * Meta rules:
 * - Short-lived User token ≈ 1–2 hours (Graph Explorer default) → expires fast.
 * - Long-lived User token ≈ 60 days (needs App ID + App Secret).
 * - Page token from a long-lived User token via /me/accounts → does NOT expire.
 *
 * Without FACEBOOK_APP_ID + FACEBOOK_APP_SECRET we cannot extend; we still
 * resolve User → Page but the Page token inherits the short lifetime.
 */

export function facebookAppId(): string {
  return (
    process.env.FACEBOOK_APP_ID ||
    process.env.META_APP_ID ||
    ""
  ).trim();
}

export function facebookAppSecret(): string {
  return (
    process.env.FACEBOOK_APP_SECRET ||
    process.env.META_APP_SECRET ||
    ""
  ).trim();
}

export function canExtendFacebookTokens(): boolean {
  return Boolean(facebookAppId() && facebookAppSecret());
}

type ExchangeOk = {
  ok: true;
  accessToken: string;
  /** Unix seconds; null = never expires (Page token from long-lived user) */
  expiresAt: number | null;
  kind: "long_lived_user" | "page" | "short_lived";
};

type ExchangeFail = { ok: false; error: string };

/**
 * Exchange a short-lived User token for a long-lived User token (~60 days).
 */
export async function exchangeLongLivedUserToken(
  shortLivedUserToken: string,
): Promise<ExchangeOk | ExchangeFail> {
  if (!canExtendFacebookTokens()) {
    return {
      ok: false,
      error:
        "Falta FACEBOOK_APP_ID + FACEBOOK_APP_SECRET en Vercel para tokens que no vencen.",
    };
  }
  const url = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", facebookAppId());
  url.searchParams.set("client_secret", facebookAppSecret());
  url.searchParams.set("fb_exchange_token", shortLivedUserToken.trim());

  const res = await fetch(url);
  const body = (await res.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  } | null;

  if (!res.ok || !body?.access_token) {
    return {
      ok: false,
      error:
        body?.error?.message ||
        "No se pudo extender el User token. Generá uno nuevo en Graph Explorer.",
    };
  }

  const expiresIn = Number(body.expires_in) || 60 * 24 * 3600;
  return {
    ok: true,
    accessToken: body.access_token,
    expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
    kind: "long_lived_user",
  };
}

/**
 * Inspect token expiry via debug_token (requires app credentials).
 */
export async function debugFacebookToken(accessToken: string): Promise<{
  valid: boolean;
  expiresAt: number | null;
  isPage: boolean;
  error?: string;
}> {
  if (!canExtendFacebookTokens()) {
    return { valid: true, expiresAt: null, isPage: false };
  }
  const appToken = `${facebookAppId()}|${facebookAppSecret()}`;
  const url = new URL("https://graph.facebook.com/v21.0/debug_token");
  url.searchParams.set("input_token", accessToken);
  url.searchParams.set("access_token", appToken);
  const res = await fetch(url);
  const body = (await res.json().catch(() => null)) as {
    data?: {
      is_valid?: boolean;
      expires_at?: number;
      data_access_expires_at?: number;
      type?: string;
      error?: { message?: string };
    };
    error?: { message?: string };
  } | null;

  if (!res.ok || !body?.data) {
    return {
      valid: false,
      expiresAt: null,
      isPage: false,
      error: body?.error?.message || "debug_token failed",
    };
  }
  const d = body.data;
  const expiresAt =
    d.expires_at && d.expires_at > 0
      ? d.expires_at
      : d.data_access_expires_at && d.data_access_expires_at > 0
        ? d.data_access_expires_at
        : null;
  return {
    valid: Boolean(d.is_valid),
    expiresAt: expiresAt && expiresAt > 1_000_000_000 ? expiresAt : null,
    isPage: String(d.type || "").toLowerCase() === "page",
  };
}

/**
 * Best-effort: turn whatever the user pasted into the longest-lived Page token.
 * Returns the token to store + expiry metadata.
 */
export async function hardenPageAccessToken(opts: {
  pageId: string;
  accessToken: string;
  /** Already-resolved Page token from /me/accounts */
  pageAccessToken: string;
}): Promise<{
  accessToken: string;
  expiresAt: number | null;
  neverExpires: boolean;
  note: string;
}> {
  const pageTok = opts.pageAccessToken.trim();
  const inputTok = opts.accessToken.trim();

  if (!canExtendFacebookTokens()) {
    return {
      accessToken: pageTok,
      expiresAt: null,
      neverExpires: false,
      note:
        "Token de Page guardado. Sin FACEBOOK_APP_ID/SECRET puede vencer (Graph Explorer). Agregá la App en Vercel para tokens permanentes.",
    };
  }

  // If input was a User token, extend it first then re-fetch Page token
  let workingUser = inputTok;
  let extended = false;
  const asPageProbe = await debugFacebookToken(pageTok);
  if (asPageProbe.valid && asPageProbe.isPage && !asPageProbe.expiresAt) {
    return {
      accessToken: pageTok,
      expiresAt: null,
      neverExpires: true,
      note: "Page token permanente (no vence).",
    };
  }

  // Try extending the pasted token (User) then resolve Page again
  const longLived = await exchangeLongLivedUserToken(workingUser);
  if (longLived.ok) {
    workingUser = longLived.accessToken;
    extended = true;
    // Re-resolve Page token from long-lived User
    const accUrl = new URL("https://graph.facebook.com/v21.0/me/accounts");
    accUrl.searchParams.set("fields", "id,name,access_token");
    accUrl.searchParams.set("access_token", workingUser);
    const accRes = await fetch(accUrl);
    const acc = (await accRes.json().catch(() => null)) as {
      data?: Array<{ id?: string; access_token?: string }>;
    } | null;
    const want = opts.pageId.replace(/\D/g, "");
    const match = (acc?.data || []).find(
      (p) => String(p.id || "").replace(/\D/g, "") === want,
    );
    if (match?.access_token) {
      const dbg = await debugFacebookToken(match.access_token);
      return {
        accessToken: match.access_token,
        expiresAt: dbg.expiresAt,
        neverExpires: Boolean(dbg.isPage && !dbg.expiresAt),
        note: dbg.isPage && !dbg.expiresAt
          ? "Page token permanente desde User token extendido (~60d → Page sin vencimiento)."
          : "Page token desde User extendido.",
      };
    }
  }

  // Fall back: try extending the page token itself (usually no-op / fails)
  if (!extended) {
    const dbg = await debugFacebookToken(pageTok);
    return {
      accessToken: pageTok,
      expiresAt: dbg.expiresAt,
      neverExpires: Boolean(dbg.isPage && !dbg.expiresAt),
      note: dbg.valid
        ? dbg.expiresAt
          ? `Page token vence ${new Date(dbg.expiresAt * 1000).toLocaleDateString()}.`
          : "Page token OK."
        : "Token podría estar vencido — reconectá.",
    };
  }

  return {
    accessToken: pageTok,
    expiresAt: null,
    neverExpires: false,
    note: "Se guardó Page token; no se pudo confirmar extensión.",
  };
}
